import axios from 'axios';
import { CaddyRoute } from '../models/types';
import { logger } from '../utils/logger';
import { config } from '../config';

export class CaddyManager {
  private apiUrl: string;

  constructor() {
    this.apiUrl = config.caddy.apiUrl;
  }

  /**
   * Ensure the base Caddy config exists with correct listen address and auto_https settings.
   * Called once at server startup.
   */
  async ensureBaseConfig(): Promise<void> {
    try {
      const listenAddr = config.caddy.bindIP
        ? `${config.caddy.bindIP}:${config.caddy.httpPort}`
        : `:${config.caddy.httpPort}`;

      const baseConfig: any = {
        apps: {
          http: {
            servers: {
              srv0: {
                listen: [listenAddr],
                routes: [],
              },
            },
          },
        },
      };

      if (config.caddy.disableAutoHttps) {
        baseConfig.apps.http.servers.srv0.automatic_https = { disable: true };
      } else {
        // Add HTTPS listen address
        const httpsAddr = config.caddy.bindIP
          ? `${config.caddy.bindIP}:${config.caddy.httpsPort}`
          : `:${config.caddy.httpsPort}`;
        baseConfig.apps.http.servers.srv0.listen.push(httpsAddr);
      }

      // Try to load existing config first — only apply base if no server exists
      try {
        const existing = await this.getCurrentConfig();
        if (existing?.apps?.http?.servers?.srv0) {
          logger.info('Caddy already has srv0 configured, skipping base config');
          return;
        }
      } catch {
        // No config exists yet
      }

      await axios.post(`${this.apiUrl}/load`, baseConfig, {
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info(`Caddy base config applied (listen: ${listenAddr}, autoHttps: ${!config.caddy.disableAutoHttps})`);
    } catch (error) {
      logger.warn(`Failed to apply Caddy base config (Caddy may not be running): ${error}`);
    }
  }

  async addRoute(domain: string, targetPort: number): Promise<void> {
    try {
      logger.info(`Adding Caddy route: ${domain} -> localhost:${targetPort}`);

      const routeConfig = {
        match: [{ host: [domain] }],
        handle: [
          {
            handler: 'reverse_proxy',
            upstreams: [{ dial: `127.0.0.1:${targetPort}` }],
          },
        ],
      };

      await axios.post(
        `${this.apiUrl}/config/apps/http/servers/srv0/routes`,
        routeConfig,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      logger.info(`Caddy route added successfully for ${domain}`);
    } catch (error) {
      logger.error(`Failed to add Caddy route for ${domain}: ${error}`);
      throw new Error(`Caddy configuration failed: ${error}`);
    }
  }

  async removeRoute(domain: string): Promise<void> {
    try {
      logger.info(`Removing Caddy route for ${domain}`);

      const currentConfig = await this.getCurrentConfig();
      const routes = currentConfig.apps?.http?.servers?.srv0?.routes || [];

      const filteredRoutes = routes.filter((route: any) => {
        const hosts = route.match?.[0]?.host || [];
        return !hosts.includes(domain);
      });

      await axios.put(
        `${this.apiUrl}/config/apps/http/servers/srv0/routes`,
        filteredRoutes,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      logger.info(`Caddy route removed for ${domain}`);
    } catch (error) {
      logger.error(`Failed to remove Caddy route for ${domain}: ${error}`);
      throw new Error(`Caddy route removal failed: ${error}`);
    }
  }

  async updateRoute(domain: string, newPort: number): Promise<void> {
    try {
      logger.info(`Updating Caddy route: ${domain} -> localhost:${newPort}`);

      await this.removeRoute(domain);
      await this.addRoute(domain, newPort);

      logger.info(`Caddy route updated for ${domain}`);
    } catch (error) {
      logger.error(`Failed to update Caddy route for ${domain}: ${error}`);
      throw new Error(`Caddy route update failed: ${error}`);
    }
  }

  async getCurrentConfig(): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/config/`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get Caddy config: ${error}`);
      throw new Error(`Failed to retrieve Caddy configuration: ${error}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await axios.get(`${this.apiUrl}/config/`);
      return true;
    } catch (error) {
      logger.error(`Caddy health check failed: ${error}`);
      return false;
    }
  }
}
