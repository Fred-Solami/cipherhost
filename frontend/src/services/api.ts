import axios from 'axios';
import { Deployment, DeploymentRequest, ProcessInfo, LoginResponse, User, DeploymentHistory, DeploymentLogs, WebhookConfig, AuditLog, DomainRecord } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const userApi = {
  list: () => api.get<User[]>('/users'),
  create: (data: { username: string; password: string; role: string }) =>
    api.post('/users', data),
  update: (userId: string, data: { role?: string; password?: string }) =>
    api.put(`/users/${userId}`, data),
  delete: (userId: string) => api.delete(`/users/${userId}`),
};

export const deploymentApi = {
  deploy: (data: DeploymentRequest) => api.post('/deployments', data),
  list: () => api.get<Deployment[]>('/deployments'),
  get: (projectId: string) => api.get<Deployment>(`/deployments/${projectId}`),
  delete: (projectId: string) => api.delete(`/deployments/${projectId}`),
  redeploy: (projectId: string) => api.post(`/deployments/${projectId}/redeploy`),
  rollback: (projectId: string, version?: number) =>
    api.post(`/deployments/${projectId}/rollback`, { version }),
  history: (projectId: string) =>
    api.get<DeploymentHistory[]>(`/deployments/${projectId}/history`),
  logs: (projectId: string, lines?: number) =>
    api.get<DeploymentLogs>(`/deployments/${projectId}/logs`, { params: { lines } }),
  getEnv: (projectId: string) =>
    api.get<Record<string, string>>(`/deployments/${projectId}/env`),
  updateEnv: (projectId: string, env: Record<string, string>) =>
    api.put(`/deployments/${projectId}/env`, env),
};

export const webhookApi = {
  get: (projectId: string) =>
    api.get<WebhookConfig>(`/deployments/${projectId}/webhook`),
  create: (projectId: string, data: { provider?: string; events?: string; branchFilter?: string }) =>
    api.post(`/deployments/${projectId}/webhook`, data),
  update: (projectId: string, data: { provider?: string; events?: string; branchFilter?: string; active?: number }) =>
    api.put(`/deployments/${projectId}/webhook`, data),
  delete: (projectId: string) =>
    api.delete(`/deployments/${projectId}/webhook`),
};

export const domainApi = {
  list: (projectId: string) =>
    api.get<DomainRecord[]>(`/deployments/${projectId}/domains`),
  add: (projectId: string, domain: string) =>
    api.post<DomainRecord>(`/deployments/${projectId}/domains`, { domain }),
  remove: (projectId: string, domainId: number) =>
    api.delete(`/deployments/${projectId}/domains/${domainId}`),
};

export const auditApi = {
  recent: (limit?: number) => api.get<AuditLog[]>('/audit-logs', { params: { limit } }),
  byProject: (projectId: string, limit?: number) =>
    api.get<AuditLog[]>(`/audit-logs/${projectId}`, { params: { limit } }),
};

export const processApi = {
  list: () => api.get<ProcessInfo[]>('/processes'),
  getStatus: (projectId: string) => api.get(`/processes/${projectId}/status`),
  restart: (projectId: string) => api.post(`/processes/${projectId}/restart`),
  stop: (projectId: string) => api.post(`/processes/${projectId}/stop`),
};

export const healthApi = {
  system: () => api.get('/health'),
  project: (projectId: string) => api.get(`/health/${projectId}`),
};

export default api;
