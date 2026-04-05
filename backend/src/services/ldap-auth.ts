import { Client, SearchResult } from 'ldapts';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getDatabase } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../models/types';

export interface LdapUser {
  username: string;
  displayName: string;
  email: string;
  groups: string[];
}

/**
 * Active Directory / LDAP authentication provider.
 *
 * How it works:
 * 1. User submits username + password.
 * 2. We bind to AD using the service account (LDAP_BIND_DN / LDAP_BIND_PASSWORD).
 * 3. Search for the user by sAMAccountName (or custom filter).
 * 4. If found, attempt to bind as the user with their password (validates credentials).
 * 5. Read the user's group memberships.
 * 6. Map AD groups to CipherHost roles (admin if in LDAP_ADMIN_GROUPS, else viewer).
 * 7. Upsert a local user record so JWT/session works the same as local auth.
 *
 * This is a supplement, not a replacement: if LDAP is disabled, local auth still works.
 * If LDAP is enabled, local auth is tried first, then LDAP as fallback (or the reverse).
 */
export class LdapAuthProvider {
  private url: string;
  private baseDn: string;
  private bindDn: string;
  private bindPassword: string;
  private userFilter: string;
  private adminGroups: string[];
  private tlsRejectUnauthorized: boolean;

  constructor() {
    this.url = config.ldap.url;
    this.baseDn = config.ldap.baseDn;
    this.bindDn = config.ldap.bindDn;
    this.bindPassword = config.ldap.bindPassword;
    this.userFilter = config.ldap.userSearchFilter;
    this.adminGroups = config.ldap.adminGroups;
    this.tlsRejectUnauthorized = config.ldap.tlsRejectUnauthorized;
  }

  /**
   * Check if LDAP auth is enabled and configured.
   */
  isEnabled(): boolean {
    return config.ldap.enabled && !!this.url && !!this.baseDn;
  }

  /**
   * Authenticate a user against Active Directory.
   * Returns the local user record (created/updated) if successful, null if failed.
   */
  async authenticate(username: string, password: string): Promise<{
    userId: string;
    username: string;
    role: UserRole;
  } | null> {
    if (!this.isEnabled()) return null;

    const client = new Client({
      url: this.url,
      tlsOptions: {
        rejectUnauthorized: this.tlsRejectUnauthorized,
      },
    });

    try {
      // Step 1: Bind as service account to search
      await client.bind(this.bindDn, this.bindPassword);

      // Step 2: Search for the user
      const searchFilter = this.userFilter.replace('{{username}}', this.escapeLdap(username));
      const { searchEntries } = await client.search(this.baseDn, {
        scope: 'sub',
        filter: searchFilter,
        attributes: ['dn', 'sAMAccountName', 'displayName', 'mail', 'memberOf'],
      });

      if (searchEntries.length === 0) {
        logger.debug(`LDAP: User not found: ${username}`);
        await client.unbind();
        return null;
      }

      const entry = searchEntries[0];
      const userDn = entry.dn;

      // Step 3: Unbind service account, bind as user to verify password
      await client.unbind();

      const userClient = new Client({
        url: this.url,
        tlsOptions: {
          rejectUnauthorized: this.tlsRejectUnauthorized,
        },
      });

      try {
        await userClient.bind(userDn, password);
        await userClient.unbind();
      } catch {
        logger.debug(`LDAP: Invalid password for ${username}`);
        return null;
      }

      // Step 4: Extract groups and determine role
      const groups = this.extractGroups(entry.memberOf);
      const role = this.determineRole(groups);

      // Step 5: Upsert local user record
      const localUser = this.upsertLocalUser(username, role);

      logger.info(`LDAP auth successful: ${username} (role: ${role}, groups: ${groups.length})`);
      return localUser;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`LDAP auth error: ${msg}`);
      return null;
    } finally {
      try { await client.unbind(); } catch { /* already unbound */ }
    }
  }

  /**
   * Test LDAP connectivity (bind as service account).
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { success: false, error: 'LDAP is not enabled' };
    }

    const client = new Client({
      url: this.url,
      tlsOptions: {
        rejectUnauthorized: this.tlsRejectUnauthorized,
      },
      connectTimeout: 5000,
    });

    try {
      await client.bind(this.bindDn, this.bindPassword);
      await client.unbind();
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * Extract group CNs from memberOf attribute.
   */
  private extractGroups(memberOf: any): string[] {
    if (!memberOf) return [];

    const entries = Array.isArray(memberOf) ? memberOf : [memberOf];
    return entries.map((dn: string) => {
      // Extract CN from DN: "CN=DevOps,OU=Groups,DC=company,DC=local" -> "DevOps"
      const match = dn.match(/^CN=([^,]+)/i);
      return match ? match[1] : dn;
    });
  }

  /**
   * Map AD groups to a CipherHost role.
   * If user is in any of the configured admin groups -> admin, else viewer.
   */
  private determineRole(groups: string[]): UserRole {
    if (this.adminGroups.length === 0) return 'viewer';

    const lowerGroups = groups.map(g => g.toLowerCase());
    const isAdmin = this.adminGroups.some(ag => lowerGroups.includes(ag.toLowerCase()));

    return isAdmin ? 'admin' : 'viewer';
  }

  /**
   * Create or update a local user record for the LDAP user.
   * This ensures JWT generation works uniformly.
   */
  private upsertLocalUser(username: string, role: UserRole): { userId: string; username: string; role: UserRole } {
    const db = getDatabase();

    const existing = db.prepare('SELECT id, role FROM users WHERE username = ?').get(username) as
      | { id: string; role: string }
      | undefined;

    if (existing) {
      // Update role if it changed (AD group membership may have changed)
      if (existing.role !== role) {
        db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(role, existing.id);
      }
      return { userId: existing.id, username, role };
    }

    // Create new local user (password_hash is placeholder — LDAP users don't use local auth)
    const userId = uuidv4();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(userId, username, 'LDAP_AUTH', role);

    logger.info(`Created local user for LDAP account: ${username} (${role})`);
    return { userId, username, role };
  }

  /**
   * Escape special LDAP filter characters to prevent injection.
   */
  private escapeLdap(input: string): string {
    return input
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }
}
