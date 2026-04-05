import { useQuery } from '@tanstack/react-query';
import { deploymentApi, processApi } from '../services/api';
import StatsCard from '../components/StatsCard';
import ApplicationCard from '../components/ApplicationCard';
import ProcessMonitor from '../components/ProcessMonitor';
import { Activity, Server, Globe, GitBranch } from 'lucide-react';

export default function Dashboard() {
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: async () => {
      const response = await deploymentApi.list();
      return response.data;
    },
    refetchInterval: 5000,
  });

  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const response = await processApi.list();
      return response.data;
    },
    refetchInterval: 3000,
  });

  const runningCount = deployments.filter((d) => d.status === 'RUNNING').length;
  const deployingCount = deployments.filter((d) => d.status === 'DEPLOYING').length;
  const crashedCount = deployments.filter((d) => d.status === 'CRASHED').length;
  const stoppedCount = deployments.filter((d) => d.status === 'STOPPED').length;
  const totalApps = deployments.length;

  const healthScore = totalApps > 0 
    ? Math.round((runningCount / totalApps) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatsCard
          title="Applications"
          value={`${runningCount} Running`}
          subtitle={`${stoppedCount} Stopped | ${crashedCount} Crashed`}
          icon={<Activity className="w-6 h-6 text-green-400" />}
          color="green"
        />
        <StatsCard
          title="Health Score"
          value={`${healthScore}%`}
          subtitle={`${runningCount} of ${totalApps} healthy`}
          icon={<Server className="w-6 h-6 text-blue-400" />}
          color="blue"
        />
        <StatsCard
          title="Domains"
          value={`${totalApps} Configured`}
          subtitle="Caddy reverse proxy"
          icon={<Globe className="w-6 h-6 text-purple-400" />}
          color="purple"
        />
        <StatsCard
          title="Deployments"
          value={`${totalApps} Total`}
          subtitle={`${deployingCount} in progress`}
          icon={<GitBranch className="w-6 h-6 text-yellow-400" />}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold mb-4">Applications Grid</h2>
          {isLoading ? (
            <div className="text-gray-400">Loading...</div>
          ) : deployments.length === 0 ? (
            <div className="bg-dark-card rounded-lg p-8 text-center text-gray-400">
              No applications deployed yet
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {deployments.map((deployment) => (
                <ApplicationCard key={deployment.project_id} deployment={deployment} />
              ))}
            </div>
          )}
        </div>

        <div>
          <ProcessMonitor processes={processes} />
        </div>
      </div>
    </div>
  );
}
