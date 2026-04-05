import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { config } from '../config';

const execAsync = promisify(exec);

export interface ApacheVHost {
  domain: string;
  documentRoot: string;
  port: number;
  phpVersion: string | null;
  serverAlias: string[];
}

/**
 * Manages Apache VirtualHosts for PHP deployments.
 *
 * Architecture:
 * - Each PHP app gets its own VirtualHost config in Apache's sites-available dir.
 * - DocumentRoot points to the app's work_dir (or a public/ subfolder if present).
 * - PHP-FPM is NOT used on Windows; Apache's mod_php handles PHP execution.
 * - After writing configs, Apache is reloaded via `httpd -k restart`.
 *
 * File layout:
 *   {apacheConfigDir}/extra/vhosts/cipherhost_{projectId}.conf
 *
 * The manager never touches vhosts it didn't create (identified by the cipherhost_ prefix).
 */
export class ApacheManager {
  private apacheDir: string;
  private vhostDir: string;
  private httpdBin: string;

  constructor() {
    this.apacheDir = config.apache?.installDir || 'C:/Apache24';
    this.vhostDir = path.join(this.apacheDir, 'conf', 'extra', 'vhosts');
    this.httpdBin = path.join(this.apacheDir, 'bin', 'httpd.exe');
  }

  /**
   * Check if Apache is installed and accessible.
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.httpdBin)) return false;
      await execAsync(`"${this.httpdBin}" -v`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Apache version string.
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`"${this.httpdBin}" -v`);
      const match = stdout.match(/Apache\/(\S+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Ensure the vhost directory exists and is included in httpd.conf.
   */
  async init(): Promise<void> {
    if (!fs.existsSync(this.vhostDir)) {
      fs.mkdirSync(this.vhostDir, { recursive: true });
      logger.info(`Created Apache vhost directory: ${this.vhostDir}`);
    }

    // Check if httpd.conf includes our vhost directory
    const httpdConf = path.join(this.apacheDir, 'conf', 'httpd.conf');
    if (fs.existsSync(httpdConf)) {
      const content = fs.readFileSync(httpdConf, 'utf-8');
      const includeDirective = `Include conf/extra/vhosts/*.conf`;

      if (!content.includes(includeDirective)) {
        logger.warn(
          `Apache httpd.conf does not include vhost directory. Add this line:\n  ${includeDirective}`
        );
      }
    }
  }

  /**
   * Create a VirtualHost config for a PHP deployment.
   */
  async addVirtualHost(
    projectId: string,
    domain: string,
    documentRoot: string,
    port: number
  ): Promise<void> {
    // If the project has a public/ subdirectory, use that as DocumentRoot
    const publicDir = path.join(documentRoot, 'public');
    const docRoot = fs.existsSync(publicDir) ? publicDir : documentRoot;

    const vhostConfig = this.generateVHostConfig(domain, docRoot, port);
    const configPath = path.join(this.vhostDir, `cipherhost_${projectId}.conf`);

    fs.writeFileSync(configPath, vhostConfig, 'utf-8');
    logger.info(`Apache VHost created for ${domain}: ${configPath}`);

    await this.reload();
  }

  /**
   * Remove VirtualHost config for a deployment.
   */
  async removeVirtualHost(projectId: string): Promise<void> {
    const configPath = path.join(this.vhostDir, `cipherhost_${projectId}.conf`);

    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      logger.info(`Apache VHost removed: ${configPath}`);
      await this.reload();
    }
  }

  /**
   * Update the port for an existing VirtualHost.
   */
  async updateVirtualHost(
    projectId: string,
    domain: string,
    documentRoot: string,
    port: number
  ): Promise<void> {
    await this.removeVirtualHost(projectId);
    await this.addVirtualHost(projectId, domain, documentRoot, port);
  }

  /**
   * Reload Apache configuration (graceful restart).
   */
  async reload(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`"${this.httpdBin}" -k restart`);
      logger.info('Apache reloaded');
      return { success: true };
    } catch (error: any) {
      const msg = error.stderr || error.message;
      logger.error(`Apache reload failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Test Apache configuration syntax.
   */
  async testConfig(): Promise<{ valid: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync(`"${this.httpdBin}" -t`);
      const output = (stdout + stderr).trim();
      return { valid: output.includes('Syntax OK'), output };
    } catch (error: any) {
      return { valid: false, output: error.stderr || error.message };
    }
  }

  /**
   * List all CipherHost-managed VirtualHosts.
   */
  listVirtualHosts(): Array<{ projectId: string; configPath: string; content: string }> {
    if (!fs.existsSync(this.vhostDir)) return [];

    return fs.readdirSync(this.vhostDir)
      .filter(f => f.startsWith('cipherhost_') && f.endsWith('.conf'))
      .map(f => {
        const configPath = path.join(this.vhostDir, f);
        return {
          projectId: f.replace('cipherhost_', '').replace('.conf', ''),
          configPath,
          content: fs.readFileSync(configPath, 'utf-8'),
        };
      });
  }

  /**
   * Generate Apache VirtualHost config block.
   */
  private generateVHostConfig(domain: string, documentRoot: string, port: number): string {
    // Normalize paths for Apache (forward slashes)
    const docRootUnix = documentRoot.replace(/\\/g, '/');

    return [
      `# CipherHost managed VirtualHost — do not edit manually`,
      `<VirtualHost *:${port}>`,
      `    ServerName ${domain}`,
      `    DocumentRoot "${docRootUnix}"`,
      ``,
      `    <Directory "${docRootUnix}">`,
      `        Options -Indexes +FollowSymLinks`,
      `        AllowOverride All`,
      `        Require all granted`,
      `    </Directory>`,
      ``,
      `    # PHP handler`,
      `    <FilesMatch \\.php$>`,
      `        SetHandler application/x-httpd-php`,
      `    </FilesMatch>`,
      ``,
      `    DirectoryIndex index.php index.html`,
      ``,
      `    ErrorLog "logs/cipherhost_${domain}_error.log"`,
      `    CustomLog "logs/cipherhost_${domain}_access.log" combined`,
      `</VirtualHost>`,
      ``,
    ].join('\n');
  }

  /**
   * Check if Apache service is running.
   */
  async isRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('sc query Apache2.4');
      return stdout.includes('RUNNING');
    } catch {
      // Try alternate service names
      try {
        const { stdout } = await execAsync('sc query httpd');
        return stdout.includes('RUNNING');
      } catch {
        return false;
      }
    }
  }
}
