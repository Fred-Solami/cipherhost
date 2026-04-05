import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deploymentApi } from '../services/api';
import { Plus, X } from 'lucide-react';
import ApplicationCard from '../components/ApplicationCard';

export default function Applications() {
  const [showForm, setShowForm] = useState(false);
  const [deploymentType, setDeploymentType] = useState<'git' | 'local'>('git');
  const queryClient = useQueryClient();

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: async () => {
      const response = await deploymentApi.list();
      return response.data;
    },
    refetchInterval: 5000,
  });

  const deployMutation = useMutation({
    mutationFn: deploymentApi.deploy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowForm(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const envVars: Record<string, string> = {};
    const envString = formData.get('environmentVariables') as string;
    if (envString) {
      envString.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          envVars[key.trim()] = value.trim();
        }
      });
    }

    const basePayload = {
      name: formData.get('name') as string,
      domain: formData.get('domain') as string,
      startCommand: formData.get('startCommand') as string,
      buildCommand: formData.get('buildCommand') as string || undefined,
      healthCheckPath: formData.get('healthCheckPath') as string || '/',
      environmentVariables: Object.keys(envVars).length > 0 ? envVars : undefined,
    };

    if (deploymentType === 'git') {
      deployMutation.mutate({
        ...basePayload,
        repositoryUrl: formData.get('repositoryUrl') as string,
        branch: formData.get('branch') as string,
      });
    } else {
      deployMutation.mutate({
        ...basePayload,
        localPath: formData.get('localPath') as string,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Applications</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 transition text-sm sm:text-base whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">New Deployment</span>
          <span className="sm:hidden">Deploy</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">New Deployment</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Deployment Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deploymentType"
                      value="git"
                      checked={deploymentType === 'git'}
                      onChange={() => setDeploymentType('git')}
                      className="w-4 h-4"
                    />
                    <span className="text-white">Git Repository</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deploymentType"
                      value="local"
                      checked={deploymentType === 'local'}
                      onChange={() => setDeploymentType('local')}
                      className="w-4 h-4"
                    />
                    <span className="text-white">Local Folder</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Application Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="my-app"
                />
              </div>

              {deploymentType === 'git' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Git Repository URL *
                    </label>
                    <input
                      type="text"
                      name="repositoryUrl"
                      required
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                      placeholder="https://github.com/user/repo.git"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Branch *
                    </label>
                    <input
                      type="text"
                      name="branch"
                      required
                      defaultValue="main"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Local Folder Path *
                  </label>
                  <input
                    type="text"
                    name="localPath"
                    required
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="C:\Projects\my-app"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Full path to the application folder on this server
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Domain *
                </label>
                <input
                  type="text"
                  name="domain"
                  required
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="myapp.local"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Start Command *
                </label>
                <input
                  type="text"
                  name="startCommand"
                  required
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="npm start"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Build Command (optional)
                </label>
                <input
                  type="text"
                  name="buildCommand"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="npm run build"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Health Check Path
                </label>
                <input
                  type="text"
                  name="healthCheckPath"
                  defaultValue="/"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Environment Variables (one per line: KEY=value)
                </label>
                <textarea
                  name="environmentVariables"
                  rows={4}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
                  placeholder="NODE_ENV=production&#10;API_KEY=your-key"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={deployMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition disabled:opacity-50"
                >
                  {deployMutation.isPending ? 'Deploying...' : 'Deploy Application'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-dark-bg hover:bg-gray-700 text-white rounded-lg transition"
                >
                  Cancel
                </button>
              </div>

              {deployMutation.isError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
                  Deployment failed. Please check your configuration.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : deployments.length === 0 ? (
        <div className="bg-dark-card rounded-lg p-12 text-center">
          <p className="text-gray-400 mb-4">No applications deployed yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 transition"
          >
            <Plus className="w-5 h-5" />
            Deploy Your First Application
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deployments.map((deployment) => (
            <ApplicationCard key={deployment.project_id} deployment={deployment} />
          ))}
        </div>
      )}
    </div>
  );
}
