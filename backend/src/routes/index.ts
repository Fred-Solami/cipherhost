import { Router } from 'express';
import {
  deployProject,
  listDeployments,
  getDeployment,
  deleteDeployment,
  redeployProject,
  rollbackDeployment,
  getDeploymentHistory,
  getDeploymentLogs,
  getAuditLogs,
  getEnvironmentVariables,
  updateEnvironmentVariables,
  listDomains,
  addDomain,
  removeDomain,
} from '../controllers/deployment-controller';
import {
  listProcesses,
  getProcessStatus,
  restartProcess,
  stopProcess,
} from '../controllers/process-controller';
import {
  checkSystemHealth,
  checkProjectHealth,
} from '../controllers/health-controller';
import {
  login,
  getMe,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
} from '../controllers/auth-controller';
import {
  getWebhookConfig,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
} from '../controllers/webhook-controller';
import {
  getServiceStatus,
  installService,
  uninstallService,
  startService,
  stopService,
  restartService,
  createBackup,
  listBackups,
  restoreBackup,
  getBackupConfig,
  exportConfig,
  importConfig,
  getSystemResources,
  getResourceLimits,
  setResourceLimits,
  getApacheStatus,
  getLdapStatus,
  testLdapConnection,
  getNotificationConfig,
  testNotifications,
} from '../controllers/system-controller';
import { requireRole } from '../middleware/auth';

const router = Router();

// Auth routes (login is public — handled before authMiddleware in index.ts)
router.get('/auth/me', getMe);
router.post('/auth/change-password', changePassword);

// User management (admin only)
router.get('/users', requireRole('admin'), listUsers);
router.post('/users', requireRole('admin'), createUser);
router.put('/users/:userId', requireRole('admin'), updateUser);
router.delete('/users/:userId', requireRole('admin'), deleteUser);

// Deployments (admin can write, viewers can read)
router.post('/deployments', requireRole('admin'), deployProject);
router.get('/deployments', listDeployments);
router.get('/deployments/:projectId', getDeployment);
router.delete('/deployments/:projectId', requireRole('admin'), deleteDeployment);

// Redeploy & Rollback
router.post('/deployments/:projectId/redeploy', requireRole('admin'), redeployProject);
router.post('/deployments/:projectId/rollback', requireRole('admin'), rollbackDeployment);

// Deployment details
router.get('/deployments/:projectId/history', getDeploymentHistory);
router.get('/deployments/:projectId/logs', getDeploymentLogs);
router.get('/deployments/:projectId/env', requireRole('admin'), getEnvironmentVariables);
router.put('/deployments/:projectId/env', requireRole('admin'), updateEnvironmentVariables);

// Webhook config (admin)
router.get('/deployments/:projectId/webhook', requireRole('admin'), getWebhookConfig);
router.post('/deployments/:projectId/webhook', requireRole('admin'), createWebhookConfig);
router.put('/deployments/:projectId/webhook', requireRole('admin'), updateWebhookConfig);
router.delete('/deployments/:projectId/webhook', requireRole('admin'), deleteWebhookConfig);

// Domain management
router.get('/deployments/:projectId/domains', listDomains);
router.post('/deployments/:projectId/domains', requireRole('admin'), addDomain);
router.delete('/deployments/:projectId/domains/:domainId', requireRole('admin'), removeDomain);

// Audit logs
router.get('/audit-logs', requireRole('admin'), getAuditLogs);
router.get('/audit-logs/:projectId', requireRole('admin'), getAuditLogs);

// Processes (admin can write, viewers can read)
router.get('/processes', listProcesses);
router.get('/processes/:projectId/status', getProcessStatus);
router.post('/processes/:projectId/restart', requireRole('admin'), restartProcess);
router.post('/processes/:projectId/stop', requireRole('admin'), stopProcess);

router.get('/health', checkSystemHealth);
router.get('/health/:projectId', checkProjectHealth);

// ─── Windows Service (admin only) ───
router.get('/system/service', requireRole('admin'), getServiceStatus);
router.post('/system/service/install', requireRole('admin'), installService);
router.post('/system/service/uninstall', requireRole('admin'), uninstallService);
router.post('/system/service/start', requireRole('admin'), startService);
router.post('/system/service/stop', requireRole('admin'), stopService);
router.post('/system/service/restart', requireRole('admin'), restartService);

// ─── Backup & Recovery (admin only) ───
router.get('/system/backups', requireRole('admin'), listBackups);
router.post('/system/backups', requireRole('admin'), createBackup);
router.post('/system/backups/restore', requireRole('admin'), restoreBackup);
router.get('/system/backups/config', requireRole('admin'), getBackupConfig);
router.get('/system/config/export', requireRole('admin'), exportConfig);
router.post('/system/config/import', requireRole('admin'), importConfig);

// ─── Resource Monitoring ───
router.get('/system/resources', getSystemResources);
router.get('/deployments/:projectId/resources', getResourceLimits);
router.put('/deployments/:projectId/resources', requireRole('admin'), setResourceLimits);

// ─── Apache & LDAP Status ───
router.get('/system/apache', requireRole('admin'), getApacheStatus);
router.get('/system/ldap', requireRole('admin'), getLdapStatus);
router.post('/system/ldap/test', requireRole('admin'), testLdapConnection);

// ─── Notifications ───
router.get('/system/notifications', requireRole('admin'), getNotificationConfig);
router.post('/system/notifications/test', requireRole('admin'), testNotifications);

export default router;
