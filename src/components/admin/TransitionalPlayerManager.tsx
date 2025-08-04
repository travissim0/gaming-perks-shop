'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { Profile } from '@/types/database';

interface TransitionalPlayerManagerProps {
  isVisible?: boolean;
}

export default function TransitionalPlayerManager({ isVisible = true }: TransitionalPlayerManagerProps) {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingPlayerId, setProcessingPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible) {
      loadPlayers();
    }
  }, [isVisible]);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .not('in_game_alias', 'is', null)
        .order('in_game_alias');

      if (error) throw error;
      setPlayers(data || []);
    } catch (error: any) {
      console.error('Error loading players:', error);
      toast.error('Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  const toggleTransitionalStatus = async (playerId: string, currentStatus: boolean) => {
    try {
      setProcessingPlayerId(playerId);
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          transitional_player: !currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', playerId);

      if (error) {
        // If the column doesn't exist yet, show a helpful message
        if (error.message.includes('column "transitional_player" does not exist')) {
          toast.error('Database not yet updated. Please apply the SQL schema changes first.');
          return;
        }
        throw error;
      }

      // Update local state
      setPlayers(players.map(player => 
        player.id === playerId 
          ? { ...player, transitional_player: !currentStatus }
          : player
      ));

      toast.success(`Player ${!currentStatus ? 'marked as' : 'removed from'} transitional status`);
    } catch (error: any) {
      console.error('Error updating transitional status:', error);
      toast.error('Failed to update player status');
    } finally {
      setProcessingPlayerId(null);
    }
  };

  const filteredPlayers = players.filter(player =>
    player.in_game_alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const transitionalPlayers = filteredPlayers.filter(p => p.transitional_player);
  const regularPlayers = filteredPlayers.filter(p => !p.transitional_player);

  if (!isVisible) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-600">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-cyan-400">🔄 Transitional Player Management</h3>
        <button
          onClick={loadPlayers}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          {loading ? '🔄' : '↻'} Refresh
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search players by alias or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="text-gray-400 mt-2">Loading players...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Transitional Players Section */}
          <div>
            <h4 className="text-lg font-semibold text-green-400 mb-3">
              🔄 Transitional Players ({transitionalPlayers.length})
            </h4>
            <p className="text-sm text-gray-400 mb-3">
              Players from other zones (Skirmish/USL) or new players who are exempt from squad size limits
            </p>
            {transitionalPlayers.length === 0 ? (
              <div className="bg-gray-700 rounded p-4 text-center text-gray-400">
                No transitional players configured
              </div>
            ) : (
              <div className="grid gap-2">
                {transitionalPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-green-900/20 border border-green-500/30 rounded-lg p-3"
                  >
                    <div>
                      <span className="font-medium text-white">{player.in_game_alias}</span>
                      <span className="text-sm text-gray-400 ml-2">({player.email})</span>
                    </div>
                    <button
                      onClick={() => toggleTransitionalStatus(player.id, true)}
                      disabled={processingPlayerId === player.id}
                      className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      {processingPlayerId === player.id ? '⏳' : '❌'} Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Regular Players Section */}
          <div>
            <h4 className="text-lg font-semibold text-blue-400 mb-3">
              👤 Regular Players ({regularPlayers.length})
            </h4>
            <div className="max-h-96 overflow-y-auto">
              <div className="grid gap-2">
                {regularPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-gray-700 rounded-lg p-3"
                  >
                    <div>
                      <span className="font-medium text-white">{player.in_game_alias}</span>
                      <span className="text-sm text-gray-400 ml-2">({player.email})</span>
                    </div>
                    <button
                      onClick={() => toggleTransitionalStatus(player.id, false)}
                      disabled={processingPlayerId === player.id}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      {processingPlayerId === player.id ? '⏳' : '🔄'} Make Transitional
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <h5 className="font-semibold text-blue-400 mb-2">📋 About Transitional Players</h5>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>• Transitional players are exempt from the 15-player squad limit</li>
          <li>• They are typically players coming from other zones (Skirmish/USL) or new players</li>
          <li>• Squads can have unlimited transitional players</li>
          <li>• Regular players still count toward the 15-member limit</li>
          <li>• Admin approval is required to change transitional status</li>
        </ul>
      </div>
    </div>
  );
}