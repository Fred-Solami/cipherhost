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

export default router;
