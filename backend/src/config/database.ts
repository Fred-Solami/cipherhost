import Database from 'better-sqlite3';
import { config } from './index';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.database.path);
  
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  createTables(db);
  
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repository_url TEXT,
      local_path TEXT,
      branch TEXT,
      domain TEXT UNIQUE NOT NULL,
      port INTEGER NOT NULL,
      process_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('RUNNING', 'STOPPED', 'CRASHED', 'DEPLOYING')),
      start_command TEXT NOT NULL,
      build_command TEXT,
      health_check_path TEXT DEFAULT '/',
      project_type TEXT NOT NULL CHECK(project_type IN ('NODEJS', 'PYTHON', 'DOTNET', 'PHP', 'UNKNOWN')),
      work_dir TEXT NOT NULL,
      restart_count INTEGER DEFAULT 0,
      last_deployment DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_restart DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK ((repository_url IS NOT NULL AND branch IS NOT NULL) OR local_path IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS port_registry (
      port INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL,
      allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK(status IN ('ALLOCATED', 'RESERVED', 'RELEASED')),
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS environment_variables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE,
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      action TEXT NOT NULL,
      user_id TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_deployments_domain ON deployments(domain);
    CREATE INDEX IF NOT EXISTS idx_port_registry_status ON port_registry(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deployment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      commit_hash TEXT,
      snapshot_path TEXT,
      build_log TEXT,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'ROLLED_BACK')),
      triggered_by TEXT DEFAULT 'manual',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      secret TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'github' CHECK(provider IN ('github', 'gitlab', 'bitbucket', 'generic')),
      events TEXT NOT NULL DEFAULT 'push',
      branch_filter TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      last_triggered DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      ssl_enabled INTEGER NOT NULL DEFAULT 0,
      ssl_auto INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_deploy_history_project ON deployment_history(project_id);
    CREATE INDEX IF NOT EXISTS idx_deploy_history_created ON deployment_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_webhook_configs_project ON webhook_configs(project_id);
    CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);
    CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);

    CREATE TABLE IF NOT EXISTS resource_limits (
      project_id TEXT PRIMARY KEY,
      max_memory_mb INTEGER,
      max_restarts INTEGER NOT NULL DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES deployments(project_id) ON DELETE CASCADE
    );
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
