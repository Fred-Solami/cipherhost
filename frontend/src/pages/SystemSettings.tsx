import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  Database,
  Shield,
  Globe,
  Download,
  Play,
  Square,
  RotateCcw,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Cpu,
  Bell,
  Send,
} from 'lucide-react';
import { serviceApi, backupApi, resourceApi, apacheApi, ldapApi, notificationApi } from '../services/api';
import type { ServiceStatus, BackupMetadata, SystemResources, ApacheStatus, LdapStatus, NotificationConfig } from '../types';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState<'service' | 'backups' | 'resources' | 'integrations' | 'notifications'>('service');

  const tabs = [
    { id: 'service' as const, label: 'Windows Service', icon: Server },
    { id: 'backups' as const, label: 'Backups', icon: Database },
    { id: 'resources' as const, label: 'Resources', icon: Cpu },
    { id: 'integrations' as const, label: 'Integrations', icon: Globe },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">System Settings</h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-dark-card text-gray-400 hover:text-white border border-dark-border'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'service' && <ServiceTab />}
      {activeTab === 'backups' && <BackupsTab />}
      {activeTab === 'resources' && <ResourcesTab />}
      {activeTab === 'integrations' && <IntegrationsTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  );
}

// ─── Windows Service Tab ───

function ServiceTab() {
  const { data: status, isLoading } = useQuery<ServiceStatus>({
    queryKey: ['service-status'],
    queryFn: async () => (await serviceApi.status()).data,
    refetchInterval: 5000,
  });

  const installMutation = useMutation({
    mutationFn: () => serviceApi.install(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-status'] }),
  });

  const uninstallMutation = useMutation({
    mutationFn: () => serviceApi.uninstall(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-status'] }),
  });

  const startMutation = useMutation({
    mutationFn: () => serviceApi.start(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-status'] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => serviceApi.stop(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-status'] }),
  });

  const restartMutation = useMutation({
    mutationFn: () => serviceApi.restart(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-status'] }),
  });

  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="text-gray-400">Loading service status...</div>;
  }

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Server className="w-5 h-5 text-blue-400" />
        Windows Service
      </h3>

      <p className="text-sm text-gray-400 mb-6">
        Install CipherHost as a Windows Service so it starts automatically on boot and survives RDP logouts.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatusCard label="Installed" value={status?.installed ? 'Yes' : 'No'} ok={status?.installed} />
        <StatusCard label="Running" value={status?.running ? 'Yes' : 'No'} ok={status?.running} />
        <StatusCard label="Start Type" value={status?.startType || 'N/A'} />
        <StatusCard label="Account" value={status?.account || 'N/A'} />
      </div>

      <div className="flex flex-wrap gap-3">
        {!status?.installed && (
          <ActionButton
            onClick={() => installMutation.mutate()}
            loading={installMutation.isPending}
            icon={Download}
            label="Install Service"
            variant="primary"
          />
        )}
        {status?.installed && !status?.running && (
          <ActionButton
            onClick={() => startMutation.mutate()}
            loading={startMutation.isPending}
            icon={Play}
            label="Start"
            variant="green"
          />
        )}
        {status?.installed && status?.running && (
          <>
            <ActionButton
              onClick={() => stopMutation.mutate()}
              loading={stopMutation.isPending}
              icon={Square}
              label="Stop"
              variant="red"
            />
            <ActionButton
              onClick={() => restartMutation.mutate()}
              loading={restartMutation.isPending}
              icon={RotateCcw}
              label="Restart"
              variant="yellow"
            />
          </>
        )}
        {status?.installed && (
          <ActionButton
            onClick={() => {
              if (confirm('Uninstall the Windows Service?')) uninstallMutation.mutate();
            }}
            loading={uninstallMutation.isPending}
            icon={Trash2}
            label="Uninstall"
            variant="red"
          />
        )}
      </div>

      {(installMutation.isError || uninstallMutation.isError || startMutation.isError || stopMutation.isError) && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          Operation failed. Make sure the backend is running with admin privileges.
        </div>
      )}
    </div>
  );
}

// ─── Backups Tab ───

function BackupsTab() {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data: backups, isLoading } = useQuery<BackupMetadata[]>({
    queryKey: ['backups'],
    queryFn: async () => (await backupApi.list()).data,
  });

  const { data: config } = useQuery({
    queryKey: ['backup-config'],
    queryFn: async () => (await backupApi.config()).data,
  });

  const createMutation = useMutation({
    mutationFn: () => backupApi.create(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  const restoreMutation = useMutation({
    mutationFn: (filename: string) => backupApi.restore(filename),
    onSuccess: () => {
      setRestoring(null);
      alert('Database restored. Restart the server to apply changes.');
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { data } = await backupApi.exportConfig();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cipherhost-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Backup & Recovery
        </h3>

        {config && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatusCard label="Auto Backup" value={config.enabled ? 'Active' : 'Inactive'} ok={config.enabled} />
            <StatusCard label="Interval" value={`${config.intervalHours}h`} />
            <StatusCard label="Retention" value={`${config.retentionCount} backups`} />
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-6">
          <ActionButton
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            icon={Database}
            label="Create Backup Now"
            variant="primary"
          />
          <ActionButton
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isPending}
            icon={Download}
            label="Export Config (JSON)"
            variant="default"
          />
        </div>

        <h4 className="text-sm font-medium text-gray-300 mb-3">Backup History</h4>

        {isLoading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : !backups?.length ? (
          <div className="text-gray-500 text-sm">No backups yet</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {backups.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-dark-bg rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{b.filename}</p>
                  <p className="text-xs text-gray-400">
                    {b.type} &middot; {(b.sizeBytes / 1024).toFixed(1)} KB &middot;{' '}
                    {new Date(b.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Restore from ${b.filename}? This will replace the current database.`)) {
                      setRestoring(b.filename);
                      restoreMutation.mutate(b.filename);
                    }
                  }}
                  disabled={restoreMutation.isPending}
                  className="ml-3 text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                >
                  {restoring === b.filename ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Resources Tab ───

function ResourcesTab() {
  const { data: resources, isLoading } = useQuery<SystemResources>({
    queryKey: ['system-resources'],
    queryFn: async () => (await resourceApi.system()).data,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="text-gray-400">Loading system resources...</div>;
  }

  if (!resources) return null;

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-400" />
          System Overview
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatusCard label="Total Memory" value={`${(resources.totalMemoryMB / 1024).toFixed(1)} GB`} />
          <StatusCard
            label="Used Memory"
            value={`${resources.usedPercent}%`}
            ok={resources.usedPercent < 90}
            warn={resources.usedPercent >= 75}
          />
          <StatusCard label="Free Memory" value={`${(resources.freeMemoryMB / 1024).toFixed(1)} GB`} />
          <StatusCard label="CPU Cores" value={String(resources.cpuCount)} />
        </div>

        {resources.apps.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Per-App Resource Usage</h4>
            {resources.apps.map(app => (
              <div key={app.projectId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-dark-bg rounded-lg gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{app.name}</p>
                  <p className="text-xs text-gray-400">{app.status}</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-300">
                    CPU: <span className="text-white">{app.cpu.toFixed(1)}%</span>
                  </span>
                  <span className="text-gray-300">
                    RAM: <span className={`${app.memoryPercent && app.memoryPercent > 90 ? 'text-red-400' : 'text-white'}`}>
                      {app.memoryMB} MB
                    </span>
                    {app.memoryLimitMB && (
                      <span className="text-gray-500"> / {app.memoryLimitMB} MB</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No running apps to monitor</p>
        )}
      </div>
    </div>
  );
}

// ─── Integrations Tab ───

function IntegrationsTab() {
  const { data: apache } = useQuery<ApacheStatus>({
    queryKey: ['apache-status'],
    queryFn: async () => (await apacheApi.status()).data,
  });

  const { data: ldap } = useQuery<LdapStatus>({
    queryKey: ['ldap-status'],
    queryFn: async () => (await ldapApi.status()).data,
  });

  const ldapTestMutation = useMutation({
    mutationFn: () => ldapApi.test(),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Apache */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-orange-400" />
          Apache / PHP
        </h3>

        <div className="space-y-3">
          <StatusCard label="Available" value={apache?.available ? 'Yes' : 'No'} ok={apache?.available} />
          {apache?.available && (
            <>
              <StatusCard label="Running" value={apache.running ? 'Yes' : 'No'} ok={apache.running} />
              <StatusCard label="Version" value={apache.version || 'Unknown'} />
              <StatusCard label="VHosts" value={String(apache.vhostCount)} />
            </>
          )}
          {!apache?.available && (
            <p className="text-xs text-gray-500">
              Apache not found. Set APACHE_DIR and APACHE_ENABLED=true in .env to enable PHP deployment.
            </p>
          )}
        </div>
      </div>

      {/* LDAP / Active Directory */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Active Directory / LDAP
        </h3>

        <div className="space-y-3">
          <StatusCard label="Enabled" value={ldap?.enabled ? 'Yes' : 'No'} ok={ldap?.enabled} />
          {ldap?.enabled && (
            <StatusCard label="Connected" value={ldap.connected ? 'Yes' : 'No'} ok={ldap.connected} />
          )}
          {!ldap?.enabled && (
            <p className="text-xs text-gray-500">
              LDAP not configured. Set LDAP_ENABLED=true and LDAP connection details in .env.
            </p>
          )}
        </div>

        {ldap?.enabled && (
          <div className="mt-4">
            <ActionButton
              onClick={() => ldapTestMutation.mutate()}
              loading={ldapTestMutation.isPending}
              icon={Shield}
              label="Test Connection"
              variant="default"
            />
            {ldapTestMutation.isSuccess && (
              <p className="mt-2 text-xs text-green-400">Connection successful</p>
            )}
            {ldapTestMutation.isError && (
              <p className="mt-2 text-xs text-red-400">Connection failed</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notifications Tab ───

function NotificationsTab() {
  const { data: cfg, isLoading } = useQuery<NotificationConfig>({
    queryKey: ['notification-config'],
    queryFn: async () => (await notificationApi.config()).data,
  });

  const testMutation = useMutation({
    mutationFn: () => notificationApi.test(),
  });

  if (isLoading) {
    return <div className="text-gray-400">Loading notification settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          Email Notifications
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <StatusCard label="Enabled" value={cfg?.enabled ? 'Yes' : 'No'} ok={cfg?.enabled} />
          <StatusCard label="SMTP Host" value={cfg?.smtpHost || 'Not set'} ok={!!cfg?.smtpHost} />
          <StatusCard label="SMTP Port" value={String(cfg?.smtpPort || 587)} />
          <StatusCard label="From" value={cfg?.fromEmail || 'Not set'} />
          <StatusCard label="From Name" value={cfg?.fromName || 'CipherHost'} />
          <StatusCard label="Admin Email" value={cfg?.adminEmail || 'Not set'} ok={!!cfg?.adminEmail} />
        </div>

        {cfg?.enabled ? (
          <div>
            <ActionButton
              onClick={() => testMutation.mutate()}
              loading={testMutation.isPending}
              icon={Send}
              label="Send Test Email"
              variant="primary"
            />
            {testMutation.isSuccess && (
              <p className="mt-2 text-xs text-green-400">
                {testMutation.data?.data?.success
                  ? 'Test email sent successfully. Check your inbox.'
                  : `Failed: ${testMutation.data?.data?.error || 'Unknown error'}`}
              </p>
            )}
            {testMutation.isError && (
              <p className="mt-2 text-xs text-red-400">Failed to send test email</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Notifications are disabled. Set SMTP_ENABLED=true and configure SMTP settings in the backend .env file to enable email alerts.
          </p>
        )}
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Alert triggers</h3>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>Application crash (max restarts exceeded)</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>Memory limit exceeded (process stopped)</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span>HTTP health check failure</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>Scheduled backup completed or failed</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>Deployment succeeded or failed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ───

function StatusCard({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="p-3 bg-dark-bg rounded-lg">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-medium flex items-center gap-1 ${
        ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-white'
      }`}>
        {ok === true && <CheckCircle className="w-3.5 h-3.5" />}
        {ok === false && <XCircle className="w-3.5 h-3.5" />}
        {warn && !ok && <AlertTriangle className="w-3.5 h-3.5" />}
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  icon: Icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  loading: boolean;
  icon: any;
  label: string;
  variant?: 'primary' | 'green' | 'red' | 'yellow' | 'default';
}) {
  const colors = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
    red: 'bg-red-600/20 hover:bg-red-600/30 text-red-400',
    yellow: 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400',
    default: 'bg-dark-bg hover:bg-dark-border text-gray-300 border border-dark-border',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${colors[variant]}`}
    >
      <Icon className="w-4 h-4" />
      {loading ? 'Working...' : label}
    </button>
  );
}
