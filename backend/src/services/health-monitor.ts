import axios from 'axios';
import { getDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PM2Integration } from './pm2-integration';
import { Deployment, HealthStatus } from '../models/types';

export class HealthMonitor {
  private db = getDatabase();
  private pm2 = new PM2Integration();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  startMonitoring(projectId: string, interval: number = config.deployment.healthCheckInterval): void {
    if (this.intervals.has(projectId)) {
      logger.debug(`Health monitoring already active for ${projectId}`);
      return;
    }

    logger.info(`Starting health monitoring for ${projectId} (interval: ${interval}ms)`);

    const intervalId = setInterval(async () => {
      await this.checkHealth(projectId);
    }, interval);

    this.intervals.set(projectId, intervalId);
  }

  stopMonitoring(projectId: string): void {
    const intervalId = this.intervals.get(projectId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(projectId);
      logger.info(`Stopped health monitoring for ${projectId}`);
    }
  }

  /**
   * Resume monitoring for all RUNNING deployments (called on server startup).
   */
  resumeAllMonitors(): void {
    const deployments = this.db
      .prepare("SELECT project_id FROM deployments WHERE status = 'RUNNING'")
      .all() as Array<{ project_id: string }>;

    logger.info(`Resuming health monitors for ${deployments.length} running deployment(s)`);

    for (const d of deployments) {
      this.startMonitoring(d.project_id);
    }
  }

  async checkHealth(projectId: string): Promise<HealthStatus> {
    try {
      const deployment = this.db
        .prepare('SELECT * FROM deployments WHERE project_id = ?')
        .get(projectId) as Deployment | undefined;

      if (!deployment) {
        return { type: 'NoAction', message: 'Project not found' };
      }

      if (!deployment.process_id) {
        return { type: 'NoAction', message: 'No process ID' };
      }

      // 1. PM2 process-level check
      const processStatus = await this.pm2.getProcessStatus(deployment.process_id);

      if (!processStatus) {
        return { type: 'Error', message: 'Unable to get process status' };
      }

      if (processStatus.state === 'stopped' || processStatus.state === 'errored') {
        return await this.handleCrashedProcess(deployment);
      }

      // 2. HTTP health check (only if process is online and path is configured)
      if (deployment.health_check_path && deployment.port) {
        const httpOk = await this.httpHealthCheck(deployment.port, deployment.health_check_path);
        if (!httpOk) {
          logger.warn(`HTTP health check failed for ${projectId} at :${deployment.port}${deployment.health_check_path}`);
          return { type: 'Alert', message: 'HTTP health check failed but process is still running' };
        }
      }

      return { type: 'NoAction', message: 'Process healthy' };
    } catch (error) {
      logger.error(`Health check failed for ${projectId}: ${error}`);
      return { type: 'Error', message: `Health check failed: ${error}` };
    }
  }

  private async httpHealthCheck(port: number, path: string): Promise<boolean> {
    try {
      const url = `http://127.0.0.1:${port}${path}`;
      const resp = await axios.get(url, { timeout: 5000, validateStatus: () => true });
      return resp.status >= 200 && resp.status < 500;
    } catch {
      return false;
    }
  }

  private async handleCrashedProcess(deployment: Deployment): Promise<HealthStatus> {
    const maxRestarts = config.deployment.maxAutoRestarts;

    if (deployment.restart_count >= maxRestarts) {
      logger.warn(
        `Project ${deployment.project_id} exceeded max restart limit (${maxRestarts})`
      );
      
      this.db
        .prepare('UPDATE deployments SET status = ? WHERE project_id = ?')
        .run('CRASHED', deployment.project_id);

      return {
        type: 'Alert',
        message: `Max restarts exceeded (${maxRestarts})`,
      };
    }

    try {
      logger.info(`Attempting to restart process ${deployment.process_id}`);
      
      await this.pm2.restartProcess(deployment.process_id!);

      this.db
        .prepare(
          'UPDATE deployments SET restart_count = restart_count + 1, last_restart = CURRENT_TIMESTAMP WHERE project_id = ?'
        )
        .run(deployment.project_id);

      logger.info(`Process ${deployment.process_id} restarted successfully`);

      return {
        type: 'Restarted',
        message: 'Process restarted successfully',
      };
    } catch (error) {
      logger.error(`Failed to restart process ${deployment.process_id}: ${error}`);
      
      this.db
        .prepare('UPDATE deployments SET status = ? WHERE project_id = ?')
        .run('CRASHED', deployment.project_id);

      return {
        type: 'Error',
        message: `Restart failed: ${error}`,
      };
    }
  }

  stopAll(): void {
    logger.info('Stopping all health monitors');
    for (const [projectId, intervalId] of this.intervals.entries()) {
      clearInterval(intervalId);
      logger.debug(`Stopped monitoring for ${projectId}`);
    }
    this.intervals.clear();
  }
}
