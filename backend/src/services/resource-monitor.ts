import { PM2Integration } from './pm2-integration';
import { getDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuditLogger } from './audit-logger';
import { notificationService } from './notification-service';

export interface ResourceLimits {
  maxMemoryMB: number | null;
  maxRestarts: number;
}

export interface ResourceSnapshot {
  projectId: string;
  name: string;
  cpu: number;
  memoryMB: number;
  memoryLimitMB: number | null;
  memoryPercent: number | null;
  uptime: number;
  status: string;
  restarts: number;
}

export interface SystemResources {
  totalMemoryMB: number;
  freeMemoryMB: number;
  usedMemoryMB: number;
  usedPercent: number;
  cpuCount: number;
  uptimeSeconds: number;
  apps: ResourceSnapshot[];
}

/**
 * Monitors resource usage across all managed processes and enforces limits.
 *
 * How it works:
 * - Polls PM2 for cpu/memory of each running process at a configurable interval.
 * - If a process exceeds its memory limit, it is stopped and marked CRASHED.
 * - Stores per-deployment limits in the `resource_limits` table.
 * - PM2's `max_memory_restart` is set on process start for hard enforcement;
 *   this monitor provides the soft layer: logging, alerts, and proactive stop.
 */
export class ResourceMonitor {
  private pm2 = new PM2Integration();
  private db = getDatabase();
  private pollTimer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs: number = 15000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start the resource polling loop.
   */
  start(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(async () => {
      try {
        await this.poll();
      } catch (error) {
        logger.error(`Resource poll error: ${error}`);
      }
    }, this.pollIntervalMs);

    logger.info(`Resource monitor started (interval: ${this.pollIntervalMs}ms)`);
  }

  /**
   * Stop the resource polling loop.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info('Resource monitor stopped');
    }
  }

  /**
   * Single poll: get resource usage for all processes and enforce limits.
   */
  async poll(): Promise<ResourceSnapshot[]> {
    const processes = await this.pm2.listAllProcesses();
    const snapshots: ResourceSnapshot[] = [];

    // Map PM2 process names to deployment records
    const deployments = this.db
      .prepare("SELECT project_id, name, process_id FROM deployments WHERE status = 'RUNNING'")
      .all() as Array<{ project_id: string; name: string; process_id: string }>;

    const deploymentByProcess = new Map<string, { project_id: string; name: string }>();
    for (const d of deployments) {
      if (d.process_id) {
        deploymentByProcess.set(d.process_id, { project_id: d.project_id, name: d.name });
      }
    }

    for (const proc of processes) {
      const dep = deploymentByProcess.get(proc.name);
      if (!dep) continue;

      const limits = this.getLimits(dep.project_id);
      const memMB = Math.round(proc.memory / (1024 * 1024));

      const snapshot: ResourceSnapshot = {
        projectId: dep.project_id,
        name: dep.name,
        cpu: proc.cpu,
        memoryMB: memMB,
        memoryLimitMB: limits.maxMemoryMB,
        memoryPercent: limits.maxMemoryMB ? Math.round((memMB / limits.maxMemoryMB) * 100) : null,
        uptime: proc.uptime,
        status: proc.status,
        restarts: 0,
      };

      snapshots.push(snapshot);

      // Enforce memory limit
      if (limits.maxMemoryMB && memMB > limits.maxMemoryMB) {
        logger.warn(
          `Process ${dep.name} exceeded memory limit: ${memMB}MB / ${limits.maxMemoryMB}MB. Stopping.`
        );

        try {
          await this.pm2.stopProcess(proc.name);

          this.db
            .prepare("UPDATE deployments SET status = 'CRASHED' WHERE project_id = ?")
            .run(dep.project_id);

          AuditLogger.log(
            'resource_limit',
            dep.project_id,
            null,
            `Stopped: memory ${memMB}MB exceeded limit ${limits.maxMemoryMB}MB`
          );

          notificationService.alertMemoryExceeded(
            dep.name,
            dep.project_id,
            memMB,
            limits.maxMemoryMB
          );
        } catch (error) {
          logger.error(`Failed to stop over-limit process ${dep.name}: ${error}`);
        }
      }
    }

    return snapshots;
  }

  /**
   * Get resource limits for a deployment.
   */
  getLimits(projectId: string): ResourceLimits {
    const row = this.db
      .prepare('SELECT max_memory_mb, max_restarts FROM resource_limits WHERE project_id = ?')
      .get(projectId) as { max_memory_mb: number | null; max_restarts: number } | undefined;

    return {
      maxMemoryMB: row?.max_memory_mb ?? null,
      maxRestarts: row?.max_restarts ?? config.deployment.maxAutoRestarts,
    };
  }

  /**
   * Set resource limits for a deployment.
   */
  setLimits(projectId: string, limits: Partial<ResourceLimits>): void {
    const current = this.getLimits(projectId);

    this.db
      .prepare(
        `INSERT INTO resource_limits (project_id, max_memory_mb, max_restarts)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           max_memory_mb = excluded.max_memory_mb,
           max_restarts = excluded.max_restarts`
      )
      .run(
        projectId,
        limits.maxMemoryMB !== undefined ? limits.maxMemoryMB : current.maxMemoryMB,
        limits.maxRestarts !== undefined ? limits.maxRestarts : current.maxRestarts
      );

    logger.info(`Resource limits updated for ${projectId}: mem=${limits.maxMemoryMB}MB, restarts=${limits.maxRestarts}`);
  }

  /**
   * Get system-wide resource overview.
   */
  async getSystemResources(): Promise<SystemResources> {
    const os = await import('os');

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const apps = await this.poll();

    return {
      totalMemoryMB: Math.round(totalMem / (1024 * 1024)),
      freeMemoryMB: Math.round(freeMem / (1024 * 1024)),
      usedMemoryMB: Math.round(usedMem / (1024 * 1024)),
      usedPercent: Math.round((usedMem / totalMem) * 100),
      cpuCount: os.cpus().length,
      uptimeSeconds: Math.round(os.uptime()),
      apps,
    };
  }
}
