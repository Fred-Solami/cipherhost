export type ProjectType = 'NODEJS' | 'PYTHON' | 'DOTNET' | 'PHP' | 'UNKNOWN';
export type ProcessState = 'RUNNING' | 'STOPPED' | 'CRASHED' | 'DEPLOYING';
export type PortStatus = 'ALLOCATED' | 'RESERVED' | 'RELEASED';
export type UserRole = 'admin' | 'viewer';
export type WebhookProvider = 'github' | 'gitlab' | 'bitbucket' | 'generic';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
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
  secret: string;
  provider: WebhookProvider;
  events: string;
  branch_filter: string | null;
  active: number;
  last_triggered: string | null;
  created_at: string;
}

export interface DeploymentConfig {
  projectId: string;
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

export interface ProjectStatus {
  projectId: string;
  name: string;
  domain: string;
  port: number;
  status: ProcessState;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  lastDeployment: string;
  restartCount: number;
}

export interface PortRegistry {
  port: number;
  project_id: string;
  allocated_at: string;
  status: PortStatus;
}

export interface ProcessConfig {
  name: string;
  script: string;
  cwd: string;
  env: Record<string, string>;
  args?: string[];
  interpreter?: string;
  instances?: number;
  autorestart: boolean;
  max_restarts?: number;
}

export interface CaddyRoute {
  domain: string;
  targetHost: string;
  targetPort: number;
  tlsEnabled: boolean;
  headers?: Record<string, string>;
}

export interface DeploymentResult {
  success: boolean;
  projectId?: string;
  port?: number;
  domain?: string;
  error?: string;
}

export interface BuildResult {
  success: boolean;
  message: string;
  error?: string;
  buildLog?: string;
}

export interface HealthStatus {
  type: 'NoAction' | 'Restarted' | 'Alert' | 'Error';
  message: string;
}

export interface AuditLog {
  id?: number;
  project_id: string | null;
  action: string;
  user_id: string | null;
  details: string | null;
  timestamp: string;
}

export interface DomainRecord {
  id: number;
  project_id: string;
  domain: string;
  ssl_enabled: number;
  ssl_auto: number;
  created_at: string;
}
