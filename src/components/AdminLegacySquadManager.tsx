'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Squad {
  id: string;
  name: string;
  tag: string;
  is_active: boolean;
  is_legacy: boolean;
  created_at: string;
  member_count?: number;
}

export default function AdminLegacySquadManager() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadSquads();
  }, []);

  const loadSquads = async () => {
    try {
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          is_active,
          is_legacy,
          created_at,
          squad_members(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const squadsWithMemberCount = data?.map((squad: any) => ({
        ...squad,
        member_count: squad.squad_members?.[0]?.count || 0
      })) || [];

      setSquads(squadsWithMemberCount);
    } catch (error) {
      console.error('Error loading squads:', error);
      toast.error('Failed to load squads');
    } finally {
      setLoading(false);
    }
  };

  const toggleLegacyStatus = async (squadId: string, currentStatus: boolean) => {
    setUpdating(squadId);
    try {
      const { error } = await supabase
        .from('squads')
        .update({ 
          is_legacy: !currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', squadId);

      if (error) throw error;

      toast.success(`Squad ${!currentStatus ? 'marked as legacy' : 'removed from legacy'}`);
      loadSquads(); // Refresh the list
    } catch (error) {
      console.error('Error updating squad legacy status:', error);
      toast.error('Failed to update squad legacy status');
    } finally {
      setUpdating(null);
    }
  };

  const bulkMarkAsLegacy = async (beforeDate: string, inactiveOnly: boolean) => {
    try {
      const { data, error } = await supabase.rpc('mark_squads_as_legacy', {
        before_date: beforeDate,
        inactive_only: inactiveOnly
      });

      if (error) throw error;

      toast.success(`${data} squads marked as legacy`);
      loadSquads(); // Refresh the list
    } catch (error) {
      console.error('Error bulk marking squads as legacy:', error);
      toast.error('Failed to bulk mark squads as legacy');
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4">Legacy Squad Management</h3>
        <div className="text-gray-400">Loading squads...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-xl font-bold mb-4">Legacy Squad Management</h3>
      
      {/* Bulk Actions */}
      <div className="mb-6 p-4 bg-gray-700 rounded-lg">
        <h4 className="font-semibold mb-3">Bulk Actions</h4>
        <div className="flex gap-4">
          <button
            onClick={() => bulkMarkAsLegacy('2023-01-01', true)}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm"
          >
            Mark Inactive Squads Before 2023 as Legacy
          </button>
          <button
            onClick={() => bulkMarkAsLegacy('2022-01-01', false)}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm"
          >
            Mark All Squads Before 2022 as Legacy
          </button>
        </div>
      </div>

      {/* Squad List */}
      <div className="space-y-3">
        {squads.map((squad) => (
          <div key={squad.id} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-medium">[{squad.tag}] {squad.name}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  squad.is_active ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {squad.is_active ? 'Active' : 'Inactive'}
                </span>
                {squad.is_legacy && (
                  <span className="px-2 py-1 rounded text-xs bg-purple-600">
                    Legacy
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Created: {new Date(squad.created_at).toLocaleDateString()} • 
                Members: {squad.member_count}
              </div>
            </div>
            <button
              onClick={() => toggleLegacyStatus(squad.id, squad.is_legacy)}
              disabled={updating === squad.id}
              className={`px-4 py-2 rounded text-sm ${
                squad.is_legacy
                  ? 'bg-gray-600 hover:bg-gray-500 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              } ${updating === squad.id ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {updating === squad.id ? 'Updating...' : 
               squad.is_legacy ? 'Remove Legacy' : 'Mark as Legacy'}
            </button>
          </div>
        ))}
      </div>

      {squads.length === 0 && (
        <div className="text-gray-400 text-center py-8">
          No squads found.
        </div>
      )}
    </div>
  );
} 