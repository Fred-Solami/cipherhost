import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  color: 'green' | 'blue' | 'purple' | 'yellow';
}

export default function StatsCard({ title, value, subtitle, icon, color }: StatsCardProps) {
  const colorClasses = {
    green: 'bg-green-600/10 border-green-600/20',
    blue: 'bg-blue-600/10 border-blue-600/20',
    purple: 'bg-purple-600/10 border-purple-600/20',
    yellow: 'bg-yellow-600/10 border-yellow-600/20',
  };

  return (
    <div className={`${colorClasses[color]} border rounded-lg p-3 sm:p-6`}>
      <div className="flex items-start justify-between mb-2 sm:mb-4">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-white truncate">{value}</p>
        </div>
        <div className="flex-shrink-0 ml-2">{icon}</div>
      </div>
      <p className="text-xs sm:text-sm text-gray-400 truncate">{subtitle}</p>
    </div>
  );
}
