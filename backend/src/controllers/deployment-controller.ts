import { Request, Response } from 'express';
import { DeploymentService } from '../services/deployment-service';
import { AuditLogger } from '../services/audit-logger';
import { CaddyManager } from '../services/caddy-manager';
import { logger } from '../utils/logger';
import { getDatabase } from '../config/database';
import { Deployment, DomainRecord } from '../models/types';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const deploymentService = new DeploymentService();
const caddy = new CaddyManager();
const db = getDatabase();

export const deployProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, repositoryUrl, localPath, branch, domain, environmentVariables, buildCommand, startCommand, healthCheckPath } = req.body;

    // Validate required fields
    if (!name || !domain || !startCommand) {
      res.status(400).json({ error: 'Missing required fields: name, domain, startCommand' });
      return;
    }

    // Must have either repositoryUrl or localPath
    if (!repositoryUrl && !localPath) {
      res.status(400).json({ error: 'Either repositoryUrl or localPath is required' });
      return;
    }

    // If using Git, branch is required
    if (repositoryUrl && !branch) {
      res.status(400).json({ error: 'Branch is required for Git deployments' });
      return;
    }

    const result = await deploymentService.deployApplication({
      projectId: '',
      name,
      repositoryUrl,
      localPath,
      branch,
      domain,
      environmentVariables,
      buildCommand,
      startCommand,
      healthCheckPath,
    });

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Deployment controller error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listDeployments = async (req: Request, res: Response): Promise<void> => {
  try {
    const deployments = db
      .prepare('SELECT * FROM deployments ORDER BY created_at DESC')
      .all() as Deployment[];

    res.json(deployments);
  } catch (error) {
    logger.error(`List deployments error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const deployment = db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    res.json(deployment);
  } catch (error) {
    logger.error(`Get deployment error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const result = await deploymentService.deleteApplication(projectId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({ message: 'Deployment deleted successfully' });
  } catch (error) {
    logger.error(`Delete deployment error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const redeployProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const userId = (req as any).user?.id;

    const result = await deploymentService.redeployApplication(projectId, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Redeploy error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rollbackDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const { version } = req.body;
    const userId = (req as any).user?.id;

    const result = await deploymentService.rollbackApplication(projectId, version, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Rollback error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDeploymentHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const history = deploymentService.getDeploymentHistory(projectId);
    res.json(history);
  } catch (error) {
    logger.error(`Get deployment history error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDeploymentLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const lines = parseInt(req.query.lines as string) || 200;

    const deployment = db
      .prepare('SELECT process_id FROM deployments WHERE project_id = ?')
      .get(projectId) as { process_id: string } | undefined;

    if (!deployment?.process_id) {
      res.status(404).json({ error: 'Deployment or process not found' });
      return;
    }

    // Read PM2 log files — PM2 uses <name>-out-<instance>.log pattern
    const pm2LogDir = config.pm2.logDir;
    const processName = deployment.process_id;
    
    // Find log files matching the process name (instance number varies)
    const outLog = findPm2Log(pm2LogDir, processName, 'out');
    const errLog = findPm2Log(pm2LogDir, processName, 'error');

    const logs: { stdout: string; stderr: string } = { stdout: '', stderr: '' };

    if (outLog && fs.existsSync(outLog)) {
      logs.stdout = tailFile(outLog, lines);
    }
    if (errLog && fs.existsSync(errLog)) {
      logs.stderr = tailFile(errLog, lines);
    }

    res.json(logs);
  } catch (error) {
    logger.error(`Get deployment logs error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = projectId
      ? AuditLogger.getByProject(projectId, limit)
      : AuditLogger.getRecent(limit);

    res.json(logs);
  } catch (error) {
    logger.error(`Get audit logs error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEnvironmentVariables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const envVars = db
      .prepare('SELECT key, value FROM environment_variables WHERE project_id = ?')
      .all(projectId) as Array<{ key: string; value: string }>;

    const result: Record<string, string> = {};
    for (const ev of envVars) {
      result[ev.key] = ev.value;
    }
    res.json(result);
  } catch (error) {
    logger.error(`Get env vars error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateEnvironmentVariables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const envVars = req.body as Record<string, string>;

    if (!envVars || typeof envVars !== 'object') {
      res.status(400).json({ error: 'Body must be a key-value object' });
      return;
    }

    // Delete old and insert new
    db.prepare('DELETE FROM environment_variables WHERE project_id = ?').run(projectId);

    const stmt = db.prepare('INSERT INTO environment_variables (project_id, key, value) VALUES (?, ?, ?)');
    for (const [key, value] of Object.entries(envVars)) {
      stmt.run(projectId, key, String(value));
    }

    res.json({ message: 'Environment variables updated' });
  } catch (error) {
    logger.error(`Update env vars error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function tailFile(filePath: string, lines: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function findPm2Log(logDir: string, processName: string, type: 'out' | 'error'): string | null {
  try {
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir);
    // Match <processName>-<type>-<N>.log or <processName>-<type>.log
    const prefix = `${processName}-${type}`;
    const matches = files
      .filter((f) => f.startsWith(prefix) && f.endsWith('.log'))
      .map((f) => path.join(logDir, f));
    if (matches.length === 0) return null;
    // Return the most recently modified file
    return matches.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  } catch {
    return null;
  }
}

// Domain management

export const listDomains = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const deployment = db
      .prepare('SELECT project_id, port FROM deployments WHERE project_id = ?')
      .get(projectId) as { project_id: string; port: number } | undefined;

    if (!deployment) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    const domains = db
      .prepare('SELECT * FROM domains WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId) as DomainRecord[];

    res.json(domains);
  } catch (error) {
    logger.error(`List domains error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addDomain = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const { domain } = req.body;

    if (!domain || typeof domain !== 'string') {
      res.status(400).json({ error: 'domain is required' });
      return;
    }

    const domainClean = domain.trim().toLowerCase();

    // Validate domain format (basic)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(domainClean)) {
      res.status(400).json({ error: 'Invalid domain format' });
      return;
    }

    const deployment = db
      .prepare('SELECT project_id, port FROM deployments WHERE project_id = ?')
      .get(projectId) as { project_id: string; port: number } | undefined;

    if (!deployment) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    // Check domain uniqueness
    const existing = db
      .prepare('SELECT id FROM domains WHERE domain = ?')
      .get(domainClean);

    if (existing) {
      res.status(409).json({ error: `Domain '${domainClean}' is already in use` });
      return;
    }

    // Add Caddy reverse-proxy route
    try {
      await caddy.addRoute(domainClean, deployment.port);
    } catch (caddyErr) {
      logger.error(`Caddy addRoute failed for ${domainClean}: ${caddyErr}`);
      res.status(502).json({ error: `Failed to configure reverse proxy: ${caddyErr}` });
      return;
    }

    // Persist to DB
    db.prepare(
      'INSERT INTO domains (project_id, domain, ssl_enabled, ssl_auto) VALUES (?, ?, 0, 1)'
    ).run(projectId, domainClean);

    const record = db
      .prepare('SELECT * FROM domains WHERE project_id = ? AND domain = ?')
      .get(projectId, domainClean) as DomainRecord;

    AuditLogger.log(projectId, 'DOMAIN_ADDED', (req as any).user?.id, `Added domain ${domainClean}`);
    logger.info(`Domain ${domainClean} added for project ${projectId} -> port ${deployment.port}`);

    res.status(201).json(record);
  } catch (error) {
    logger.error(`Add domain error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeDomain = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;
    const domainId = parseInt(req.params.domainId as string, 10);

    if (isNaN(domainId)) {
      res.status(400).json({ error: 'Invalid domain ID' });
      return;
    }

    const record = db
      .prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?')
      .get(domainId, projectId) as DomainRecord | undefined;

    if (!record) {
      res.status(404).json({ error: 'Domain not found for this deployment' });
      return;
    }

    // Remove Caddy route
    try {
      await caddy.removeRoute(record.domain);
    } catch (caddyErr) {
      logger.warn(`Caddy removeRoute failed for ${record.domain}: ${caddyErr}`);
    }

    db.prepare('DELETE FROM domains WHERE id = ?').run(domainId);

    AuditLogger.log(projectId, 'DOMAIN_REMOVED', (req as any).user?.id, `Removed domain ${record.domain}`);
    logger.info(`Domain ${record.domain} removed for project ${projectId}`);

    res.json({ message: `Domain ${record.domain} removed` });
  } catch (error) {
    logger.error(`Remove domain error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};
