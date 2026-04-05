import pm2 from 'pm2';
import { ProcessConfig } from '../models/types';
import { logger } from '../utils/logger';

export class PM2Integration {
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          logger.error(`Failed to connect to PM2: ${err}`);
          reject(err);
        } else {
          this.connected = true;
          logger.info('Connected to PM2');
          resolve();
        }
      });
    });
  }

  async startProcess(processConfig: ProcessConfig): Promise<string> {
    await this.connect();

    return new Promise((resolve, reject) => {
      logger.info(`Starting process: ${processConfig.name}`);
      
      const pm2Config: pm2.StartOptions = {
        name: processConfig.name,
        script: processConfig.script,
        cwd: processConfig.cwd,
        env: processConfig.env,
        args: processConfig.args,
        interpreter: processConfig.interpreter,
        instances: processConfig.instances || 1,
        autorestart: processConfig.autorestart,
        max_restarts: processConfig.max_restarts,
      };

      pm2.start(pm2Config, (err) => {
        if (err) {
          logger.error(`Failed to start process ${processConfig.name}: ${err}`);
          reject(err);
        } else {
          logger.info(`Process ${processConfig.name} started successfully`);
          resolve(processConfig.name);
        }
      });
    });
  }

  async stopProcess(processId: string): Promise<void> {
    await this.connect();

    return new Promise((resolve, reject) => {
      logger.info(`Stopping process: ${processId}`);
      pm2.stop(processId, (err) => {
        if (err) {
          logger.error(`Failed to stop process ${processId}: ${err}`);
          reject(err);
        } else {
          logger.info(`Process ${processId} stopped`);
          resolve();
        }
      });
    });
  }

  async restartProcess(processId: string): Promise<void> {
    await this.connect();

    return new Promise((resolve, reject) => {
      logger.info(`Restarting process: ${processId}`);
      pm2.restart(processId, (err) => {
        if (err) {
          logger.error(`Failed to restart process ${processId}: ${err}`);
          reject(err);
        } else {
          logger.info(`Process ${processId} restarted`);
          resolve();
        }
      });
    });
  }

  async deleteProcess(processId: string): Promise<void> {
    await this.connect();

    return new Promise((resolve, reject) => {
      logger.info(`Deleting process: ${processId}`);
      pm2.delete(processId, (err) => {
        if (err) {
          logger.error(`Failed to delete process ${processId}: ${err}`);
          reject(err);
        } else {
          logger.info(`Process ${processId} deleted`);
          resolve();
        }
      });
    });
  }

  async getProcessStatus(processId: string): Promise<{
    state: string;
    uptime: number;
    cpu: number;
    memory: number;
  } | null> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.describe(processId, (err, processes) => {
        if (err) {
          logger.error(`Failed to get process status for ${processId}: ${err}`);
          resolve(null);
          return;
        }

        if (!processes || processes.length === 0) {
          resolve(null);
          return;
        }

        const proc = processes[0];
        const monit = proc.monit || { cpu: 0, memory: 0 };
        
        resolve({
          state: proc.pm2_env?.status || 'unknown',
          uptime: proc.pm2_env?.pm_uptime || 0,
          cpu: monit.cpu || 0,
          memory: monit.memory || 0,
        });
      });
    });
  }

  async listAllProcesses(): Promise<Array<{
    name: string;
    status: string;
    cpu: number;
    memory: number;
    uptime: number;
  }>> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.list((err, processes) => {
        if (err) {
          logger.error(`Failed to list processes: ${err}`);
          resolve([]);
          return;
        }

        const result = processes.map((proc) => ({
          name: proc.name || 'unknown',
          status: proc.pm2_env?.status || 'unknown',
          cpu: proc.monit?.cpu || 0,
          memory: proc.monit?.memory || 0,
          uptime: proc.pm2_env?.pm_uptime || 0,
        }));

        resolve(result);
      });
    });
  }

  disconnect(): void {
    if (this.connected) {
      pm2.disconnect();
      this.connected = false;
      logger.info('Disconnected from PM2');
    }
  }
}
