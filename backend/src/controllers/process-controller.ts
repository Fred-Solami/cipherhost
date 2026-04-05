import { Request, Response } from 'express';
import { PM2Integration } from '../services/pm2-integration';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { Deployment } from '../models/types';

const pm2 = new PM2Integration();
const db = getDatabase();

export const listProcesses = async (req: Request, res: Response): Promise<void> => {
  try {
    const processes = await pm2.listAllProcesses();
    res.json(processes);
  } catch (error) {
    logger.error(`List processes error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProcessStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const deployment = db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment || !deployment.process_id) {
      res.status(404).json({ error: 'Process not found' });
      return;
    }

    const status = await pm2.getProcessStatus(deployment.process_id);

    if (!status) {
      res.status(404).json({ error: 'Process status not available' });
      return;
    }

    res.json(status);
  } catch (error) {
    logger.error(`Get process status error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const restartProcess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const deployment = db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment || !deployment.process_id) {
      res.status(404).json({ error: 'Process not found' });
      return;
    }

    await pm2.restartProcess(deployment.process_id);

    db.prepare(
      'UPDATE deployments SET status = ?, restart_count = restart_count + 1, last_restart = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?'
    ).run('RUNNING', projectId);

    res.json({ message: 'Process restarted successfully' });
  } catch (error) {
    logger.error(`Restart process error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const stopProcess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const deployment = db
      .prepare('SELECT * FROM deployments WHERE project_id = ?')
      .get(projectId) as Deployment | undefined;

    if (!deployment || !deployment.process_id) {
      res.status(404).json({ error: 'Process not found' });
      return;
    }

    await pm2.stopProcess(deployment.process_id);

    db.prepare('UPDATE deployments SET status = ? WHERE project_id = ?').run('STOPPED', projectId);

    res.json({ message: 'Process stopped successfully' });
  } catch (error) {
    logger.error(`Stop process error: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};
