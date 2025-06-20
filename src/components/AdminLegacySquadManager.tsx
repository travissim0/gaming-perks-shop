'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_id: string;
  is_active: boolean;
  is_legacy: boolean;
  created_at: string;
  updated_at: string;
  captain_alias?: string;
  member_count?: number;
}

export default function AdminLegacySquadManager() {
  const { user } = useAuth();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'legacy'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSquads();
  }, []);

  const loadSquads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          captain_id,
          is_active,
          is_legacy,
          created_at,
          updated_at,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members(id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedSquads: Squad[] = data.map((squad: any) => ({
        ...squad,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: squad.squad_members?.length || 0
      }));

      setSquads(formattedSquads);
    } catch (error) {
      console.error('Error loading squads:', error);
      toast.error('Failed to load squads');
    } finally {
      setLoading(false);
    }
  };

  const toggleLegacyStatus = async (squadId: string, currentStatus: boolean) => {
    if (!user) {
      toast.error('You must be logged in to perform this action');
      return;
    }

    setProcessing(squadId);
    try {
      const { error } = await supabase
        .from('squads')
        .update({ 
          is_legacy: !currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', squadId);

      if (error) throw error;

      toast.success(`Squad ${!currentStatus ? 'marked as legacy' : 'unmarked as legacy'}`);
      await loadSquads(); // Reload to get updated data
    } catch (error: any) {
      console.error('Error updating squad:', error);
      toast.error(`Failed to update squad: ${error.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const bulkMarkAsLegacy = async (criteria: 'inactive' | 'old_inactive' | 'all_old') => {
    if (!user) {
      toast.error('You must be logged in to perform this action');
      return;
    }

    const confirmMessage = 
      criteria === 'inactive' ? 'Mark ALL inactive squads as legacy?' :
      criteria === 'old_inactive' ? 'Mark inactive squads older than 6 months as legacy?' :
      'Mark ALL squads older than 1 year as legacy?';

    if (!confirm(confirmMessage + ' This action cannot be undone.')) return;

    setProcessing('bulk');
    try {
      let query = supabase.from('squads').update({ 
        is_legacy: true,
        updated_at: new Date().toISOString()
      });

      if (criteria === 'inactive') {
        query = query.eq('is_active', false).eq('is_legacy', false);
      } else if (criteria === 'old_inactive') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        query = query
          .eq('is_active', false)
          .eq('is_legacy', false)
          .lt('created_at', sixMonthsAgo.toISOString());
      } else {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        query = query
          .eq('is_legacy', false)
          .lt('created_at', oneYearAgo.toISOString());
      }

      const { data, error } = await query.select('id');

      if (error) throw error;

      toast.success(`Successfully marked ${data?.length || 0} squads as legacy`);
      await loadSquads();
    } catch (error: any) {
      console.error('Error bulk updating squads:', error);
      toast.error(`Failed to bulk update: ${error.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const filteredSquads = squads.filter(squad => {
    // Apply filter
    if (filter === 'active' && (!squad.is_active || squad.is_legacy)) return false;
    if (filter === 'inactive' && squad.is_active) return false;
    if (filter === 'legacy' && !squad.is_legacy) return false;

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        squad.name.toLowerCase().includes(term) ||
        squad.tag.toLowerCase().includes(term) ||
        squad.captain_alias?.toLowerCase().includes(term)
      );
    }

    return true;
  });

  const getSquadStatusBadge = (squad: Squad) => {
    if (squad.is_legacy) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
          Legacy
        </span>
      );
    } else if (squad.is_active) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30 rounded-full">
          Active
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-full">
          Inactive
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-400">Loading squads...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-purple-400 mb-2 flex items-center gap-2">
          👑 Legacy Squad Manager
        </h2>
        <p className="text-gray-400">
          Mark squads as "legacy" to preserve historical data while allowing members to join active squads.
          Legacy squads don't count toward the "one squad per player" limit.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <label className="text-gray-300 font-medium">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="all">All Squads</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="legacy">Legacy Only</option>
            </select>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <label className="text-gray-300 font-medium">Search:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Squad name, tag, or captain..."
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400"
            />
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => bulkMarkAsLegacy('inactive')}
            disabled={processing === 'bulk'}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
          >
            Mark All Inactive as Legacy
          </button>
          <button
            onClick={() => bulkMarkAsLegacy('old_inactive')}
            disabled={processing === 'bulk'}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
          >
            Mark Old Inactive as Legacy (6+ months)
          </button>
          <button
            onClick={() => bulkMarkAsLegacy('all_old')}
            disabled={processing === 'bulk'}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
          >
            Mark All Old as Legacy (1+ year)
          </button>
        </div>
      </div>

      {/* Squad List */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="p-4 border-b border-gray-700/50">
          <h3 className="text-lg font-semibold text-white">
            Squads ({filteredSquads.length})
          </h3>
        </div>

        {filteredSquads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No squads found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Squad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Captain
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredSquads.map((squad) => (
                  <tr key={squad.id} className="hover:bg-gray-700/25">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-white">
                          [{squad.tag}] {squad.name}
                        </div>
                        {squad.description && (
                          <div className="text-sm text-gray-400 truncate max-w-xs">
                            {squad.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {squad.captain_alias}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {squad.member_count}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getSquadStatusBadge(squad)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(squad.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleLegacyStatus(squad.id, squad.is_legacy)}
                        disabled={processing === squad.id}
                        className={`px-3 py-1 text-sm font-medium rounded-lg disabled:opacity-50 ${
                          squad.is_legacy
                            ? 'bg-gray-600 hover:bg-gray-500 text-white'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                      >
                        {processing === squad.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : squad.is_legacy ? (
                          'Remove Legacy'
                        ) : (
                          'Mark Legacy'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-3">💡 How Legacy Squads Work</h3>
        <ul className="space-y-2 text-gray-300">
          <li>• <strong>Legacy squads</strong> are historical squads that don't count toward the "one active squad per player" limit</li>
          <li>• Players can be members of multiple legacy squads while also joining one active squad</li>
          <li>• Legacy squads can still have captains and co-captains with full privileges within that squad</li>
          <li>• Use this for preserving disbanded teams, old tournament squads, or historical records</li>
          <li>• Players in legacy squads can still appear in the free agent pool for active squad recruitment</li>
        </ul>
      </div>
    </div>
  );
} 