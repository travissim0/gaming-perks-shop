'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_alias: string;
  member_count: number;
  is_active: boolean;
  created_at: string;
  banner_url?: string;
}

export default function AdminSquads() {
  const { user, loading } = useAuth();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

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
          created_at,
          banner_url,
          captain_id,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members!inner(id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedSquads: Squad[] = (data || []).map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: squad.squad_members?.length || 0,
        is_active: squad.is_active,
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

  const filteredSquads = squads.filter(squad => {
    if (filter === 'active') return squad.is_active;
    if (filter === 'inactive') return !squad.is_active;
    return true;
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
          <p className="text-gray-400">
            Control which squads appear on the main page widget. 
            Only active squads are shown to regular users.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit">
            {[
              { key: 'all', label: 'All Squads', count: squads.length },
              { key: 'active', label: 'Active', count: squads.filter(s => s.is_active).length },
              { key: 'inactive', label: 'Inactive', count: squads.filter(s => !s.is_active).length }
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          squad.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {squad.is_active ? '🟢 Active' : '🔴 Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(squad.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
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
                          <Link
                            href={`/squads/${squad.id}`}
                            className="text-blue-400 hover:text-blue-300"
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
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-cyan-400">{squads.length}</div>
            <div className="text-sm text-gray-400">Total Squads</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">
              {squads.filter(s => s.is_active).length}
            </div>
            <div className="text-sm text-gray-400">Active Squads</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">
              {squads.filter(s => !s.is_active).length}
            </div>
            <div className="text-sm text-gray-400">Inactive Squads</div>
          </div>
        </div>
      </div>
    </div>
  );
} 