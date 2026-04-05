import { getDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PortRegistry } from '../models/types';

export class PortManager {
  private db = getDatabase();

  allocatePort(projectId: string): number | null {
    const transaction = this.db.transaction(() => {
      const minPort = config.ports.rangeMin;
      const maxPort = config.ports.rangeMax;

      for (let port = minPort; port <= maxPort; port++) {
        const existing = this.db
          .prepare('SELECT COUNT(*) as count FROM port_registry WHERE port = ? AND status = ?')
          .get(port, 'ALLOCATED') as { count: number };

        if (existing.count === 0) {
          this.db
            .prepare(
              'INSERT INTO port_registry (port, project_id, status) VALUES (?, ?, ?)'
            )
            .run(port, projectId, 'ALLOCATED');

          logger.info(`Allocated port ${port} for project ${projectId}`);
          return port;
        }
      }

      return null;
    });

    return transaction();
  }

  releasePort(port: number): void {
    this.db
      .prepare('UPDATE port_registry SET status = ? WHERE port = ?')
      .run('RELEASED', port);

    logger.info(`Released port ${port}`);
  }

  getPortForProject(projectId: string): number | null {
    const result = this.db
      .prepare('SELECT port FROM port_registry WHERE project_id = ? AND status = ?')
      .get(projectId, 'ALLOCATED') as PortRegistry | undefined;

    return result?.port || null;
  }

  isPortAvailable(port: number): boolean {
    const existing = this.db
      .prepare('SELECT COUNT(*) as count FROM port_registry WHERE port = ? AND status = ?')
      .get(port, 'ALLOCATED') as { count: number };

    return existing.count === 0;
  }

  listOccupiedPorts(): number[] {
    const results = this.db
      .prepare('SELECT port FROM port_registry WHERE status = ?')
      .all('ALLOCATED') as PortRegistry[];

    return results.map((r) => r.port);
  }
}
