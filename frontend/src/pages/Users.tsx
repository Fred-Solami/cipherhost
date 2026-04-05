import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Shield, Eye, X } from 'lucide-react';
import { userApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { User } from '../types';

export default function Users() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' });
  const [error, setError] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => userApi.create(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setNewUser({ username: '', password: '', role: 'viewer' });
      setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Failed to create user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => userApi.delete(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      userApi.update(userId, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-gray-400 text-center mt-20">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>You don't have permission to manage users.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Manage who has access to CipherHost</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm sm:text-base self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-5 sm:p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Create User</h2>
              <button onClick={() => { setShowCreate(false); setError(''); }} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="viewer">Viewer — Read-only access</option>
                  <option value="admin">Admin — Full access</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setError(''); }}
                className="flex-1 bg-dark-bg border border-dark-border text-gray-300 py-2 rounded-lg hover:bg-dark-border transition"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-2 rounded-lg transition"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users List */}
      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading...</div>
      ) : users.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-lg text-center text-gray-400 py-8">No users found</div>
      ) : (
        <div className="space-y-3">
          {users.map((user: User) => (
            <div key={user.id} className="bg-dark-card border border-dark-border rounded-lg p-4 hover:bg-dark-bg/50 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {user.username[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium truncate">{user.username}</span>
                      {user.id === currentUser?.id && (
                        <span className="text-xs text-gray-500">(you)</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(user.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={() => {
                      if (user.id === currentUser?.id) return;
                      const newRole = user.role === 'admin' ? 'viewer' : 'admin';
                      roleMutation.mutate({ userId: user.id, role: newRole });
                    }}
                    disabled={user.id === currentUser?.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      user.role === 'admin'
                        ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                        : 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
                    } ${user.id === currentUser?.id ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                  >
                    {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {user.role}
                  </button>
                  {user.id !== currentUser?.id && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete user "${user.username}"?`)) {
                          deleteMutation.mutate(user.id);
                        }
                      }}
                      className="text-gray-400 hover:text-red-400 transition p-1"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
