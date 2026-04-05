import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/cipherhost.db'),
  },
  
  ports: {
    rangeMin: parseInt(process.env.PORT_RANGE_MIN || '5000', 10),
    rangeMax: parseInt(process.env.PORT_RANGE_MAX || '6000', 10),
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
    apiKey: process.env.API_KEY || 'change-this-in-production',
    webhookSecret: process.env.WEBHOOK_SECRET || '',
  },
  
  pm2: {
    home: process.env.PM2_HOME || 'C:/CipherHost/.pm2',
    logDir: process.env.PM2_LOG_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '', '.pm2', 'logs'),
  },
  
  caddy: {
    apiUrl: process.env.CADDY_API_URL || 'http://localhost:2019',
    configPath: process.env.CADDY_CONFIG_PATH || 'C:/CipherHost/caddy/config.json',
    bindIP: process.env.CADDY_BIND_IP || '',
    httpPort: parseInt(process.env.CADDY_HTTP_PORT || '80', 10),
    httpsPort: parseInt(process.env.CADDY_HTTPS_PORT || '443', 10),
    disableAutoHttps: process.env.CADDY_DISABLE_AUTO_HTTPS === 'true',
  },
  
  deployment: {
    appsBaseDir: process.env.APPS_BASE_DIR || 'C:/CipherHost/apps',
    snapshotsDir: process.env.SNAPSHOTS_DIR || 'C:/CipherHost/snapshots',
    maxAutoRestarts: parseInt(process.env.MAX_AUTO_RESTARTS || '5', 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    buildTimeout: parseInt(process.env.BUILD_TIMEOUT || '300000', 10),
  },
  
  npm: {
    disableScripts: process.env.DISABLE_NPM_SCRIPTS !== 'false',
    requirePackageLock: process.env.REQUIRE_PACKAGE_LOCK !== 'false',
  },
  
  hosts: {
    manage: process.env.MANAGE_HOSTS_FILE === 'true',
    hostsFilePath: process.env.HOSTS_FILE_PATH || 'C:/Windows/System32/drivers/etc/hosts',
    defaultIP: process.env.HOSTS_DEFAULT_IP || '127.0.0.1',
  },

  backup: {
    backupDir: process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups'),
    networkSharePath: process.env.BACKUP_NETWORK_SHARE || null,
    retentionCount: parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10),
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10),
  },

  apache: {
    installDir: process.env.APACHE_DIR || 'C:/Apache24',
    enabled: process.env.APACHE_ENABLED === 'true',
  },

  ldap: {
    enabled: process.env.LDAP_ENABLED === 'true',
    url: process.env.LDAP_URL || '',
    baseDn: process.env.LDAP_BASE_DN || '',
    bindDn: process.env.LDAP_BIND_DN || '',
    bindPassword: process.env.LDAP_BIND_PASSWORD || '',
    userSearchFilter: process.env.LDAP_USER_FILTER || '(sAMAccountName={{username}})',
    adminGroups: (process.env.LDAP_ADMIN_GROUPS || '').split(',').filter(Boolean),
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },

  serviceAccount: process.env.SERVICE_ACCOUNT || 'CipherHostService',
};
