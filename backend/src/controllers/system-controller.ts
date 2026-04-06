import { Request, Response } from 'express';
import { WindowsServiceManager } from '../services/windows-service';
import { BackupManager } from '../services/backup-manager';
import { ResourceMonitor } from '../services/resource-monitor';
import { ApacheManager } from '../services/apache-manager';
import { LdapAuthProvider } from '../services/ldap-auth';
import { notificationService } from '../services/notification-service';
import { logger } from '../utils/logger';

const serviceManager = new WindowsServiceManager();
const backupManager = new BackupManager();
const resourceMonitor = new ResourceMonitor();
const apacheManager = new ApacheManager();
const ldapProvider = new LdapAuthProvider();

// ─── Windows Service ───

export async function getServiceStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = await serviceManager.getStatus();
    res.json(status);
  } catch (error) {
    logger.error(`Get service status error: ${error}`);
    res.status(500).json({ error: 'Failed to get service status' });
  }
}

export async function installService(req: Request, res: Response): Promise<void> {
  try {
    const result = await serviceManager.install();
    if (result.success) {
      res.json({ message: 'Service installed and started' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Install service error: ${error}`);
    res.status(500).json({ error: 'Failed to install service' });
  }
}

export async function uninstallService(req: Request, res: Response): Promise<void> {
  try {
    const result = await serviceManager.uninstall();
    if (result.success) {
      res.json({ message: 'Service uninstalled' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Uninstall service error: ${error}`);
    res.status(500).json({ error: 'Failed to uninstall service' });
  }
}

export async function startService(req: Request, res: Response): Promise<void> {
  try {
    const result = await serviceManager.start();
    if (result.success) {
      res.json({ message: 'Service started' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Start service error: ${error}`);
    res.status(500).json({ error: 'Failed to start service' });
  }
}

export async function stopService(req: Request, res: Response): Promise<void> {
  try {
    const result = await serviceManager.stop();
    if (result.success) {
      res.json({ message: 'Service stopped' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Stop service error: ${error}`);
    res.status(500).json({ error: 'Failed to stop service' });
  }
}

export async function restartService(req: Request, res: Response): Promise<void> {
  try {
    const result = await serviceManager.restart();
    if (result.success) {
      res.json({ message: 'Service restarted' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Restart service error: ${error}`);
    res.status(500).json({ error: 'Failed to restart service' });
  }
}

// ─── Backup & Recovery ───

export async function createBackup(req: Request, res: Response): Promise<void> {
  try {
    const backup = await backupManager.createBackup('manual');
    res.status(201).json(backup);
  } catch (error) {
    logger.error(`Create backup error: ${error}`);
    res.status(500).json({ error: 'Backup failed' });
  }
}

export async function listBackups(req: Request, res: Response): Promise<void> {
  try {
    const backups = backupManager.listBackups();
    res.json(backups);
  } catch (error) {
    logger.error(`List backups error: ${error}`);
    res.status(500).json({ error: 'Failed to list backups' });
  }
}

export async function restoreBackup(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.body;

    if (!filename) {
      res.status(400).json({ error: 'Backup filename is required' });
      return;
    }

    const result = await backupManager.restoreFromBackup(filename);
    if (result.success) {
      res.json({ message: 'Database restored. Restart the server to apply changes.' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Restore backup error: ${error}`);
    res.status(500).json({ error: 'Restore failed' });
  }
}

export async function getBackupConfig(req: Request, res: Response): Promise<void> {
  try {
    const cfg = backupManager.getConfig();
    res.json(cfg);
  } catch (error) {
    logger.error(`Get backup config error: ${error}`);
    res.status(500).json({ error: 'Failed to get backup config' });
  }
}

export async function exportConfig(req: Request, res: Response): Promise<void> {
  try {
    const exported = backupManager.exportConfig();
    res.json(exported);
  } catch (error) {
    logger.error(`Export config error: ${error}`);
    res.status(500).json({ error: 'Failed to export config' });
  }
}

export async function importConfig(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body;

    if (!body || !body.version || !body.deployments) {
      res.status(400).json({ error: 'Invalid config format' });
      return;
    }

    const result = backupManager.importConfig(body);
    res.json(result);
  } catch (error) {
    logger.error(`Import config error: ${error}`);
    res.status(500).json({ error: 'Failed to import config' });
  }
}

// ─── Resource Monitoring ───

export async function getSystemResources(req: Request, res: Response): Promise<void> {
  try {
    const resources = await resourceMonitor.getSystemResources();
    res.json(resources);
  } catch (error) {
    logger.error(`Get system resources error: ${error}`);
    res.status(500).json({ error: 'Failed to get system resources' });
  }
}

export async function getResourceLimits(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId as string;
    const limits = resourceMonitor.getLimits(projectId);
    res.json(limits);
  } catch (error) {
    logger.error(`Get resource limits error: ${error}`);
    res.status(500).json({ error: 'Failed to get resource limits' });
  }
}

export async function setResourceLimits(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId as string;
    const { maxMemoryMB, maxRestarts } = req.body;

    if (maxMemoryMB !== undefined && maxMemoryMB !== null && (typeof maxMemoryMB !== 'number' || maxMemoryMB < 0)) {
      res.status(400).json({ error: 'maxMemoryMB must be a positive number or null' });
      return;
    }
    if (maxRestarts !== undefined && (typeof maxRestarts !== 'number' || maxRestarts < 0)) {
      res.status(400).json({ error: 'maxRestarts must be a non-negative number' });
      return;
    }

    resourceMonitor.setLimits(projectId, { maxMemoryMB, maxRestarts });
    res.json({ message: 'Resource limits updated' });
  } catch (error) {
    logger.error(`Set resource limits error: ${error}`);
    res.status(500).json({ error: 'Failed to set resource limits' });
  }
}

// ─── Apache Status ───

export async function getApacheStatus(req: Request, res: Response): Promise<void> {
  try {
    const available = await apacheManager.isAvailable();
    const running = available ? await apacheManager.isRunning() : false;
    const version = available ? await apacheManager.getVersion() : null;
    const vhosts = available ? apacheManager.listVirtualHosts() : [];

    res.json({
      available,
      running,
      version,
      vhostCount: vhosts.length,
    });
  } catch (error) {
    logger.error(`Get Apache status error: ${error}`);
    res.status(500).json({ error: 'Failed to get Apache status' });
  }
}

// ─── LDAP Status ───

export async function getLdapStatus(req: Request, res: Response): Promise<void> {
  try {
    const enabled = ldapProvider.isEnabled();
    let connected = false;

    if (enabled) {
      const test = await ldapProvider.testConnection();
      connected = test.success;
    }

    res.json({ enabled, connected });
  } catch (error) {
    logger.error(`Get LDAP status error: ${error}`);
    res.status(500).json({ error: 'Failed to get LDAP status' });
  }
}

export async function testLdapConnection(req: Request, res: Response): Promise<void> {
  try {
    const result = await ldapProvider.testConnection();
    res.json(result);
  } catch (error) {
    logger.error(`Test LDAP error: ${error}`);
    res.status(500).json({ error: 'LDAP test failed' });
  }
}

// ─── Notifications ───

export async function getNotificationConfig(req: Request, res: Response): Promise<void> {
  try {
    const cfg = notificationService.getConfig();
    res.json(cfg);
  } catch (error) {
    logger.error(`Get notification config error: ${error}`);
    res.status(500).json({ error: 'Failed to get notification config' });
  }
}

export async function testNotifications(req: Request, res: Response): Promise<void> {
  try {
    const result = await notificationService.testConnection();
    if (result.ok) {
      await notificationService.send(
        'Test notification',
        'This is a test notification from CipherHost. If you received this email, notifications are configured correctly.',
        'info'
      );
      res.json({ success: true, message: 'Test email sent' });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error(`Test notification error: ${error}`);
    res.status(500).json({ error: 'Notification test failed' });
  }
}
