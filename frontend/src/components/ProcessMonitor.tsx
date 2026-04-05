import { ProcessInfo } from '../types';
import { Zap } from 'lucide-react';

interface ProcessMonitorProps {
  processes: ProcessInfo[];
}

export default function ProcessMonitor({ processes }: ProcessMonitorProps) {
  const formatMemory = (bytes: number) => {
    return `${Math.round(bytes / 1024 / 1024)}M`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h3 className="font-bold text-white mb-4">Process Monitor</h3>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-gray-400 pb-2 border-b border-dark-border">
            <span>Name</span>
            <span>Status</span>
            <span>Memory</span>
          </div>
          {processes.length === 0 ? (
            <div className="text-xs text-gray-500 py-4 text-center">
              No processes running
            </div>
          ) : (
            processes.slice(0, 8).map((process, index) => (
              <div key={index} className="flex justify-between text-xs text-gray-300">
                <span className={process.status === 'online' ? 'text-green-400' : 'text-gray-400'}>
                  {process.name}
                </span>
                <span className="capitalize">{process.status}</span>
                <span>{formatMemory(process.memory)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">System Info</h3>
          <Zap className="w-4 h-4 text-blue-400" />
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Processes</span>
            <span className="text-white">{processes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Running</span>
            <span className="text-green-400">
              {processes.filter(p => p.status === 'online').length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stopped</span>
            <span className="text-gray-400">
              {processes.filter(p => p.status !== 'online').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
