import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  name: string;
  startType: string | null;
  account: string | null;
  pid: number | null;
}

const SERVICE_NAME = 'CipherHost';
const SERVICE_DISPLAY = 'CipherHost Deployment Controller';
const SERVICE_DESCRIPTION = 'CipherHost deployment orchestration platform for Windows Server';

/**
 * Manages CipherHost as a Windows Service using node-windows.
 *
 * Architecture: node-windows creates a small .exe wrapper that runs
 * the Node.js entry point as a proper Windows Service (SCM-registered).
 * The wrapper handles start/stop signals, crash recovery, and logging.
 */
export class WindowsServiceManager {
  private scriptPath: string;

  constructor() {
    // Point to the compiled JS entry point, not the TS source
    this.scriptPath = path.resolve(__dirname, '../../dist/index.js');
  }

  /**
   * Install CipherHost as a Windows Service.
   * Requires elevated (admin) privileges.
   */
  async install(): Promise<{ success: boolean; error?: string }> {
    try {
      const status = await this.getStatus();
      if (status.installed) {
        return { success: false, error: 'Service is already installed' };
      }

      // Verify compiled output exists
      const fs = await import('fs');
      if (!fs.existsSync(this.scriptPath)) {
        return {
          success: false,
          error: `Compiled entry point not found at ${this.scriptPath}. Run "npm run build" first.`,
        };
      }

      const { Service } = await import('node-windows');
      const svc = new Service({
        name: SERVICE_NAME,
        description: SERVICE_DESCRIPTION,
        script: this.scriptPath,
        env: [
          { name: 'NODE_ENV', value: 'production' },
          { name: 'PORT', value: process.env.PORT || '3000' },
          { name: 'CIPHERHOST_ROOT', value: path.resolve(__dirname, '../..') },
        ],
      });

      return new Promise((resolve) => {
        svc.on('install', () => {
          logger.info('CipherHost Windows Service installed');
          svc.start();
          resolve({ success: true });
        });

        svc.on('alreadyinstalled', () => {
          resolve({ success: false, error: 'Service is already installed' });
        });

        svc.on('error', (err: Error) => {
          logger.error(`Service install failed: ${err.message}`);
          resolve({ success: false, error: err.message });
        });

        svc.install();
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Service install error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Uninstall the CipherHost Windows Service.
   * Requires elevated (admin) privileges.
   */
  async uninstall(): Promise<{ success: boolean; error?: string }> {
    try {
      const status = await this.getStatus();
      if (!status.installed) {
        return { success: false, error: 'Service is not installed' };
      }

      const { Service } = await import('node-windows');
      const svc = new Service({
        name: SERVICE_NAME,
        script: this.scriptPath,
      });

      return new Promise((resolve) => {
        svc.on('uninstall', () => {
          logger.info('CipherHost Windows Service uninstalled');
          resolve({ success: true });
        });

        svc.on('error', (err: Error) => {
          logger.error(`Service uninstall failed: ${err.message}`);
          resolve({ success: false, error: err.message });
        });

        svc.uninstall();
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * Start the Windows Service.
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`sc start "${SERVICE_NAME}"`);
      logger.info('CipherHost service started');
      return { success: true };
    } catch (error: any) {
      const msg = error.stderr || error.message;
      return { success: false, error: msg };
    }
  }

  /**
   * Stop the Windows Service.
   */
  async stop(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`sc stop "${SERVICE_NAME}"`);
      logger.info('CipherHost service stopped');
      return { success: true };
    } catch (error: any) {
      const msg = error.stderr || error.message;
      return { success: false, error: msg };
    }
  }

  /**
   * Restart the Windows Service (stop then start).
   */
  async restart(): Promise<{ success: boolean; error?: string }> {
    const stopResult = await this.stop();
    if (!stopResult.success && !stopResult.error?.includes('not been started')) {
      return stopResult;
    }
    // Brief delay for service to fully stop
    await new Promise((r) => setTimeout(r, 2000));
    return this.start();
  }

  /**
   * Query current service status via `sc query`.
   * Works without admin privileges.
   */
  async getStatus(): Promise<ServiceStatus> {
    const result: ServiceStatus = {
      installed: false,
      running: false,
      name: SERVICE_NAME,
      startType: null,
      account: null,
      pid: null,
    };

    try {
      const { stdout } = await execAsync(`sc query "${SERVICE_NAME}"`);

      result.installed = true;
      result.running = stdout.includes('RUNNING');

      // Parse PID
      const pidMatch = stdout.match(/PID\s*:\s*(\d+)/);
      if (pidMatch) {
        result.pid = parseInt(pidMatch[1], 10);
      }
    } catch {
      // sc query fails if service doesn't exist => not installed
      return result;
    }

    // Get start type and logon account
    try {
      const { stdout } = await execAsync(`sc qc "${SERVICE_NAME}"`);

      const startTypeMatch = stdout.match(/START_TYPE\s*:\s*\d+\s+(\S+)/);
      if (startTypeMatch) {
        result.startType = startTypeMatch[1];
      }

      const accountMatch = stdout.match(/SERVICE_START_NAME\s*:\s*(.+)/);
      if (accountMatch) {
        result.account = accountMatch[1].trim();
      }
    } catch {
      // Non-critical
    }

    return result;
  }
}
