'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';

interface User {
  id: string;
  email: string;
  in_game_alias: string;
  ctf_role: string | null;
  is_admin: boolean;
}

// Define available CTF roles based on your schema
const CTF_ROLES = [
  { value: 'ctf_admin', label: 'CTF Administrator', color: 'bg-purple-500' },
  { value: 'ctf_head_referee', label: 'Head Referee', color: 'bg-blue-500' },
  { value: 'ctf_referee', label: 'Referee', color: 'bg-green-500' },
  { value: 'ctf_recorder', label: 'Recorder', color: 'bg-yellow-500' },
  { value: 'ctf_commentator', label: 'Commentator', color: 'bg-gray-500' },
] as const;

type SortField = 'in_game_alias' | 'email' | 'ctf_role';
type SortDirection = 'asc' | 'desc';
type ViewFilter = 'all' | 'staff' | 'players';

export default function CTFAdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [sortField, setSortField] = useState<SortField>('in_game_alias');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  // Check if current user has CTF admin permissions
  const hasPermission = (permission: string): boolean => {
    if (!currentUserProfile) return false;
    // Only ctf_admin and site admins can manage roles
    return currentUserProfile.ctf_role === 'ctf_admin' || currentUserProfile.is_admin || permission === 'view';
  };

  // Check if user can manage a specific target user
  const canManageUser = (targetUser: User): boolean => {
    if (!currentUserProfile) return false;
    
    // Site admins can manage everyone
    if (currentUserProfile.is_admin) return true;
    
    // CTF admins cannot see or manage site admins
    if (targetUser.is_admin) return false;
    
    // CTF admins can manage users with CTF roles or no roles
    return currentUserProfile.ctf_role === 'ctf_admin';
  };

  // Fetch users with their CTF roles
  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, in_game_alias, ctf_role, is_admin')
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null)
        .neq('in_game_alias', '')
        .order('in_game_alias');

      if (error) throw error;
      
      // Filter out site admins if current user is CTF admin (not site admin)
      let filteredUsers = profiles || [];
      if (currentUserProfile && currentUserProfile.ctf_role === 'ctf_admin' && !currentUserProfile.is_admin) {
        filteredUsers = filteredUsers.filter(u => !u.is_admin);
      }
      
      setUsers(filteredUsers);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    }
  };

  // Fetch current user's profile
  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, in_game_alias, ctf_role, is_admin')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setCurrentUserProfile(data);
    } catch (error: any) {
      console.error('Error fetching current user profile:', error);
    }
  };

  // Handle role assignment
  const handleRoleChange = async (userId: string, roleName: string | null) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser || !canManageUser(targetUser)) {
      toast.error('Insufficient permissions');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ctf_role: roleName })
        .eq('id', userId);

      if (error) throw error;
      toast.success(roleName ? 'Role assigned successfully' : 'Role removed successfully');
      await fetchUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort users
  const sortedUsers = [...users].sort((a, b) => {
    let aValue: string;
    let bValue: string;

    switch (sortField) {
      case 'in_game_alias':
        aValue = a.in_game_alias.toLowerCase();
        bValue = b.in_game_alias.toLowerCase();
        break;
      case 'email':
        aValue = a.email.toLowerCase();
        bValue = b.email.toLowerCase();
        break;
      case 'ctf_role':
        aValue = a.ctf_role || 'zzz'; // Put null roles at the end
        bValue = b.ctf_role || 'zzz';
        break;
      default:
        return 0;
    }

    if (sortDirection === 'asc') {
      return aValue.localeCompare(bValue);
    } else {
      return bValue.localeCompare(aValue);
    }
  });

  // Filter users based on search and view filter
  const filteredUsers = sortedUsers.filter(user => {
    // Search filter
    const matchesSearch = user.in_game_alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.ctf_role && CTF_ROLES.find(r => r.value === user.ctf_role)?.label.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    // View filter
    switch (viewFilter) {
      case 'staff':
        return user.ctf_role !== null && user.ctf_role !== '';
      case 'players':
        return !user.ctf_role || user.ctf_role === '';
      case 'all':
      default:
        return true;
    }
  });

  // Get role info
  const getRoleInfo = (roleName: string | null) => {
    return CTF_ROLES.find(r => r.value === roleName) || null;
  };

  // Get statistics
  const stats = {
    total: users.length,
    staff: users.filter(u => u.ctf_role !== null && u.ctf_role !== '').length,
    players: users.filter(u => !u.ctf_role || u.ctf_role === '').length,
    admins: users.filter(u => u.ctf_role === 'ctf_admin').length,
    referees: users.filter(u => u.ctf_role?.includes('referee')).length,
  };

  // Get sort icon
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchCurrentUserProfile();
    };
    
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (currentUserProfile) {
      fetchUsers().finally(() => setLoading(false));
    }
  }, [currentUserProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!hasPermission('view')) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
        <h3 className="text-red-400 font-bold text-lg mb-2">Access Denied</h3>
        <p className="text-gray-300">You don't have permission to access the CTF admin panel.</p>
      </div>
    );
  }

  const canManageRoles = hasPermission('manage_ctf_roles');

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-purple-400">CTF Role Management</h2>
        <div className="text-sm text-gray-400">
          {stats.staff} Staff • {stats.players} Players • {stats.total} Total
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewFilter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setViewFilter('staff')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewFilter === 'staff'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Staff ({stats.staff})
          </button>
          <button
            onClick={() => setViewFilter('players')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewFilter === 'players'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Players ({stats.players})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-600">
              <th 
                className="text-left py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('in_game_alias')}
              >
                Alias {getSortIcon('in_game_alias')}
              </th>
              <th 
                className="text-left py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('email')}
              >
                Email {getSortIcon('email')}
              </th>
              <th 
                className="text-left py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('ctf_role')}
              >
                Current Role {getSortIcon('ctf_role')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const roleInfo = getRoleInfo(user.ctf_role);
              const userCanManage = canManageUser(user);
              
              return (
                <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="text-white font-medium">{user.in_game_alias}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-300 text-sm">{user.email}</div>
                  </td>
                  <td className="py-3 px-4">
                    {canManageRoles && userCanManage ? (
                      <select
                        value={user.ctf_role || ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value || null)}
                        className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm focus:outline-none focus:border-purple-500"
                      >
                        <option value="">No Role</option>
                        {CTF_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center">
                        {roleInfo ? (
                          <span className={`${roleInfo.color} text-white text-xs px-3 py-1 rounded-full`}>
                            {roleInfo.label}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">No Role</span>
                        )}
                        {user.is_admin && (
                          <span className="ml-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                            Site Admin
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">
            {searchTerm 
              ? `No users found matching "${searchTerm}"` 
              : `No ${viewFilter === 'all' ? 'users' : viewFilter} found`
            }
          </p>
        </div>
      )}

      {/* Statistics Footer */}
      <div className="mt-6 pt-4 border-t border-gray-600">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-purple-400">{stats.admins}</div>
            <div className="text-xs text-gray-400">CTF Admins</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-400">{stats.referees}</div>
            <div className="text-xs text-gray-400">Referees</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">{stats.staff - stats.admins - stats.referees}</div>
            <div className="text-xs text-gray-400">Other Staff</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-400">{stats.players}</div>
            <div className="text-xs text-gray-400">Players</div>
          </div>
        </div>
      </div>
    </div>
  );
} 