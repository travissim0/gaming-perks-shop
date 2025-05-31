import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export type CTFRoleType = 
  | 'admin'
  | 'ctf_admin'
  | 'ctf_head_referee'
  | 'ctf_referee'
  | 'ctf_recorder'
  | 'ctf_commentator';

export interface CTFRole {
  id: string;
  name: CTFRoleType;
  display_name: string;
  description: string;
  hierarchy_level: number;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface UserCTFRole {
  id: string;
  user_id: string;
  role_name: CTFRoleType;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  notes: string | null;
}

export interface RefereeApplication {
  id: string;
  applicant_id: string;
  current_role: CTFRoleType | null;
  requested_role: CTFRoleType;
  application_reason: string;
  experience_description: string | null;
  status: 'pending' | 'approved' | 'denied' | 'withdrawn';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCTFRoles() {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserCTFRole[]>([]);
  const [allRoles, setAllRoles] = useState<CTFRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all available CTF roles
  const fetchAllRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('ctf_roles')
        .select('*')
        .order('hierarchy_level', { ascending: false });

      if (error) throw error;
      setAllRoles(data || []);
    } catch (err: any) {
      console.error('Error fetching CTF roles:', err);
      setError(err.message);
    }
  };

  // Fetch user's CTF roles
  const fetchUserRoles = async () => {
    if (!user) {
      setUserRoles([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_ctf_roles')
        .select(`
          *,
          ctf_roles!inner(*)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;
      setUserRoles(data || []);
    } catch (err: any) {
      console.error('Error fetching user CTF roles:', err);
      setError(err.message);
    }
  };

  // Get user's highest role
  const getHighestRole = (): CTFRole | null => {
    if (userRoles.length === 0) return null;
    
    const roleNames = userRoles.map(ur => ur.role_name);
    const userRoleData = allRoles.filter(role => roleNames.includes(role.name));
    
    if (userRoleData.length === 0) return null;
    
    return userRoleData.reduce((highest, current) => 
      current.hierarchy_level > highest.hierarchy_level ? current : highest
    );
  };

  // Check if user has a specific role
  const hasRole = (roleName: CTFRoleType): boolean => {
    return userRoles.some(ur => ur.role_name === roleName && ur.is_active);
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roleNames: CTFRoleType[]): boolean => {
    return roleNames.some(roleName => hasRole(roleName));
  };

  // Check if user has a specific permission
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    
    // Site admins have all permissions
    if (hasRole('admin')) return true;
    
    for (const userRole of userRoles) {
      const roleData = allRoles.find(r => r.name === userRole.role_name);
      if (roleData?.permissions[permission]) {
        return true;
      }
    }
    
    return false;
  };

  // Check if user can assign a specific role
  const canAssignRole = (targetRole: CTFRoleType): boolean => {
    if (!user) return false;
    
    const highestRole = getHighestRole();
    if (!highestRole) return false;
    
    const targetRoleData = allRoles.find(r => r.name === targetRole);
    if (!targetRoleData) return false;
    
    // Can assign roles lower than your own level
    return highestRole.hierarchy_level > targetRoleData.hierarchy_level;
  };

  // Assign a role to a user
  const assignRole = async (targetUserId: string, roleName: CTFRoleType, notes?: string) => {
    if (!user) throw new Error('Not authenticated');
    if (!canAssignRole(roleName)) throw new Error('Insufficient permissions to assign this role');

    try {
      const { error } = await supabase
        .from('user_ctf_roles')
        .insert({
          user_id: targetUserId,
          role_name: roleName,
          assigned_by: user.id,
          notes: notes || null,
          is_active: true
        });

      if (error) throw error;
      
      // Refresh roles if this was for the current user
      if (targetUserId === user.id) {
        await fetchUserRoles();
      }
      
      return true;
    } catch (err: any) {
      console.error('Error assigning role:', err);
      throw err;
    }
  };

  // Remove a role from a user
  const removeRole = async (targetUserId: string, roleName: CTFRoleType) => {
    if (!user) throw new Error('Not authenticated');
    if (!canAssignRole(roleName)) throw new Error('Insufficient permissions to remove this role');

    try {
      const { error } = await supabase
        .from('user_ctf_roles')
        .update({ is_active: false })
        .eq('user_id', targetUserId)
        .eq('role_name', roleName);

      if (error) throw error;
      
      // Refresh roles if this was for the current user
      if (targetUserId === user.id) {
        await fetchUserRoles();
      }
      
      return true;
    } catch (err: any) {
      console.error('Error removing role:', err);
      throw err;
    }
  };

  // Submit a referee application
  const submitRefereeApplication = async (
    requestedRole: CTFRoleType,
    applicationReason: string,
    experienceDescription?: string
  ) => {
    if (!user) throw new Error('Not authenticated');

    try {
      const currentRole = getHighestRole();
      
      const { error } = await supabase
        .from('referee_applications')
        .insert({
          applicant_id: user.id,
          user_current_role: currentRole?.name || null,
          requested_role: requestedRole,
          application_reason: applicationReason,
          experience_description: experienceDescription || null,
          status: 'pending'
        });

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Error submitting referee application:', err);
      throw err;
    }
  };

  // Get referee applications (for head referees and admins)
  const getRefereeApplications = async () => {
    if (!hasPermission('manage_referee_applications')) {
      throw new Error('Insufficient permissions to view referee applications');
    }

    try {
      const { data, error } = await supabase
        .from('referee_applications')
        .select(`
          *,
          applicant:profiles!referee_applications_applicant_id_fkey(in_game_alias, email),
          reviewer:profiles!referee_applications_reviewed_by_fkey(in_game_alias)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error('Error fetching referee applications:', err);
      throw err;
    }
  };

  // Review a referee application
  const reviewRefereeApplication = async (
    applicationId: string,
    status: 'approved' | 'denied',
    reviewNotes?: string
  ) => {
    if (!user) throw new Error('Not authenticated');
    if (!hasPermission('manage_referee_applications')) {
      throw new Error('Insufficient permissions to review applications');
    }

    try {
      const { data: application, error: fetchError } = await supabase
        .from('referee_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (fetchError) throw fetchError;
      if (!application) throw new Error('Application not found');

      // Update the application
      const { error: updateError } = await supabase
        .from('referee_applications')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // If approved, assign the role
      if (status === 'approved') {
        await assignRole(
          application.applicant_id,
          application.requested_role,
          `Promoted via referee application: ${applicationId}`
        );
      }

      return true;
    } catch (err: any) {
      console.error('Error reviewing referee application:', err);
      throw err;
    }
  };

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setError(null);
      
      try {
        await Promise.all([
          fetchAllRoles(),
          fetchUserRoles()
        ]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [user]);

  return {
    // State
    userRoles,
    allRoles,
    loading,
    error,
    
    // Role checking
    hasRole,
    hasAnyRole,
    hasPermission,
    getHighestRole,
    canAssignRole,
    
    // Role management
    assignRole,
    removeRole,
    
    // Referee applications
    submitRefereeApplication,
    getRefereeApplications,
    reviewRefereeApplication,
    
    // Refresh functions
    refresh: () => Promise.all([fetchAllRoles(), fetchUserRoles()])
  };
} 