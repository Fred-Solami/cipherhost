import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDatabase } from '../config/database';
import { config as appConfig } from '../config';
import { logger } from '../utils/logger';
import {
  DeploymentConfig,
  DeploymentResult,
  ProcessConfig,
  ProjectType,
  Deployment,
  DeploymentHistory,
} from '../models/types';
import { PortManager } from './port-manager';
import { GitService } from './git-service';
import { ProjectDetector } from './project-detector';
import { EnvironmentBuilder } from './environment-builder';
import { PM2Integration } from './pm2-integration';
import { CaddyManager } from './caddy-manager';
import { HealthMonitor } from './health-monitor';
import { AuditLogger } from './audit-logger';
import { HostsManager } from './hosts-manager';

const execAsync = promisify(exec);

export class DeploymentService {
  private db = getDatabase();
  private portManager = new PortManager();
  private gitService = new GitService();
  private projectDetector = new ProjectDetector();
  private environmentBuilder = new EnvironmentBuilder();
  private pm2 = new PM2Integration();
  private caddy = new CaddyManager();
  private healthMonitor = new HealthMonitor();
  private hostsManager = new HostsManager();

  async deployApplication(deployConfig: DeploymentConfig): Promise<DeploymentResult> {
    const projectId = deployConfig.projectId || uuidv4();
    logger.info(`Starting deployment for project ${projectId}`);

    try {
      if (!this.validateDeploymentConfig(deployConfig)) {
        return {
          success: false,
          error: 'Invalid deployment configuration',
        };
      }

      const workDir = path.join(appConfig.deployment.appsBaseDir, projectId);

      // Handle Git or Local deployment
      if (deployConfig.repositoryUrl) {
        // Git deployment
        await this.gitService.cloneRepository(
          deployConfig.repositoryUrl,
          deployConfig.branch || 'main',
          workDir
        );
      } else if (deployConfig.localPath) {
        // Local folder deployment - copy files
        await this.copyLocalFolder(deployConfig.localPath, workDir);
      } else {
        return {
          success: false,
          error: 'Either repositoryUrl or localPath must be provided',
        };
      }

      const projectType = this.projectDetector.detectProjectType(workDir);
      if (projectType === 'UNKNOWN') {
        await this.cleanup(projectId, null, null, null);
        return {
          success: false,
          error: 'Unable to detect project type',
        };
      }

      if (projectType === 'NODEJS') {
        const validation = this.projectDetector.validateNodeJsProject(workDir);
        if (!validation.valid) {
          await this.cleanup(projectId, null, null, null);
          return {
            success: false,
            error: validation.error,
          };
        }
      }

      const buildResult = await this.environmentBuilder.buildEnvironment(workDir, projectType, deployConfig.buildCommand);
      if (!buildResult.success) {
        await this.cleanup(projectId, null, null, null);
        return {
          success: false,
          error: `Build failed: ${buildResult.error}`,
        };
      }

      // Insert deployment record FIRST so FK constraints are satisfied for port_registry
      this.saveDeploymentRecord(
        projectId,
        deployConfig,
        0, // placeholder port
        null,
        workDir,
        projectType,
        'DEPLOYING'
      );

      const port = this.portManager.allocatePort(projectId);
      if (!port) {
        await this.cleanup(projectId, null, null, null);
        return {
          success: false,
          error: 'No available ports in configured range',
        };
      }

      // Update deployment record with allocated port
      this.db.prepare('UPDATE deployments SET port = ? WHERE project_id = ?').run(port, projectId);

      const processConfig = this.createProcessConfig(
        { ...deployConfig, projectId },
        workDir,
        port,
        projectType
      );

      let processId: string;
      try {
        processId = await this.pm2.startProcess(processConfig);
      } catch (error) {
        await this.cleanup(projectId, port, null, null);
        return {
          success: false,
          error: `Failed to start process: ${error}`,
        };
      }

      try {
        await this.caddy.addRoute(deployConfig.domain, port);
      } catch (error) {
        await this.cleanup(projectId, port, processId, null);
        return {
          success: false,
          error: `Proxy configuration failed: ${error}`,
        };
      }

      // Update deployment record to RUNNING with process ID
      this.db
        .prepare('UPDATE deployments SET status = ?, process_id = ?, last_deployment = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run('RUNNING', processId, projectId);

      this.saveEnvironmentVariables(projectId, deployConfig.environmentVariables || {});

      // Start health monitoring for this deployment
      this.healthMonitor.startMonitoring(projectId);

      // Add hosts file entry for the domain
      this.hostsManager.addEntry(deployConfig.domain);

      // Record deployment history
      const commitHash = deployConfig.repositoryUrl
        ? await this.gitService.getCurrentCommit(workDir)
        : null;
      this.recordDeploymentHistory(projectId, commitHash, buildResult.buildLog || null, 'SUCCESS', 'deploy');

      // Audit log
      AuditLogger.log('deploy', projectId, null, `Deployed ${deployConfig.name} on port ${port}`);

      logger.info(`Deployment successful for project ${projectId}`);
      return {
        success: true,
        projectId,
        port,
        domain: deployConfig.domain,
      };
    } catch (error) {
      logger.error(`Deployment failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteApplication(projectId: string): Promise<{ success: boolean; error?: string }> {
    logger.info(`Deleting deployment ${projectId}`);

    const deployment = this.db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as any;

    if (!deployment) {
      return { success: false, error: 'Deployment not found' };
    }

    // 1. Stop health monitoring
    this.healthMonitor.stopMonitoring(projectId);

    // 2. Stop and delete PM2 process
    if (deployment.process_id) {
      try {
        await this.pm2.stopProcess(deployment.process_id);
        await this.pm2.deleteProcess(deployment.process_id);
      } catch (error) {
        logger.warn(`Failed to stop PM2 process ${deployment.process_id}: ${error}`);
      }
    }

    // 3. Remove Caddy route
    if (deployment.domain) {
      try {
        await this.caddy.removeRoute(deployment.domain);
      } catch (error) {
        logger.warn(`Failed to remove Caddy route for ${deployment.domain}: ${error}`);
      }
    }

    // 4. Release port
    if (deployment.port) {
      try {
        this.portManager.releasePort(deployment.port);
      } catch (error) {
        logger.warn(`Failed to release port ${deployment.port}: ${error}`);
      }
    }

    // 5. Delete app directory
    if (deployment.work_dir && fs.existsSync(deployment.work_dir)) {
      try {
        fs.rmSync(deployment.work_dir, { recursive: true, force: true });
        logger.info(`Deleted app directory: ${deployment.work_dir}`);
      } catch (error) {
        logger.warn(`Failed to delete app directory ${deployment.work_dir}: ${error}`);
      }
    }

    // 6. Delete database record (cascades to port_registry, environment_variables)
    this.db.prepare('DELETE FROM deployment_history WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM webhook_configs WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM deployments WHERE project_id = ?').run(projectId);

    // 7. Remove hosts file entry
    if (deployment.domain) {
      this.hostsManager.removeEntry(deployment.domain);
    }

    AuditLogger.log('delete', projectId, null, `Deleted deployment ${deployment.name}`);

    logger.info(`Deployment ${projectId} fully deleted`);
    return { success: true };
  }

  async redeployApplication(projectId: string, userId?: string): Promise<DeploymentResult> {
    logger.info(`Redeploying project ${projectId}`);

    const deployment = this.db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment) {
      return { success: false, error: 'Deployment not found' };
    }

    try {
      // 1. Snapshot current state
      await this.createSnapshot(projectId, deployment.work_dir);

      // 2. Stop health monitoring during redeploy
      this.healthMonitor.stopMonitoring(projectId);

      // 3. Update source (git pull or re-copy)
      if (deployment.repository_url && deployment.branch) {
        await this.gitService.pullLatest(deployment.work_dir, deployment.branch);
      } else if (deployment.local_path) {
        await this.copyLocalFolder(deployment.local_path, deployment.work_dir);
      }

      // 4. Rebuild
      const buildResult = await this.environmentBuilder.buildEnvironment(
        deployment.work_dir,
        deployment.project_type,
        deployment.build_command || undefined
      );

      if (!buildResult.success) {
        // Attempt to restore snapshot on build failure
        await this.restoreSnapshot(projectId, deployment.work_dir);
        this.healthMonitor.startMonitoring(projectId);
        const commitHash = deployment.repository_url
          ? await this.gitService.getCurrentCommit(deployment.work_dir)
          : null;
        this.recordDeploymentHistory(projectId, commitHash, buildResult.buildLog || null, 'FAILED', 'redeploy', userId);
        return { success: false, error: `Rebuild failed: ${buildResult.error}` };
      }

      // 5. Restart PM2 process
      if (deployment.process_id) {
        await this.pm2.restartProcess(deployment.process_id);
      }

      // 6. Update deployment record
      this.db
        .prepare('UPDATE deployments SET restart_count = 0, last_deployment = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run(projectId);

      // 7. Resume monitoring
      this.healthMonitor.startMonitoring(projectId);

      // 8. Record history
      const commitHash = deployment.repository_url
        ? await this.gitService.getCurrentCommit(deployment.work_dir)
        : null;
      this.recordDeploymentHistory(projectId, commitHash, buildResult.buildLog || null, 'SUCCESS', 'redeploy', userId);

      AuditLogger.log('redeploy', projectId, userId || null, 'Redeployment successful');

      return { success: true, projectId, port: deployment.port, domain: deployment.domain };
    } catch (error) {
      logger.error(`Redeploy failed for ${projectId}: ${error}`);
      this.healthMonitor.startMonitoring(projectId);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async rollbackApplication(projectId: string, targetVersion?: number, userId?: string): Promise<DeploymentResult> {
    logger.info(`Rolling back project ${projectId}${targetVersion ? ` to version ${targetVersion}` : ''}`);

    const deployment = this.db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment) {
      return { success: false, error: 'Deployment not found' };
    }

    // Find the snapshot to restore
    let historyEntry: DeploymentHistory | undefined;
    if (targetVersion) {
      historyEntry = this.db
        .prepare("SELECT * FROM deployment_history WHERE project_id = ? AND version = ? AND status = 'SUCCESS'")
        .get(projectId, targetVersion) as DeploymentHistory | undefined;
    } else {
      // Default: rollback to the last successful version before the current one
      historyEntry = this.db
        .prepare("SELECT * FROM deployment_history WHERE project_id = ? AND status = 'SUCCESS' ORDER BY version DESC LIMIT 1 OFFSET 1")
        .get(projectId) as DeploymentHistory | undefined;
    }

    if (!historyEntry || !historyEntry.snapshot_path) {
      return { success: false, error: 'No snapshot available to rollback to' };
    }

    if (!fs.existsSync(historyEntry.snapshot_path)) {
      return { success: false, error: `Snapshot directory missing: ${historyEntry.snapshot_path}` };
    }

    try {
      this.healthMonitor.stopMonitoring(projectId);

      // Restore snapshot
      if (fs.existsSync(deployment.work_dir)) {
        fs.rmSync(deployment.work_dir, { recursive: true, force: true });
      }

      await execAsync(
        `robocopy "${historyEntry.snapshot_path}" "${deployment.work_dir}" /E /NFL /NDL /NJH /NJS`,
        { shell: 'cmd.exe' }
      ).catch((err: any) => {
        if (err.code && err.code >= 8) throw err;
      });

      // Restart process
      if (deployment.process_id) {
        await this.pm2.restartProcess(deployment.process_id);
      }

      this.db
        .prepare('UPDATE deployments SET restart_count = 0, last_deployment = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run(projectId);

      this.healthMonitor.startMonitoring(projectId);

      // Mark old history entries as rolled back
      this.db
        .prepare("UPDATE deployment_history SET status = 'ROLLED_BACK' WHERE project_id = ? AND version > ?")
        .run(projectId, historyEntry.version);

      this.recordDeploymentHistory(projectId, historyEntry.commit_hash, null, 'SUCCESS', `rollback-to-v${historyEntry.version}`, userId);

      AuditLogger.log('rollback', projectId, userId || null, `Rolled back to version ${historyEntry.version}`);

      return { success: true, projectId, port: deployment.port, domain: deployment.domain };
    } catch (error) {
      logger.error(`Rollback failed for ${projectId}: ${error}`);
      this.healthMonitor.startMonitoring(projectId);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  getDeploymentHistory(projectId: string): DeploymentHistory[] {
    return this.db
      .prepare('SELECT * FROM deployment_history WHERE project_id = ? ORDER BY version DESC')
      .all(projectId) as DeploymentHistory[];
  }

  private async createSnapshot(projectId: string, workDir: string): Promise<string | null> {
    if (!fs.existsSync(workDir)) return null;

    const snapshotsDir = appConfig.deployment.snapshotsDir;
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(snapshotsDir, `${projectId}_${timestamp}`);

    try {
      const excludeDirs = 'node_modules .git venv __pycache__ bin obj';
      await execAsync(
        `robocopy "${workDir}" "${snapshotPath}" /E /NFL /NDL /NJH /NJS /XD ${excludeDirs}`,
        { shell: 'cmd.exe' }
      ).catch((err: any) => {
        if (err.code && err.code >= 8) throw err;
      });
      logger.info(`Snapshot created at ${snapshotPath}`);
      return snapshotPath;
    } catch (error) {
      logger.warn(`Failed to create snapshot for ${projectId}: ${error}`);
      return null;
    }
  }

  private async restoreSnapshot(projectId: string, workDir: string): Promise<void> {
    // Find the latest snapshot for this project
    const snapshotsDir = appConfig.deployment.snapshotsDir;
    if (!fs.existsSync(snapshotsDir)) return;

    const snapshots = fs.readdirSync(snapshotsDir)
      .filter(name => name.startsWith(`${projectId}_`))
      .sort()
      .reverse();

    if (snapshots.length === 0) return;

    const latestSnapshot = path.join(snapshotsDir, snapshots[0]);
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }

    await execAsync(
      `robocopy "${latestSnapshot}" "${workDir}" /E /NFL /NDL /NJH /NJS`,
      { shell: 'cmd.exe' }
    ).catch((err: any) => {
      if (err.code && err.code >= 8) throw err;
    });

    logger.info(`Restored snapshot for ${projectId}`);
  }

  private recordDeploymentHistory(
    projectId: string,
    commitHash: string | null,
    buildLog: string | null,
    status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK',
    triggeredBy: string,
    userId?: string | null
  ): void {
    const lastVersion = this.db
      .prepare('SELECT MAX(version) as maxVer FROM deployment_history WHERE project_id = ?')
      .get(projectId) as { maxVer: number | null } | undefined;

    const nextVersion = (lastVersion?.maxVer || 0) + 1;

    // Get latest snapshot path
    const snapshotsDir = appConfig.deployment.snapshotsDir;
    let snapshotPath: string | null = null;
    if (fs.existsSync(snapshotsDir)) {
      const snapshots = fs.readdirSync(snapshotsDir)
        .filter(name => name.startsWith(`${projectId}_`))
        .sort()
        .reverse();
      if (snapshots.length > 0) {
        snapshotPath = path.join(snapshotsDir, snapshots[0]);
      }
    }

    this.db.prepare(
      `INSERT INTO deployment_history (project_id, version, commit_hash, snapshot_path, build_log, status, triggered_by, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(projectId, nextVersion, commitHash, snapshotPath, buildLog, status, triggeredBy, userId || null);
  }

  private validateDeploymentConfig(config: DeploymentConfig): boolean {
    // Must have either repositoryUrl or localPath
    if (!config.repositoryUrl && !config.localPath) {
      logger.error('Either repositoryUrl or localPath is required');
      return false;
    }

    // If using Git, validate URL and branch
    if (config.repositoryUrl) {
      if (!this.gitService.validateGitUrl(config.repositoryUrl)) {
        logger.error('Invalid repository URL');
        return false;
      }

      if (!config.branch) {
        logger.error('Branch is required for Git deployments');
        return false;
      }
    }

    // If using local path, validate it exists and is not a path traversal attack
    if (config.localPath) {
      const resolvedPath = path.resolve(config.localPath);

      // Block system-critical directories
      const blockedPrefixes = [
        'C:\\Windows',
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\ProgramData',
      ].map(p => p.toLowerCase());

      if (blockedPrefixes.some(prefix => resolvedPath.toLowerCase().startsWith(prefix))) {
        logger.error(`Blocked path traversal attempt: ${resolvedPath}`);
        return false;
      }

      // Prevent copying from within the CipherHost apps directory itself
      const appsDir = path.resolve(appConfig.deployment.appsBaseDir).toLowerCase();
      if (resolvedPath.toLowerCase().startsWith(appsDir)) {
        logger.error(`Cannot deploy from within the apps directory: ${resolvedPath}`);
        return false;
      }

      if (!fs.existsSync(resolvedPath)) {
        logger.error(`Local path does not exist: ${resolvedPath}`);
        return false;
      }
    }

    if (!config.domain) {
      logger.error('Domain is required');
      return false;
    }

    if (!config.startCommand) {
      logger.error('Start command is required');
      return false;
    }

    const existing = this.db
      .prepare('SELECT project_id FROM deployments WHERE domain = ?')
      .get(config.domain);

    if (existing) {
      logger.error(`Domain ${config.domain} already in use`);
      return false;
    }

    return true;
  }

  private createProcessConfig(
    deployConfig: DeploymentConfig,
    workDir: string,
    port: number,
    projectType: ProjectType
  ): ProcessConfig {
    const env = {
      ...deployConfig.environmentVariables,
      HOST: '127.0.0.1',
      PORT: port.toString(),
    };

    if (deployConfig.startCommand.includes('0.0.0.0')) {
      throw new Error('Applications must bind to localhost (127.0.0.1) only, not 0.0.0.0');
    }

    let script = deployConfig.startCommand;
    let interpreter: string | undefined;
    let args: string[] | undefined;

    // Split "node server.js" or "python app.py" into interpreter + script
    const parts = script.split(/\s+/);
    if (parts.length > 1 && ['node', 'python', 'python3'].includes(parts[0].toLowerCase())) {
      script = parts[1];
      args = parts.slice(2);
    }

    if (projectType === 'PYTHON') {
      const venvPython = path.join(workDir, 'venv', 'Scripts', 'python.exe');
      interpreter = venvPython;
    }

    return {
      name: deployConfig.projectId,
      script,
      cwd: workDir,
      env,
      args,
      interpreter,
      autorestart: false,
      max_restarts: 0,
    };
  }

  private saveDeploymentRecord(
    projectId: string,
    deployConfig: DeploymentConfig,
    port: number,
    processId: string | null,
    workDir: string,
    projectType: ProjectType,
    status: string = 'RUNNING'
  ): void {
    this.db
      .prepare(
        `INSERT INTO deployments (
          project_id, name, repository_url, local_path, branch, domain, port, process_id,
          status, start_command, build_command, health_check_path, project_type, work_dir
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projectId,
        deployConfig.name,
        deployConfig.repositoryUrl || null,
        deployConfig.localPath || null,
        deployConfig.branch || null,
        deployConfig.domain,
        port,
        processId,
        status,
        deployConfig.startCommand,
        deployConfig.buildCommand || null,
        deployConfig.healthCheckPath || '/',
        projectType,
        workDir
      );

    logger.info(`Deployment record saved for project ${projectId}`);
  }

  private saveEnvironmentVariables(
    projectId: string,
    envVars: Record<string, string>
  ): void {
    const stmt = this.db.prepare(
      'INSERT INTO environment_variables (project_id, key, value) VALUES (?, ?, ?)'
    );

    for (const [key, value] of Object.entries(envVars)) {
      stmt.run(projectId, key, value);
    }
  }

  private async copyLocalFolder(sourcePath: string, targetPath: string): Promise<void> {
    const { promisify } = require('util');
    const { exec } = require('child_process');
    const execAsync = promisify(exec);

    logger.info(`Copying local folder from ${sourcePath} to ${targetPath}`);

    try {
      // Remove target if it exists
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      // Create parent directory
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Use robocopy on Windows for efficient copying
      // /E = copy subdirectories including empty ones
      // /NFL = no file list (less verbose)
      // /NDL = no directory list
      // /NJH = no job header
      // /NJS = no job summary
      // /XD = exclude directories (node_modules, .git, etc.)
      const excludeDirs = 'node_modules .git .venv venv __pycache__ bin obj';
      await execAsync(
        `robocopy "${sourcePath}" "${targetPath}" /E /NFL /NDL /NJH /NJS /XD ${excludeDirs}`,
        { shell: 'cmd.exe' }
      ).catch((err: any) => {
        // Robocopy exit codes: 0-7 are success, 8+ are errors
        if (err.code && err.code >= 8) {
          throw err;
        }
      });

      logger.info(`Local folder copied successfully to ${targetPath}`);
    } catch (error) {
      logger.error(`Failed to copy local folder: ${error}`);
      throw new Error(`Failed to copy local folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cleanup(
    projectId: string,
    port: number | null,
    processId: string | null,
    domain: string | null
  ): Promise<void> {
    logger.info(`Cleaning up resources for project ${projectId}`);

    if (processId) {
      try {
        await this.pm2.stopProcess(processId);
        await this.pm2.deleteProcess(processId);
      } catch (error) {
        logger.error(`Failed to cleanup PM2 process: ${error}`);
      }
    }

    if (domain) {
      try {
        await this.caddy.removeRoute(domain);
      } catch (error) {
        logger.error(`Failed to remove Caddy route: ${error}`);
      }
    }

    if (port) {
      try {
        this.portManager.releasePort(port);
      } catch (error) {
        logger.error(`Failed to release port: ${error}`);
      }
    }

    // Clean up app directory
    const workDir = path.join(appConfig.deployment.appsBaseDir, projectId);
    if (fs.existsSync(workDir)) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to cleanup work directory: ${error}`);
      }
    }

    // Remove deployment record if it exists
    this.db.prepare('DELETE FROM deployments WHERE project_id = ?').run(projectId);
  }
}
