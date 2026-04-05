import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';

export class AuditLogger {
  static log(action: string, projectId: string | null = null, userId: string | null = null, details: string | null = null): void {
    try {
      const db = getDatabase();
      db.prepare(
        'INSERT INTO audit_logs (project_id, action, user_id, details) VALUES (?, ?, ?, ?)'
      ).run(projectId, action, userId, details);
    } catch (error) {
      logger.error(`Failed to write audit log: ${error}`);
    }
  }

  static getByProject(projectId: string, limit = 50): any[] {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM audit_logs WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(projectId, limit);
  }

  static getRecent(limit = 100): any[] {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }
}
