import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notificationService } from './notification-service';

const execAsync = promisify(exec);

export interface BackupMetadata {
  id: string;
  filename: string;
  path: string;
  sizeBytes: number;
  type: 'scheduled' | 'manual' | 'pre-update';
  createdAt: string;
}

export interface BackupConfig {
  enabled: boolean;
  backupDir: string;
  networkSharePath: string | null;
  retentionCount: number;
  intervalHours: number;
}

interface ExportedConfig {
  version: string;
  exportedAt: string;
  deployments: any[];
  environmentVariables: any[];
  webhookConfigs: any[];
  domains: any[];
  users: Array<{ username: string; role: string }>;
}

/**
 * Manages backup and disaster recovery for CipherHost.
 *
 * Two backup strategies:
 * 1. SQLite file copy: Binary copy of the database file (fast, exact replica).
 *    SQLite in WAL mode allows safe reads while the server is running.
 *    We use the SQLite backup API via `VACUUM INTO` for a consistent copy.
 *
 * 2. Config export: JSON export of all deployment configs, env vars, webhooks,
 *    and domains. This is portable and can be imported to a fresh instance.
 */
export class BackupManager {
  private backupDir: string;
  private retentionCount: number;
  private intervalHours: number;
  private scheduledTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDir = config.backup?.backupDir || path.join(__dirname, '../../data/backups');
    this.retentionCount = config.backup?.retentionCount || 10;
    this.intervalHours = config.backup?.intervalHours || 6;
  }

  /**
   * Initialize backup directory and start scheduled backups if enabled.
   */
  init(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    logger.info(`Backup directory: ${this.backupDir}`);
  }

  /**
   * Start automatic scheduled backups.
   */
  startScheduled(): void {
    if (this.scheduledTimer) return;

    const intervalMs = this.intervalHours * 60 * 60 * 1000;

    this.scheduledTimer = setInterval(async () => {
      try {
        const backup = await this.createBackup('scheduled');
        logger.info('Scheduled backup completed');
        notificationService.alertBackupCompleted(backup.filename, backup.sizeBytes / 1024);
      } catch (error) {
        logger.error(`Scheduled backup failed: ${error}`);
        notificationService.alertBackupFailed(String(error));
      }
    }, intervalMs);

    logger.info(`Scheduled backups enabled (every ${this.intervalHours}h, retain ${this.retentionCount})`);
  }

  /**
   * Stop scheduled backups.
   */
  stopScheduled(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
      logger.info('Scheduled backups stopped');
    }
  }

  /**
   * Create a backup of the SQLite database.
   * Uses `VACUUM INTO` for a consistent snapshot even while the server is running.
   */
  async createBackup(type: 'scheduled' | 'manual' | 'pre-update' = 'manual'): Promise<BackupMetadata> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cipherhost_${type}_${timestamp}.db`;
    const backupPath = path.join(this.backupDir, filename);

    try {
      const db = getDatabase();

      // VACUUM INTO creates a clean, defragmented copy without locking the main DB
      db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);

      const stats = fs.statSync(backupPath);

      const metadata: BackupMetadata = {
        id: timestamp,
        filename,
        path: backupPath,
        sizeBytes: stats.size,
        type,
        createdAt: new Date().toISOString(),
      };

      // Write metadata sidecar
      fs.writeFileSync(`${backupPath}.meta.json`, JSON.stringify(metadata, null, 2));

      logger.info(`Backup created: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

      // Copy to network share if configured
      if (config.backup?.networkSharePath) {
        await this.copyToNetworkShare(backupPath, filename);
      }

      // Enforce retention policy
      this.enforceRetention();

      return metadata;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Backup failed: ${msg}`);
      throw new Error(`Backup failed: ${msg}`);
    }
  }

  /**
   * List all available backups, newest first.
   */
  listBackups(): BackupMetadata[] {
    if (!fs.existsSync(this.backupDir)) return [];

    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.db') && f.startsWith('cipherhost_'))
      .sort()
      .reverse();

    return files.map(filename => {
      const metaPath = path.join(this.backupDir, `${filename}.meta.json`);
      if (fs.existsSync(metaPath)) {
        try {
          return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BackupMetadata;
        } catch {
          // Fall through to manual construction
        }
      }

      const filePath = path.join(this.backupDir, filename);
      const stats = fs.statSync(filePath);
      return {
        id: filename.replace('.db', ''),
        filename,
        path: filePath,
        sizeBytes: stats.size,
        type: 'manual' as const,
        createdAt: stats.mtime.toISOString(),
      };
    });
  }

  /**
   * Restore from a backup file.
   * DANGEROUS: This replaces the current database. The server should be restarted after.
   */
  async restoreFromBackup(backupFilename: string): Promise<{ success: boolean; error?: string }> {
    const backupPath = path.join(this.backupDir, backupFilename);

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: `Backup file not found: ${backupFilename}` };
    }

    // Validate the filename to prevent path traversal
    if (backupFilename.includes('..') || backupFilename.includes('/') || backupFilename.includes('\\')) {
      return { success: false, error: 'Invalid backup filename' };
    }

    const dbPath = config.database.path;

    try {
      // Create a safety backup of current DB before restoring
      await this.createBackup('pre-update');

      // Close current DB connection
      const { closeDatabase } = await import('../config/database');
      closeDatabase();

      // Replace database file
      fs.copyFileSync(backupPath, dbPath);

      // Also copy WAL/SHM if they exist in backup
      if (fs.existsSync(`${backupPath}-wal`)) {
        fs.copyFileSync(`${backupPath}-wal`, `${dbPath}-wal`);
      }
      if (fs.existsSync(`${backupPath}-shm`)) {
        fs.copyFileSync(`${backupPath}-shm`, `${dbPath}-shm`);
      }

      logger.info(`Database restored from backup: ${backupFilename}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Restore failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Export all deployment configurations as a portable JSON file.
   * This can be used to recreate deployments on a fresh CipherHost instance.
   */
  exportConfig(): ExportedConfig {
    const db = getDatabase();

    const deployments = db.prepare(
      'SELECT project_id, name, repository_url, local_path, branch, domain, port, start_command, build_command, health_check_path, project_type FROM deployments'
    ).all();

    const environmentVariables = db.prepare(
      'SELECT project_id, key, value FROM environment_variables'
    ).all();

    const webhookConfigs = db.prepare(
      'SELECT project_id, provider, events, branch_filter, active FROM webhook_configs'
    ).all();

    const domains = db.prepare(
      'SELECT project_id, domain, ssl_enabled, ssl_auto FROM domains'
    ).all();

    // Export users without password hashes (security)
    const users = db.prepare(
      'SELECT username, role FROM users'
    ).all() as Array<{ username: string; role: string }>;

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      deployments,
      environmentVariables,
      webhookConfigs,
      domains,
      users,
    };
  }

  /**
   * Import deployment configurations from a JSON export.
   * Does NOT overwrite existing deployments — skips duplicates.
   */
  importConfig(exported: ExportedConfig): { imported: number; skipped: number; errors: string[] } {
    const db = getDatabase();
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const dep of exported.deployments) {
      try {
        const existing = db.prepare('SELECT project_id FROM deployments WHERE project_id = ? OR domain = ?')
          .get(dep.project_id, dep.domain);

        if (existing) {
          skipped++;
          continue;
        }

        db.prepare(
          `INSERT INTO deployments (project_id, name, repository_url, local_path, branch, domain, port, status, start_command, build_command, health_check_path, project_type, work_dir)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'STOPPED', ?, ?, ?, ?, ?)`
        ).run(
          dep.project_id, dep.name, dep.repository_url, dep.local_path,
          dep.branch, dep.domain, dep.port, dep.start_command,
          dep.build_command, dep.health_check_path, dep.project_type,
          path.join(config.deployment.appsBaseDir, dep.project_id)
        );

        // Import env vars for this deployment
        const envVars = exported.environmentVariables.filter(
          (e: any) => e.project_id === dep.project_id
        );
        for (const env of envVars) {
          db.prepare(
            'INSERT OR IGNORE INTO environment_variables (project_id, key, value) VALUES (?, ?, ?)'
          ).run(env.project_id, env.key, env.value);
        }

        // Import domains for this deployment
        const depDomains = exported.domains.filter(
          (d: any) => d.project_id === dep.project_id
        );
        for (const dom of depDomains) {
          db.prepare(
            'INSERT OR IGNORE INTO domains (project_id, domain, ssl_enabled, ssl_auto) VALUES (?, ?, ?, ?)'
          ).run(dom.project_id, dom.domain, dom.ssl_enabled, dom.ssl_auto);
        }

        imported++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to import ${dep.name}: ${msg}`);
      }
    }

    logger.info(`Config import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
    return { imported, skipped, errors };
  }

  /**
   * Delete old backups beyond the retention count.
   */
  private enforceRetention(): void {
    const backups = this.listBackups();

    if (backups.length <= this.retentionCount) return;

    const toDelete = backups.slice(this.retentionCount);
    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
        const metaPath = `${backup.path}.meta.json`;
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        logger.info(`Deleted old backup: ${backup.filename}`);
      } catch (error) {
        logger.warn(`Failed to delete old backup ${backup.filename}: ${error}`);
      }
    }
  }

  /**
   * Copy backup file to a network share (UNC path).
   */
  private async copyToNetworkShare(localPath: string, filename: string): Promise<void> {
    const sharePath = config.backup!.networkSharePath!;
    const remotePath = path.join(sharePath, filename);

    try {
      // Use robocopy for reliable network copy with retry
      await execAsync(
        `robocopy "${path.dirname(localPath)}" "${sharePath}" "${filename}" /R:3 /W:5 /NFL /NDL /NJH /NJS`,
        { shell: 'cmd.exe' }
      ).catch((err: any) => {
        if (err.code && err.code >= 8) throw err;
      });
      logger.info(`Backup copied to network share: ${remotePath}`);
    } catch (error) {
      logger.warn(`Failed to copy backup to network share: ${error}`);
    }
  }

  /**
   * Get backup config for display in the UI.
   */
  getConfig(): BackupConfig {
    return {
      enabled: !!this.scheduledTimer,
      backupDir: this.backupDir,
      networkSharePath: config.backup?.networkSharePath || null,
      retentionCount: this.retentionCount,
      intervalHours: this.intervalHours,
    };
  }
}
