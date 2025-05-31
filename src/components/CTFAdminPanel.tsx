'use client';

import { useState, useEffect } from 'react';
import { useCTFRoles, CTFRoleType } from '@/hooks/useCTFRoles';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  in_game_alias: string;
}

interface UserWithRoles extends User {
  roles: Array<{
    role_name: CTFRoleType;
    display_name: string;
    assigned_at: string;
    notes: string | null;
  }>;
}

export default function CTFAdminPanel() {
  const { 
    hasPermission, 
    allRoles, 
    canAssignRole, 
    assignRole, 
    removeRole,
    getRefereeApplications,
    reviewRefereeApplication,
    loading: rolesLoading 
  } = useCTFRoles();
  
  const [activeTab, setActiveTab] = useState<'users' | 'applications' | 'roles'>('users');
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Check if user has CTF admin permissions
  const canManageRoles = hasPermission('manage_ctf_roles');
  const canManageApplications = hasPermission('manage_referee_applications');

  // Fetch users with their CTF roles
  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          in_game_alias,
          user_ctf_roles!left(
            role_name,
            assigned_at,
            notes,
            is_active,
            ctf_roles!inner(display_name)
          )
        `)
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null)
        .neq('in_game_alias', '')
        .order('in_game_alias');

      if (error) throw error;

      const usersWithRoles: UserWithRoles[] = profiles.map(user => ({
        id: user.id,
        email: user.email,
        in_game_alias: user.in_game_alias,
        roles: user.user_ctf_roles
          ?.filter((ur: any) => ur.is_active)
          ?.map((ur: any) => ({
            role_name: ur.role_name,
            display_name: ur.ctf_roles.display_name,
            assigned_at: ur.assigned_at,
            notes: ur.notes
          })) || []
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    }
  };

  // Fetch referee applications
  const fetchApplications = async () => {
    if (!canManageApplications) return;

    try {
      const apps = await getRefereeApplications();
      setApplications(apps);
    } catch (error: any) {
      console.error('Error fetching applications:', error);
      toast.error('Failed to fetch referee applications');
    }
  };

  // Handle role assignment
  const handleAssignRole = async (userId: string, roleName: CTFRoleType) => {
    try {
      await assignRole(userId, roleName);
      toast.success('Role assigned successfully');
      await fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign role');
    }
  };

  // Handle role removal
  const handleRemoveRole = async (userId: string, roleName: CTFRoleType) => {
    try {
      await removeRole(userId, roleName);
      toast.success('Role removed successfully');
      await fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove role');
    }
  };

  // Handle application review
  const handleReviewApplication = async (
    applicationId: string, 
    status: 'approved' | 'denied',
    reviewNotes?: string
  ) => {
    try {
      await reviewRefereeApplication(applicationId, status, reviewNotes);
      toast.success(`Application ${status} successfully`);
      await fetchApplications();
    } catch (error: any) {
      toast.error(error.message || 'Failed to review application');
    }
  };

  // Filter users based on search
  const filteredUsers = users.filter(user =>
    user.in_game_alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.roles.some(role => role.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get role color
  const getRoleColor = (roleName: CTFRoleType) => {
    switch (roleName) {
      case 'admin': return 'bg-red-500';
      case 'ctf_admin': return 'bg-purple-500';
      case 'ctf_head_referee': return 'bg-blue-500';
      case 'ctf_referee': return 'bg-green-500';
      case 'ctf_recorder': return 'bg-yellow-500';
      case 'ctf_commentator': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  // Get status color for applications
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'approved': return 'bg-green-500';
      case 'denied': return 'bg-red-500';
      case 'withdrawn': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchUsers(),
        canManageApplications ? fetchApplications() : Promise.resolve()
      ]);
      setLoading(false);
    };

    if (!rolesLoading) {
      loadData();
    }
  }, [rolesLoading, canManageApplications]);

  if (rolesLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!canManageRoles && !canManageApplications) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
        <h3 className="text-red-400 font-bold text-lg mb-2">Access Denied</h3>
        <p className="text-gray-300">You don't have permission to access the CTF admin panel.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-purple-400">CTF Administration</h2>
        <div className="flex space-x-2">
          {canManageRoles && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                activeTab === 'users'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              User Roles
            </button>
          )}
          {canManageApplications && (
            <button
              onClick={() => setActiveTab('applications')}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                activeTab === 'applications'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Applications
            </button>
          )}
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
              activeTab === 'roles'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Role Info
          </button>
        </div>
      </div>

      {/* User Roles Tab */}
      {activeTab === 'users' && canManageRoles && (
        <div>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-medium">{user.in_game_alias}</h3>
                    <p className="text-gray-400 text-sm">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.roles.map((role, index) => (
                      <div key={index} className="flex items-center space-x-1">
                        <span className={`${getRoleColor(role.role_name)} text-white text-xs px-2 py-1 rounded-full`}>
                          {role.display_name}
                        </span>
                        {canAssignRole(role.role_name) && (
                          <button
                            onClick={() => handleRemoveRole(user.id, role.role_name)}
                            className="text-red-400 hover:text-red-300 text-xs"
                            title="Remove role"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {allRoles
                    .filter(role => 
                      canAssignRole(role.name) && 
                      !user.roles.some(ur => ur.role_name === role.name)
                    )
                    .map((role) => (
                      <button
                        key={role.name}
                        onClick={() => handleAssignRole(user.id, role.name)}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1 rounded-full transition-colors duration-300"
                      >
                        + {role.display_name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications Tab */}
      {activeTab === 'applications' && canManageApplications && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No referee applications found</p>
            </div>
          ) : (
            applications.map((app) => (
              <div key={app.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-medium">{app.applicant?.in_game_alias}</h3>
                    <p className="text-gray-400 text-sm">{app.applicant?.email}</p>
                  </div>
                  <span className={`${getStatusColor(app.status)} text-white text-xs px-3 py-1 rounded-full uppercase`}>
                    {app.status}
                  </span>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-gray-300 mb-1">
                    <strong>Requested Role:</strong> {allRoles.find(r => r.name === app.requested_role)?.display_name}
                  </p>
                  {app.current_role && (
                    <p className="text-sm text-gray-300 mb-1">
                      <strong>Current Role:</strong> {allRoles.find(r => r.name === app.current_role)?.display_name}
                    </p>
                  )}
                  <p className="text-sm text-gray-300 mb-2">
                    <strong>Applied:</strong> {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-gray-300 mb-1"><strong>Reason:</strong></p>
                  <p className="text-sm text-gray-400 bg-gray-800 p-2 rounded">{app.application_reason}</p>
                </div>

                {app.experience_description && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-300 mb-1"><strong>Experience:</strong></p>
                    <p className="text-sm text-gray-400 bg-gray-800 p-2 rounded">{app.experience_description}</p>
                  </div>
                )}

                {app.status === 'pending' && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleReviewApplication(app.id, 'approved')}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors duration-300"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewApplication(app.id, 'denied')}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors duration-300"
                    >
                      Deny
                    </button>
                  </div>
                )}

                {app.review_notes && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <p className="text-sm text-gray-300 mb-1">
                      <strong>Review Notes:</strong> {app.reviewer?.in_game_alias}
                    </p>
                    <p className="text-sm text-gray-400">{app.review_notes}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Roles Info Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          {allRoles.map((role) => (
            <div key={role.name} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-2">
                <span className={`${getRoleColor(role.name)} text-white px-3 py-1 rounded-full text-sm font-medium`}>
                  Level {role.hierarchy_level}
                </span>
                <h3 className="text-white font-bold">{role.display_name}</h3>
              </div>
              <p className="text-gray-300 text-sm mb-3">{role.description}</p>
              <div className="text-xs text-gray-400">
                <strong>Permissions:</strong> {Object.keys(role.permissions).filter(p => role.permissions[p]).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 