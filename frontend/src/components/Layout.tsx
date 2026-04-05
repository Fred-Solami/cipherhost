import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, FileCode, Users, LogOut, Shield, Eye, PanelLeftClose, PanelLeft, Settings } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-dark-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} fixed lg:relative z-40 h-full bg-dark-card border-r border-dark-border flex flex-col overflow-hidden transition-all duration-300`}>
        <div className="p-6 flex-1 min-w-[16rem]">
          <div className="flex items-center gap-3 mb-8">
            <img 
              src="/logo.png" 
              alt="CipherHost Logo" 
              className="w-10 h-10 rounded-lg"
            />
            <div>
              <h1 className="text-xl font-bold text-white">CIPHER</h1>
              <p className="text-xs text-gray-400">HOST v1.0</p>
            </div>
          </div>

          <nav className="space-y-2">
            <Link
              to="/"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive('/') 
                  ? 'bg-blue-600/10 text-blue-400' 
                  : 'text-gray-400 hover:bg-dark-bg'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span>Dashboard</span>
            </Link>
            <Link
              to="/applications"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive('/applications') 
                  ? 'bg-blue-600/10 text-blue-400' 
                  : 'text-gray-400 hover:bg-dark-bg'
              }`}
            >
              <FileCode className="w-5 h-5" />
              <span>Applications</span>
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/users"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive('/users') 
                    ? 'bg-blue-600/10 text-blue-400' 
                    : 'text-gray-400 hover:bg-dark-bg'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Users</span>
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link
                to="/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive('/settings') 
                    ? 'bg-blue-600/10 text-blue-400' 
                    : 'text-gray-400 hover:bg-dark-bg'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            )}
          </nav>
        </div>

        {/* User info + Logout */}
        <div className="p-4 border-t border-dark-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-sm font-medium">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{user?.username}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                {user?.role === 'admin' ? <Shield className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {user?.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-dark-bg rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="bg-dark-card border-b border-dark-border px-4 sm:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-400 hover:text-white transition"
                title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
              </button>
              <span className="text-white font-semibold text-sm sm:text-base truncate">
                CipherHost
                <span className="hidden sm:inline"> - Windows Server Deployment Orchestration</span>
              </span>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
