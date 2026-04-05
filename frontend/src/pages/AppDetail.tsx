import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deploymentApi, processApi, webhookApi, domainApi } from '../services/api';
import { DeploymentHistory, DomainRecord } from '../types';
import {
  ArrowLeft,
  RotateCw,
  Square,
  Trash2,
  Globe,
  Server,
  Terminal,
  History,
  Settings,
  Shield,
  RefreshCw,
  Undo2,
} from 'lucide-react';

import TechLogo from '../components/TechLogo';

type Tab = 'overview' | 'logs' | 'history' | 'env' | 'domains' | 'webhook';

export default function AppDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: deployment, isLoading } = useQuery({
    queryKey: ['deployment', projectId],
    queryFn: async () => (await deploymentApi.get(projectId!)).data,
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const restartMutation = useMutation({
    mutationFn: () => processApi.restart(projectId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployment', projectId] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => processApi.stop(projectId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployment', projectId] }),
  });

  const redeployMutation = useMutation({
    mutationFn: () => deploymentApi.redeploy(projectId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployment', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deploymentApi.delete(projectId!),
    onSuccess: () => navigate('/applications'),
  });

  if (isLoading || !deployment) {
    return <div className="text-gray-400 p-8">Loading...</div>;
  }

  const statusColors: Record<string, string> = {
    RUNNING: 'bg-green-500',
    STOPPED: 'bg-gray-500',
    CRASHED: 'bg-red-500',
    DEPLOYING: 'bg-yellow-500',
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Server className="w-4 h-4" /> },
    { id: 'domains', label: 'Domains', icon: <Globe className="w-4 h-4" /> },
    { id: 'logs', label: 'Logs', icon: <Terminal className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
    { id: 'env', label: 'Environment', icon: <Settings className="w-4 h-4" /> },
    { id: 'webhook', label: 'Webhook', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={() => navigate('/applications')}
          className="text-gray-400 hover:text-white transition self-start"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 bg-dark-bg rounded-lg flex items-center justify-center p-1.5 flex-shrink-0">
            <TechLogo type={deployment.project_type} className="w-full h-full" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{deployment.name}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
              <div className={`w-2 h-2 rounded-full ${statusColors[deployment.status]}`} />
              <span className="capitalize">{deployment.status.toLowerCase()}</span>
              <span className="mx-1">·</span>
              <Globe className="w-3 h-3" />
              <span>{deployment.domain}</span>
              <span className="mx-1">·</span>
              <span>Port {deployment.port}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => redeployMutation.mutate()}
            disabled={redeployMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1 sm:gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Redeploy</span>
          </button>
          <button
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1 sm:gap-2"
          >
            <RotateCw className="w-4 h-4" />
            <span className="hidden sm:inline">Restart</span>
          </button>
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1 sm:gap-2"
          >
            <Square className="w-4 h-4" />
            <span className="hidden sm:inline">Stop</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this deployment?')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1 sm:gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-border overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'text-blue-400 border-blue-400'
                  : 'text-gray-400 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab deployment={deployment} />}
        {activeTab === 'domains' && <DomainsTab projectId={projectId!} />}
        {activeTab === 'logs' && <LogsTab projectId={projectId!} />}
        {activeTab === 'history' && <HistoryTab projectId={projectId!} />}
        {activeTab === 'env' && <EnvTab projectId={projectId!} />}
        {activeTab === 'webhook' && <WebhookTab projectId={projectId!} />}
      </div>
    </div>
  );
}

function OverviewTab({ deployment }: { deployment: any }) {
  const formatDate = (d: string) => d ? new Date(d).toLocaleString() : 'N/A';

  const fields = [
    { label: 'Project ID', value: deployment.project_id },
    { label: 'Project Type', value: deployment.project_type },
    { label: 'Domain', value: deployment.domain },
    { label: 'Port', value: deployment.port },
    { label: 'Start Command', value: deployment.start_command },
    { label: 'Build Command', value: deployment.build_command || 'None' },
    { label: 'Health Check', value: deployment.health_check_path },
    { label: 'Repository', value: deployment.repository_url || 'Local deployment' },
    { label: 'Branch', value: deployment.branch || 'N/A' },
    { label: 'Work Directory', value: deployment.work_dir },
    { label: 'Restart Count', value: deployment.restart_count },
    { label: 'Last Deployment', value: formatDate(deployment.last_deployment) },
    { label: 'Last Restart', value: formatDate(deployment.last_restart) },
    { label: 'Created', value: formatDate(deployment.created_at) },
  ];

  return (
    <div className="bg-dark-card border border-dark-border rounded-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-dark-border">
        {fields.map((field, index) => (
          <div key={field.label} className={`px-6 py-4 ${index % 2 === 0 ? '' : 'border-l border-dark-border'}`}>
            <dt className="text-sm text-gray-400">{field.label}</dt>
            <dd className="text-white mt-1 font-mono text-sm break-all">{field.value}</dd>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogsTab({ projectId }: { projectId: string }) {
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['logs', projectId],
    queryFn: async () => (await deploymentApi.logs(projectId, 500)).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Application Logs</h3>
        <button
          onClick={() => refetch()}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <RotateCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading logs...</p>
      ) : (
        <div className="space-y-4">
          {logs?.stdout && (
            <div>
              <h4 className="text-sm font-medium text-green-400 mb-2">stdout</h4>
              <pre className="bg-black/80 border border-dark-border rounded-lg p-4 text-xs text-gray-300 font-mono overflow-auto max-h-[500px] whitespace-pre-wrap">
                {logs.stdout || '(empty)'}
              </pre>
            </div>
          )}
          {logs?.stderr && (
            <div>
              <h4 className="text-sm font-medium text-red-400 mb-2">stderr</h4>
              <pre className="bg-black/80 border border-dark-border rounded-lg p-4 text-xs text-red-300 font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                {logs.stderr}
              </pre>
            </div>
          )}
          {!logs?.stdout && !logs?.stderr && (
            <p className="text-gray-400">No logs available yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['history', projectId],
    queryFn: async () => (await deploymentApi.history(projectId)).data,
  });

  const rollbackMutation = useMutation({
    mutationFn: (version: number) => deploymentApi.rollback(projectId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history', projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployment', projectId] });
    },
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      SUCCESS: 'bg-green-500/20 text-green-400',
      FAILED: 'bg-red-500/20 text-red-400',
      ROLLED_BACK: 'bg-yellow-500/20 text-yellow-400',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Deployment History</h3>

      {isLoading ? (
        <p className="text-gray-400">Loading history...</p>
      ) : history.length === 0 ? (
        <p className="text-gray-400">No deployment history yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((h: DeploymentHistory) => (
            <div key={h.id} className="bg-dark-card border border-dark-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-mono font-bold">v{h.version}</span>
                {statusBadge(h.status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <span className="text-gray-500">By: </span>
                  <span className="text-gray-300">{h.triggered_by}</span>
                </div>
                <div>
                  <span className="text-gray-500">Commit: </span>
                  <span className="text-gray-400 font-mono text-xs">{h.commit_hash ? h.commit_hash.slice(0, 8) : '-'}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">{new Date(h.created_at).toLocaleString()}</div>
              {h.status === 'SUCCESS' && h.snapshot_path && (
                <button
                  onClick={() => {
                    if (confirm(`Rollback to version ${h.version}?`)) {
                      rollbackMutation.mutate(h.version);
                    }
                  }}
                  disabled={rollbackMutation.isPending}
                  className="text-yellow-400 hover:text-yellow-300 text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <Undo2 className="w-3 h-3" />
                  Rollback
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [envText, setEnvText] = useState('');

  const { data: envVars, isLoading } = useQuery({
    queryKey: ['env', projectId],
    queryFn: async () => (await deploymentApi.getEnv(projectId)).data,
    onSuccess: (data: Record<string, string>) => {
      setEnvText(Object.entries(data).map(([k, v]) => `${k}=${v}`).join('\n'));
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed: Record<string, string> = {};
      envText.split('\n').forEach((line) => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          parsed[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      });
      return deploymentApi.updateEnv(projectId, parsed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env', projectId] });
      setEditing(false);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Environment Variables</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm text-blue-400 hover:text-blue-300">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-sm text-gray-400 hover:text-gray-300">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="text-sm text-green-400 hover:text-green-300 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading...</p>
      ) : editing ? (
        <textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          rows={10}
          className="w-full bg-black/80 border border-dark-border rounded-lg p-4 text-sm text-gray-300 font-mono resize-y focus:outline-none focus:border-blue-500"
          placeholder="KEY=value"
        />
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
          {envVars && Object.keys(envVars).length > 0 ? (
            <div className="divide-y divide-dark-border">
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} className="px-4 py-3">
                  <dt className="text-xs text-gray-400 mb-1">{key}</dt>
                  <dd className="text-white font-mono text-sm break-all">{value as string}</dd>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-gray-400">No environment variables configured.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DomainsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains', projectId],
    queryFn: async () => (await domainApi.list(projectId)).data,
  });

  const addMutation = useMutation({
    mutationFn: (domain: string) => domainApi.add(projectId, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', projectId] });
      setNewDomain('');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to add domain');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (domainId: number) => domainApi.remove(projectId, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', projectId] });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    setError('');
    addMutation.mutate(d);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Domains</h3>
        <p className="text-sm text-gray-400">
          Add public domains that point to this application. Caddy will automatically configure reverse-proxy routing and provision SSL certificates via Let's Encrypt.
        </p>
      </div>

      {/* Add domain form */}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="e.g. myapp.fredsolami.tech"
          className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !newDomain.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Globe className="w-4 h-4" />
          {addMutation.isPending ? 'Adding...' : 'Save Domain'}
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Domain list */}
      {isLoading ? (
        <p className="text-gray-400">Loading domains...</p>
      ) : domains.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-lg p-8 text-center">
          <Globe className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No domains configured yet.</p>
          <p className="text-sm text-gray-500 mt-1">Add a domain above to route traffic to this application.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((d: DomainRecord) => (
            <div key={d.id} className="bg-dark-card border border-dark-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <a
                    href={`https://${d.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-sm truncate"
                  >
                    {d.domain}
                  </a>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Remove domain ${d.domain}?`)) {
                      removeMutation.mutate(d.id);
                    }
                  }}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50 flex-shrink-0 ml-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between text-sm">
                {d.ssl_auto ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Auto SSL
                  </span>
                ) : (
                  <span className="text-gray-500">No SSL</span>
                )}
                <span className="text-gray-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState('github');

  const { data: webhook, isLoading, error } = useQuery({
    queryKey: ['webhook', projectId],
    queryFn: async () => (await webhookApi.get(projectId)).data,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => webhookApi.create(projectId, { provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook', projectId] });
      setCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => webhookApi.delete(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook', projectId] }),
  });

  if (isLoading) return <p className="text-gray-400">Loading...</p>;

  if (error || !webhook) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Webhook / CI/CD</h3>
        <p className="text-gray-400">No webhook configured for this deployment.</p>

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Setup Webhook
          </button>
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white text-sm"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="bitbucket">Bitbucket</option>
                <option value="generic">Generic</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
              >
                Create
              </button>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-white px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Webhook / CI/CD</h3>
        <button
          onClick={() => {
            if (confirm('Delete this webhook config?')) deleteMutation.mutate();
          }}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          Delete Webhook
        </button>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-400">Provider</dt>
            <dd className="text-white capitalize">{webhook.provider}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Status</dt>
            <dd className={webhook.active ? 'text-green-400' : 'text-gray-500'}>
              {webhook.active ? 'Active' : 'Inactive'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Events</dt>
            <dd className="text-white">{webhook.events}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Branch Filter</dt>
            <dd className="text-white">{webhook.branch_filter || 'All branches'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm text-gray-400">Webhook URL</dt>
            <dd className="text-white font-mono text-sm break-all">
              {window.location.origin}/api/webhooks/{projectId}
            </dd>
          </div>
          {webhook.last_triggered && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-400">Last Triggered</dt>
              <dd className="text-white">{new Date(webhook.last_triggered).toLocaleString()}</dd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
