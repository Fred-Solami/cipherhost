import { useNavigate } from 'react-router-dom';
import { Deployment } from '../types';
import { Square, RotateCw, Globe, Server, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { processApi, deploymentApi } from '../services/api';
import TechLogo from './TechLogo';

interface ApplicationCardProps {
  deployment: Deployment;
}

export default function ApplicationCard({ deployment }: ApplicationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const restartMutation = useMutation({
    mutationFn: () => processApi.restart(deployment.project_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => processApi.stop(deployment.project_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deploymentApi.delete(deployment.project_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const statusColors = {
    RUNNING: 'bg-green-500',
    STOPPED: 'bg-gray-500',
    CRASHED: 'bg-red-500',
    DEPLOYING: 'bg-yellow-500',
  };

  const formatUptime = (timestamp: string) => {
    const now = new Date().getTime();
    const deployed = new Date(timestamp).getTime();
    const diff = now - deployed;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  return (
    <div
      className="bg-dark-card border border-dark-border rounded-lg p-4 sm:p-6 cursor-pointer hover:border-blue-500/50 transition"
      onClick={() => navigate(`/applications/${deployment.project_id}`)}
    >
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-dark-bg rounded-lg flex items-center justify-center p-1.5 flex-shrink-0">
            <TechLogo type={deployment.project_type} className="w-full h-full" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white truncate">{deployment.name}</h3>
            <p className="text-sm text-gray-400">{deployment.project_type}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete ${deployment.name}?`)) {
              deleteMutation.mutate();
            }
          }}
          className="text-gray-500 hover:text-red-400 transition p-1"
          title="Delete deployment"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${statusColors[deployment.status]}`}></div>
        <span className="text-sm text-white capitalize">{deployment.status.toLowerCase()}</span>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2 text-gray-400 min-w-0">
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{deployment.domain}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Server className="w-4 h-4 flex-shrink-0" />
          <span>Port {deployment.port}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); restartMutation.mutate(); }}
          disabled={restartMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium transition disabled:opacity-50"
        >
          <RotateCw className="w-4 h-4 inline mr-1" />
          Restart
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); stopMutation.mutate(); }}
          disabled={stopMutation.isPending}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium transition disabled:opacity-50"
        >
          <Square className="w-4 h-4 inline mr-1" />
          Stop
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-dark-border text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Uptime: {formatUptime(deployment.last_deployment)}</span>
          <span>Restarts: {deployment.restart_count}</span>
        </div>
      </div>
    </div>
  );
}
