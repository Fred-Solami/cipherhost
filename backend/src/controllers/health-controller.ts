import { Request, Response } from 'express';
import { HealthMonitor } from '../services/health-monitor';
import { CaddyManager } from '../services/caddy-manager';
import { logger } from '../utils/logger';

const healthMonitor = new HealthMonitor();
const caddy = new CaddyManager();

export const checkSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const caddyHealthy = await caddy.healthCheck();

    res.json({
      status: 'healthy',
      services: {
        caddy: caddyHealthy ? 'healthy' : 'unhealthy',
        database: 'healthy',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`System health check error: ${error}`);
    res.status(500).json({ error: 'Health check failed' });
  }
};

export const checkProjectHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const healthStatus = await healthMonitor.checkHealth(projectId);

    res.json(healthStatus);
  } catch (error) {
    logger.error(`Project health check error: ${error}`);
    res.status(500).json({ error: 'Health check failed' });
  }
};
