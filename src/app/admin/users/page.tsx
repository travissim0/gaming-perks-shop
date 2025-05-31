'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';

export type CTFRoleType = 
  | 'none'
  | 'ctf_admin'
  | 'ctf_head_referee'
  | 'ctf_referee'
  | 'ctf_recorder'
  | 'ctf_commentator';

interface UserProfile {
  id: string;
  email: string;
  in_game_alias: string;
  is_admin: boolean;
  ctf_role: CTFRoleType;
  registration_status: string;
  created_at: string;
  updated_at: string;
}

const CTF_ROLE_INFO = {
  none: { display_name: 'No CTF Role', level: 0, color: 'bg-gray-500 border-gray-600' },
  ctf_admin: { display_name: 'CTF Administrator', level: 90, color: 'bg-purple-500 border-purple-600' },
  ctf_head_referee: { display_name: 'CTF Head Referee', level: 80, color: 'bg-blue-500 border-blue-600' },
  ctf_referee: { display_name: 'CTF Referee', level: 70, color: 'bg-green-500 border-green-600' },
  ctf_recorder: { display_name: 'CTF Recorder', level: 60, color: 'bg-yellow-500 border-yellow-600' },
  ctf_commentator: { display_name: 'CTF Commentator', level: 50, color: 'bg-orange-500 border-orange-600' }
};

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [adminFilter, setAdminFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [profileCheckAttempts, setProfileCheckAttempts] = useState(0);

  // Handle loading timeouts gracefully
  useLoadingTimeout({
    isLoading: loading,
    timeout: 15000,
    onTimeout: () => {
      console.warn('⏰ Auth loading timeout in admin page');
      toast.error('Loading is taking longer than usual. The page may still work.');
    }
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // Check if user is admin - only run once when user changes
    const checkAdmin = async () => {
      if (user && !isAdmin && profileCheckAttempts < 3) {
        try {
          setProfileCheckAttempts(prev => prev + 1);
          
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Admin check timeout')), 8000)
          );

          const adminCheckPromise = supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

          const { data, error } = await Promise.race([adminCheckPromise, timeoutPromise]) as any;

          if (error) {
            if (error.message === 'Admin check timeout') {
              console.warn('Admin check timed out, retrying...');
              // Don't redirect on timeout, just try again
              if (profileCheckAttempts < 2) {
                setTimeout(() => checkAdmin(), 2000);
              }
              return;
            }
            throw error;
          }

          if (!data || !data.is_admin) {
            router.push('/dashboard');
            toast.error('Unauthorized: Admin access required');
            return;
          }

          setIsAdmin(true);
          setProfileCheckAttempts(0); // Reset on success
          fetchUsers();
        } catch (error: any) {
          console.error('Error checking admin status:', error);
          
          // Only redirect on non-timeout errors
          if (!error.message?.includes('timeout') && profileCheckAttempts >= 2) {
            router.push('/dashboard');
          }
        }
      }
    };

    checkAdmin();
  }, [user, loading, isAdmin, profileCheckAttempts]); // Added dependencies to prevent loops

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setError(null);

      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setError('Failed to load users: ' + error.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const isAdmin = newRole === 'admin';
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_admin: isAdmin })
        .eq('id', userId)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('No rows were updated. This might be a permissions issue.');
      }

      toast.success(
        `User role updated to ${newRole === 'admin' ? 'Admin' : 'User'} successfully`
      );
      
      fetchUsers();
    } catch (error: any) {
      console.error('❌ Error updating user role:', error);
      toast.error('Error updating user role: ' + error.message);
    }
  };

  const updateCTFRole = async (userId: string, newCTFRole: CTFRoleType) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ ctf_role: newCTFRole })
        .eq('id', userId)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('No rows were updated. This might be a permissions issue.');
      }

      toast.success(`CTF role updated to ${CTF_ROLE_INFO[newCTFRole].display_name} successfully`);
      fetchUsers();
    } catch (error: any) {
      console.error('❌ Error updating CTF role:', error);
      toast.error('Error updating CTF role: ' + error.message);
    }
  };

  const updateRegistrationStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ registration_status: newStatus })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      toast.success('Registration status updated successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error('Error updating registration status: ' + error.message);
    }
  };

  // Filter and sort users
  const filteredUsers = users
    .filter(user => {
      const matchesSearch = 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.in_game_alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        CTF_ROLE_INFO[user.ctf_role || 'none'].display_name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || user.registration_status === statusFilter;
      const matchesAdmin = adminFilter === 'all' || 
        (adminFilter === 'admin' && user.is_admin) ||
        (adminFilter === 'user' && !user.is_admin);

      const matchesRole = roleFilter === 'all' || user.ctf_role === roleFilter;
      
      return matchesSearch && matchesStatus && matchesAdmin && matchesRole;
    })
    .sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'email':
          aValue = a.email;
          bValue = b.email;
          break;
        case 'alias':
          aValue = a.in_game_alias || '';
          bValue = b.in_game_alias || '';
          break;
        case 'status':
          aValue = a.registration_status;
          bValue = b.registration_status;
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const totalUsers = filteredUsers.length;
  const adminCount = filteredUsers.filter(u => u.is_admin).length;
  const activeUsers = filteredUsers.filter(u => u.registration_status === 'completed').length;
  const ctfUsersCount = filteredUsers.filter(u => u.ctf_role && u.ctf_role !== 'none').length;

  if (loading || !isAdmin) {
    // Don't show loading forever if auth timed out
    if (loading && profileCheckAttempts >= 3) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-400 text-lg mb-4">⚠️ Loading timeout</div>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Admin: Manage Users</h1>
          <button
            onClick={() => fetchUsers()}
            disabled={loadingUsers}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
          >
            {loadingUsers ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-6 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            <div className="flex items-start">
              <span className="text-red-400 mr-3 mt-1">⚠️</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-300 mb-2">Error Loading Users</h3>
                <p>{error}</p>
                <button
                  onClick={() => fetchUsers()}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Users</h2>
            <p className="text-3xl font-bold text-white">{totalUsers.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Admin Users</h2>
            <p className="text-3xl font-bold text-yellow-400">{adminCount.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Active Users</h2>
            <p className="text-3xl font-bold text-green-400">{activeUsers.toLocaleString()}</p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">CTF Role Users</h2>
            <p className="text-3xl font-bold text-purple-400">{ctfUsersCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Email, alias, role..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Registration Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">User Type</label>
              <select
                value={adminFilter}
                onChange={(e) => setAdminFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Users</option>
                <option value="admin">Admins Only</option>
                <option value="user">Regular Users</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">CTF Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All CTF Roles</option>
                {Object.entries(CTF_ROLE_INFO).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.display_name} {info.level > 0 && `(L${info.level})`}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="created_at">Date Joined</option>
                <option value="email">Email</option>
                <option value="alias">In-Game Alias</option>
                <option value="status">Registration Status</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">User Management</h2>
          </div>
          
          {loadingUsers ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              No users found. Try adjusting your search filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Admin Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      CTF Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800/30 divide-y divide-gray-700">
                  {filteredUsers.map((userProfile) => (
                    <tr key={userProfile.id} className="hover:bg-gray-700/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-white">{userProfile.email}</div>
                          <div className="text-sm text-gray-400">
                            {userProfile.in_game_alias ? (
                              <span className="font-mono bg-gray-700 px-2 py-1 rounded text-cyan-300">
                                {userProfile.in_game_alias}
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">No alias</span>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={userProfile.registration_status}
                          onChange={(e) => updateRegistrationStatus(userProfile.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-semibold rounded border ${
                            userProfile.registration_status === 'completed'
                              ? 'bg-green-900/50 text-green-300 border-green-600'
                              : userProfile.registration_status === 'pending'
                              ? 'bg-yellow-900/50 text-yellow-300 border-yellow-600'
                              : 'bg-red-900/50 text-red-300 border-red-600'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                        </select>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={userProfile.is_admin ? 'admin' : 'user'}
                          onChange={(e) => updateUserRole(userProfile.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-semibold rounded border ${
                            userProfile.is_admin
                              ? 'bg-purple-900/50 text-purple-300 border-purple-600'
                              : 'bg-gray-700/50 text-gray-300 border-gray-600'
                          }`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={userProfile.ctf_role || 'none'}
                          onChange={(e) => updateCTFRole(userProfile.id, e.target.value as CTFRoleType)}
                          className={`px-2 py-1 text-xs font-semibold rounded border ${
                            CTF_ROLE_INFO[userProfile.ctf_role || 'none'].color
                          } text-white`}
                        >
                          {Object.entries(CTF_ROLE_INFO).map(([key, info]) => (
                            <option key={key} value={key}>
                              {info.display_name} {info.level > 0 && `(L${info.level})`}
                            </option>
                          ))}
                        </select>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(userProfile.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => navigator.clipboard.writeText(userProfile.id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="Copy User ID"
                        >
                          Copy ID
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Role Legend */}
        <div className="mt-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">CTF Role Hierarchy</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(CTF_ROLE_INFO)
              .filter(([key]) => key !== 'none')
              .map(([key, info]) => (
              <div key={key} className="flex items-center space-x-3">
                <span className={`${info.color} text-white text-xs px-3 py-1 rounded border`}>
                  {info.display_name}
                </span>
                <span className="text-gray-400 text-sm">
                  Level {info.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
} 