import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { DeploymentService } from '../services/deployment-service';
import { AuditLogger } from '../services/audit-logger';
import { logger } from '../utils/logger';
import { WebhookConfig, Deployment } from '../models/types';

const deploymentService = new DeploymentService();
const db = getDatabase();

/**
 * Handle incoming webhook from GitHub / GitLab / Bitbucket / generic.
 * POST /api/webhooks/:projectId
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const webhookConfig = db
      .prepare('SELECT * FROM webhook_configs WHERE project_id = ? AND active = 1')
      .get(projectId) as WebhookConfig | undefined;

    if (!webhookConfig) {
      res.status(404).json({ error: 'No active webhook config for this project' });
      return;
    }

    // Verify signature
    if (!verifySignature(req, webhookConfig)) {
      logger.warn(`Webhook signature verification failed for ${projectId}`);
      res.status(401).json({ error: 'Signature verification failed' });
      return;
    }

    // Check branch filter
    const branch = extractBranch(req, webhookConfig.provider);
    if (webhookConfig.branch_filter && branch && branch !== webhookConfig.branch_filter) {
      logger.info(`Webhook for ${projectId} skipped — branch ${branch} doesn't match filter ${webhookConfig.branch_filter}`);
      res.json({ message: 'Skipped — branch filter mismatch' });
      return;
    }

    // Update last_triggered
    db.prepare('UPDATE webhook_configs SET last_triggered = CURRENT_TIMESTAMP WHERE id = ?')
      .run(webhookConfig.id);

    // Trigger redeploy
    const result = await deploymentService.redeployApplication(projectId, 'webhook');

    if (result.success) {
      AuditLogger.log('webhook-redeploy', projectId, null, `Triggered by ${webhookConfig.provider} webhook`);
      res.json({ message: 'Redeployment triggered', result });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    logger.error(`Webhook handler error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * CRUD for webhook configs (authenticated routes)
 */
export const getWebhookConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const config = db
      .prepare('SELECT id, project_id, provider, events, branch_filter, active, last_triggered, created_at FROM webhook_configs WHERE project_id = ?')
      .get(projectId);

    if (!config) {
      res.status(404).json({ error: 'No webhook config found' });
      return;
    }

    res.json(config);
  } catch (error) {
    logger.error(`Get webhook config error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createWebhookConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { provider, events, branchFilter } = req.body;

    // Check project exists
    const deployment = db.prepare('SELECT project_id FROM deployments WHERE project_id = ?').get(projectId);
    if (!deployment) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    // Check no existing config
    const existing = db.prepare('SELECT id FROM webhook_configs WHERE project_id = ?').get(projectId);
    if (existing) {
      res.status(409).json({ error: 'Webhook config already exists, use PUT to update' });
      return;
    }

    // Generate a secure secret
    const secret = crypto.randomBytes(32).toString('hex');
    const id = crypto.randomUUID();

    db.prepare(
      'INSERT INTO webhook_configs (id, project_id, secret, provider, events, branch_filter, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(id, projectId, secret, provider || 'generic', events || 'push', branchFilter || null);

    res.status(201).json({
      id,
      secret,
      provider: provider || 'generic',
      webhookUrl: `/api/webhooks/${projectId}`,
    });
  } catch (error) {
    logger.error(`Create webhook config error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWebhookConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { provider, events, branchFilter, active } = req.body;

    const existing = db.prepare('SELECT id FROM webhook_configs WHERE project_id = ?').get(projectId) as any;
    if (!existing) {
      res.status(404).json({ error: 'Webhook config not found' });
      return;
    }

    db.prepare(
      'UPDATE webhook_configs SET provider = COALESCE(?, provider), events = COALESCE(?, events), branch_filter = ?, active = COALESCE(?, active) WHERE project_id = ?'
    ).run(provider || null, events || null, branchFilter ?? null, active ?? null, projectId);

    res.json({ message: 'Webhook config updated' });
  } catch (error) {
    logger.error(`Update webhook config error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteWebhookConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const result = db.prepare('DELETE FROM webhook_configs WHERE project_id = ?').run(projectId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Webhook config not found' });
      return;
    }

    res.json({ message: 'Webhook config deleted' });
  } catch (error) {
    logger.error(`Delete webhook config error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Utility functions ---

function verifySignature(req: Request, config: WebhookConfig): boolean {
  const rawBody = JSON.stringify(req.body);

  switch (config.provider) {
    case 'github': {
      const sig = req.headers['x-hub-signature-256'] as string;
      if (!sig) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', config.secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    }
    case 'gitlab': {
      const token = req.headers['x-gitlab-token'] as string;
      return token === config.secret;
    }
    case 'bitbucket': {
      // Bitbucket Cloud uses IP whitelisting; Bitbucket Server can use HMAC
      const sig = req.headers['x-hub-signature'] as string;
      if (!sig) return true; // Bitbucket Cloud doesn't always send signatures
      const expected = 'sha256=' + crypto.createHmac('sha256', config.secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    }
    case 'generic':
    default: {
      const token = req.headers['x-webhook-secret'] as string;
      if (!token) return false;
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.secret));
    }
  }
}

function extractBranch(req: Request, provider: string): string | null {
  try {
    switch (provider) {
      case 'github':
        return (req.body.ref as string)?.replace('refs/heads/', '') || null;
      case 'gitlab':
        return (req.body.ref as string)?.replace('refs/heads/', '') || null;
      case 'bitbucket':
        return req.body.push?.changes?.[0]?.new?.name || null;
      default:
        return req.body.branch || req.body.ref?.replace('refs/heads/', '') || null;
    }
  } catch {
    return null;
  }
}
