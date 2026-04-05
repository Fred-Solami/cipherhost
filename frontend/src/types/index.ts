export type ProjectType = 'NODEJS' | 'PYTHON' | 'DOTNET' | 'UNKNOWN';
export type ProcessState = 'RUNNING' | 'STOPPED' | 'CRASHED' | 'DEPLOYING';
export type UserRole = 'admin' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
}

export interface Deployment {
  project_id: string;
  name: string;
  repository_url: string | null;
  local_path: string | null;
  branch: string | null;
  domain: string;
  port: number;
  process_id: string | null;
  status: ProcessState;
  start_command: string;
  build_command: string | null;
  health_check_path: string;
  project_type: ProjectType;
  work_dir: string;
  restart_count: number;
  last_deployment: string;
  last_restart: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeploymentHistory {
  id: number;
  project_id: string;
  version: number;
  commit_hash: string | null;
  snapshot_path: string | null;
  build_log: string | null;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  triggered_by: string;
  user_id: string | null;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  project_id: string;
  provider: string;
  events: string;
  branch_filter: string | null;
  active: number;
  last_triggered: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  project_id: string | null;
  action: string;
  user_id: string | null;
  details: string | null;
  timestamp: string;
}

export interface ProcessInfo {
  name: string;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
}

export interface DeploymentRequest {
  name: string;
  repositoryUrl?: string;
  localPath?: string;
  branch?: string;
  domain: string;
  environmentVariables?: Record<string, string>;
  buildCommand?: string;
  startCommand: string;
  healthCheckPath?: string;
}

export interface DeploymentLogs {
  stdout: string;
  stderr: string;
}

export interface DomainRecord {
  id: number;
  project_id: string;
  domain: string;
  ssl_enabled: number;
  ssl_auto: number;
  created_at: string;
}
