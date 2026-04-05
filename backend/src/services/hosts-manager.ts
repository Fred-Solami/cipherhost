import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

const MARKER_START = '# === CipherHost Managed Entries (DO NOT EDIT BELOW) ===';
const MARKER_END = '# === CipherHost End ===';

export class HostsManager {
  private hostsPath: string;
  private defaultIP: string;

  constructor() {
    this.hostsPath = config.hosts.hostsFilePath;
    this.defaultIP = config.hosts.defaultIP;
  }

  addEntry(domain: string, ip?: string): void {
    if (!config.hosts.manage) return;

    try {
      const targetIP = ip || this.defaultIP;
      const entries = this.getManagedEntries();

      if (entries.some(e => e.domain === domain)) {
        logger.debug(`Hosts entry already exists for ${domain}`);
        return;
      }

      entries.push({ ip: targetIP, domain });
      this.writeManagedEntries(entries);
      logger.info(`Added hosts entry: ${targetIP} ${domain}`);
    } catch (error) {
      logger.error(`Failed to add hosts entry for ${domain}: ${error}`);
    }
  }

  removeEntry(domain: string): void {
    if (!config.hosts.manage) return;

    try {
      const entries = this.getManagedEntries();
      const filtered = entries.filter(e => e.domain !== domain);

      if (filtered.length === entries.length) return;

      this.writeManagedEntries(filtered);
      logger.info(`Removed hosts entry for ${domain}`);
    } catch (error) {
      logger.error(`Failed to remove hosts entry for ${domain}: ${error}`);
    }
  }

  listEntries(): Array<{ ip: string; domain: string }> {
    return this.getManagedEntries();
  }

  private getManagedEntries(): Array<{ ip: string; domain: string }> {
    try {
      const content = fs.readFileSync(this.hostsPath, 'utf-8');
      const startIdx = content.indexOf(MARKER_START);
      const endIdx = content.indexOf(MARKER_END);

      if (startIdx === -1 || endIdx === -1) return [];

      const managed = content.substring(startIdx + MARKER_START.length, endIdx).trim();
      if (!managed) return [];

      return managed.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const parts = line.split(/\s+/);
          return { ip: parts[0], domain: parts[1] };
        })
        .filter(e => e.ip && e.domain);
    } catch {
      return [];
    }
  }

  private writeManagedEntries(entries: Array<{ ip: string; domain: string }>): void {
    let content = fs.readFileSync(this.hostsPath, 'utf-8');
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);

    const entryLines = entries.map(e => `${e.ip}\t${e.domain}`).join('\n');
    const managedBlock = `${MARKER_START}\n${entryLines}\n${MARKER_END}`;

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.substring(0, startIdx) + managedBlock + content.substring(endIdx + MARKER_END.length);
    } else {
      content = content.trimEnd() + '\n\n' + managedBlock + '\n';
    }

    fs.writeFileSync(this.hostsPath, content, 'utf-8');
  }
}
