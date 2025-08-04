'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import TransitionalPlayerManager from '@/components/admin/TransitionalPlayerManager';
import { Squad } from '@/types/database';

interface AdminSquad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_alias: string;
  member_count: number;
  is_active: boolean;
  is_legacy: boolean;
  created_at: string;
  banner_url?: string;
}

export default function AdminSquads() {
  const { user, loading } = useAuth();
  const [squads, setSquads] = useState<AdminSquad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'legacy'>('all');
  const [showTransitionalManager, setShowTransitionalManager] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchSquads();
    }
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const hasAccess = data?.is_admin || false;
      setIsAdmin(hasAccess);
      if (!hasAccess) {
        toast.error('Access denied: Admin privileges required');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      toast.error('Error checking permissions');
    }
  };

  const fetchSquads = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          is_active,
          is_legacy,
          created_at,
          banner_url,
          captain_id,
          profiles(in_game_alias),
          squad_members(id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedSquads: AdminSquad[] = (data || []).map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: squad.squad_members?.length || 0,
        is_active: squad.is_active,
        is_legacy: squad.is_legacy || false,
        created_at: squad.created_at,
        banner_url: squad.banner_url
      }));

      setSquads(formattedSquads);
    } catch (error) {
      console.error('Error fetching squads:', error);
      toast.error('Error loading squads');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSquadStatus = async (squadId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('squads')
        .update({ is_active: !currentStatus })
        .eq('id', squadId);

      if (error) throw error;

      // Update local state
      setSquads(prev => prev.map(squad => 
        squad.id === squadId 
          ? { ...squad, is_active: !currentStatus }
          : squad
      ));

      toast.success(`Squad ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      console.error('Error updating squad status:', error);
      toast.error('Error updating squad status');
    }
  };

  const toggleLegacyStatus = async (squadId: string, currentLegacyStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('squads')
        .update({ is_legacy: !currentLegacyStatus })
        .eq('id', squadId);

      if (error) throw error;

      // Update local state
      setSquads(prev => prev.map(squad => 
        squad.id === squadId 
          ? { ...squad, is_legacy: !currentLegacyStatus }
          : squad
      ));

      toast.success(`Squad ${!currentLegacyStatus ? 'marked as legacy' : 'removed from legacy'} successfully`);
    } catch (error) {
      console.error('Error updating legacy status:', error);
      toast.error('Error updating legacy status');
    }
  };

  const filteredSquads = squads.filter(squad => {
    if (filter === 'active') return squad.is_active && !squad.is_legacy;
    if (filter === 'inactive') return !squad.is_active && !squad.is_legacy;
    if (filter === 'legacy') return squad.is_legacy;
    return true;
  }).sort((a, b) => {
    // For "All Squads" view, sort by active status first, then by name
    if (filter === 'all') {
      // Active squads first (non-legacy active squads have highest priority)
      const aActive = a.is_active && !a.is_legacy;
      const bActive = b.is_active && !b.is_legacy;
      
      if (aActive !== bActive) {
        return bActive ? 1 : -1; // Active squads first
      }
      
      // Then legacy squads
      if (a.is_legacy !== b.is_legacy) {
        return a.is_legacy ? 1 : -1; // Non-legacy first
      }
    }
    
    // Finally sort by name alphabetically
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-gray-300 mb-4">You need admin privileges to access this page.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <Link 
            href="/admin" 
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-3xl font-bold text-cyan-400 mb-2">Squad Management</h1>
          <p className="text-gray-400 mb-2">
            Control which squads appear on the main page widget. 
            Only active squads are shown to regular users.
          </p>
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <h3 className="text-purple-300 font-semibold mb-2">🏛️ Legacy Squad System</h3>
            <p className="text-purple-200 text-sm">
              Legacy squads preserve historical teams while allowing flexible membership. 
              Players can be on both a legacy squad (for history) and an active squad simultaneously.
              Legacy squads don't block players from joining other squads or appearing in the free agent pool.
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit">
            {[
              { key: 'all', label: 'All Squads', count: squads.length },
              { key: 'active', label: 'Active', count: squads.filter(s => s.is_active && !s.is_legacy).length },
              { key: 'inactive', label: 'Inactive', count: squads.filter(s => !s.is_active && !s.is_legacy).length },
              { key: 'legacy', label: 'Legacy', count: squads.filter(s => s.is_legacy).length }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === key
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Squads List */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
              <p className="mt-4 text-gray-400">Loading squads...</p>
            </div>
          ) : filteredSquads.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400">No squads found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Squad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Captain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredSquads.map((squad) => (
                    <tr key={squad.id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {squad.banner_url && (
                            <div className="w-16 h-16 mr-3 flex-shrink-0">
                              <img 
                                src={squad.banner_url} 
                                alt={`${squad.name} banner`}
                                className="w-full h-full object-cover rounded"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-white">
                              [{squad.tag}] {squad.name}
                            </div>
                            {squad.description && (
                              <div className="text-xs text-gray-400 truncate max-w-xs">
                                {squad.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {squad.captain_alias}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {squad.member_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            squad.is_legacy 
                              ? 'bg-purple-100 text-purple-800' 
                              : squad.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {squad.is_legacy ? '🏛️ Legacy' : squad.is_active ? '🟢 Active' : '🔴 Inactive'}
                          </span>
                          {squad.is_legacy && (
                            <span className="text-xs text-gray-400">
                              Historical squad
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(squad.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2 flex-wrap gap-1">
                          {!squad.is_legacy && (
                            <button
                              onClick={() => toggleSquadStatus(squad.id, squad.is_active)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                squad.is_active
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-green-600 hover:bg-green-700 text-white'
                              }`}
                            >
                              {squad.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                          <button
                            onClick={() => toggleLegacyStatus(squad.id, squad.is_legacy)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              squad.is_legacy
                                ? 'bg-gray-600 hover:bg-gray-700 text-white'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                            title={squad.is_legacy ? 'Remove from legacy status' : 'Mark as legacy squad'}
                          >
                            {squad.is_legacy ? 'Un-Legacy' : 'Make Legacy'}
                          </button>
                          <Link
                            href={`/squads/${squad.id}`}
                            className="text-blue-400 hover:text-blue-300 text-xs"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-cyan-400">{squads.length}</div>
            <div className="text-sm text-gray-400">Total Squads</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">
              {squads.filter(s => s.is_active && !s.is_legacy).length}
            </div>
            <div className="text-sm text-gray-400">Active Squads</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">
              {squads.filter(s => !s.is_active && !s.is_legacy).length}
            </div>
            <div className="text-sm text-gray-400">Inactive Squads</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-400">
              {squads.filter(s => s.is_legacy).length}
            </div>
            <div className="text-sm text-gray-400">Legacy Squads</div>
          </div>
        </div>

        {/* Transitional Player Management Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-cyan-400">Transitional Player Management</h2>
              <p className="text-gray-400 text-sm">
                Manage players from other zones (Skirmish/USL) who are exempt from squad size limits
              </p>
            </div>
            <button
              onClick={() => setShowTransitionalManager(!showTransitionalManager)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                showTransitionalManager
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
            >
              {showTransitionalManager ? '🔼 Hide' : '🔽 Show'} Player Manager
            </button>
          </div>
          
          {showTransitionalManager && (
            <TransitionalPlayerManager isVisible={showTransitionalManager} />
          )}
        </div>
      </div>
    </div>
  );
} 