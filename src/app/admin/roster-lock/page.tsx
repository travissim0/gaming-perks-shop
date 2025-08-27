'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Lock, Unlock, Shield, AlertTriangle, CheckCircle, Users, Clock, Trophy, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

interface SeasonRosterLockStatus {
  id: number;
  season_id: string;
  is_locked: boolean;
  locked_at: string | null;
  unlocked_at: string | null;
  locked_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  season?: {
    id: string;
    season_number: number;
    season_name: string | null;
    status: 'upcoming' | 'active' | 'completed';
  };
}

interface Season {
  id: string;
  season_number: number;
  season_name: string | null;
  status: 'upcoming' | 'active' | 'completed';
}

interface PendingInvite {
  id: string;
  squad_name: string;
  squad_tag: string;
  invited_player_alias: string;
  created_at: string;
  expires_at: string;
}

export default function RosterLockAdminPage() {
  const [lockStatus, setLockStatus] = useState<SeasonRosterLockStatus | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    fetchSeasons();
    fetchPendingInvites();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonRosterLockStatus(selectedSeason);
    }
  }, [selectedSeason]);

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('ctfpl_seasons')
        .select('id, season_number, season_name, status')
        .order('season_number', { ascending: false });

      if (error) throw error;
      
      setSeasons(data || []);
      
      // Auto-select the active season
      const activeSeason = data?.find(s => s.status === 'active');
      if (activeSeason) {
        setSelectedSeason(activeSeason.id);
      } else if (data && data.length > 0) {
        // If no active season, select the most recent
        setSelectedSeason(data[0].id);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching seasons: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasonRosterLockStatus = async (seasonId: string) => {
    try {
      const { data, error } = await supabase
        .from('season_roster_locks')
        .select(`
          *,
          season:ctfpl_seasons(
            id,
            season_number,
            season_name,
            status
          )
        `)
        .eq('season_id', seasonId)
        .eq('is_current', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        // No lock record exists for this season, create default unlocked state
        setLockStatus({
          id: 0,
          season_id: seasonId,
          is_locked: false,
          locked_at: null,
          unlocked_at: null,
          locked_by: null,
          reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          season: seasons.find(s => s.id === seasonId)
        });
      } else {
        setLockStatus(data);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching season roster lock: ${error.message}` });
    }
  };

  const fetchPendingInvites = async () => {
    try {
      // First, expire old invites automatically
      const { data: expiredData, error: expiredError } = await supabase.rpc('expire_old_squad_invites');
      if (expiredError) {
        console.error('Error expiring old invites:', expiredError);
      } else if (expiredData && expiredData > 0) {
        console.log(`Auto-expired ${expiredData} old invites`);
      }

      const { data, error } = await supabase
        .from('squad_invites')
        .select(`
          id,
          created_at,
          expires_at,
          squad_id,
          invited_player_id
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending invites:', error);
        return;
      }

      // Fetch squad and profile data separately to avoid join issues
      const inviteIds = (data || []).map(invite => invite.id);
      
      if (inviteIds.length === 0) {
        setPendingInvites([]);
        return;
      }

      const squadIds = [...new Set(data.map(invite => invite.squad_id))];
      const profileIds = [...new Set(data.map(invite => invite.invited_player_id))];

      // Get squad names
      const { data: squadData, error: squadError } = await supabase
        .from('squads')
        .select('id, name, tag')
        .in('id', squadIds);

      // Get profile data  
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, in_game_alias')
        .in('id', profileIds);

      const formatted = (data || []).map((invite: any) => {
        const squad = squadData?.find(s => s.id === invite.squad_id);
        const profile = profileData?.find(p => p.id === invite.invited_player_id);
        
        return {
          id: invite.id,
          squad_name: squad?.name || 'Unknown Squad',
          squad_tag: squad?.tag || '???',
          invited_player_alias: profile?.in_game_alias || 'Unknown Player',
          created_at: invite.created_at,
          expires_at: invite.expires_at
        };
      });

      setPendingInvites(formatted);
    } catch (error: any) {
      console.error('Error fetching pending invites:', error.message);
      setPendingInvites([]);
    }
  };

  const toggleRosterLock = async () => {
    console.log('🔒 toggleRosterLock: Starting with:', { lockStatus, selectedSeason, reason });
    
    if (!lockStatus || !selectedSeason || !reason.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for the roster lock change' });
      return;
    }

    setUpdating(true);
    try {
      const newLockState = !lockStatus.is_locked;
      console.log('🔒 toggleRosterLock: Changing lock state from', lockStatus.is_locked, 'to', newLockState);
      
      const lockData = {
        season_id: selectedSeason,
        is_locked: newLockState,
        locked_at: newLockState ? new Date().toISOString() : lockStatus.locked_at,
        unlocked_at: !newLockState ? new Date().toISOString() : lockStatus.unlocked_at,
        reason: reason.trim(),
        updated_at: new Date().toISOString()
      };
      
      console.log('🔒 toggleRosterLock: Lock data to save:', lockData);
      console.log('🔒 toggleRosterLock: Current lockStatus.id:', lockStatus.id);
      
      let data, error;
      
      console.log('🔒 toggleRosterLock: Using history-tracking approach - calling set_season_roster_lock function');
      ({ data, error } = await supabase.rpc('set_season_roster_lock', {
        p_season_id: selectedSeason,
        p_is_locked: newLockState,
        p_reason: reason.trim(),
        p_user_id: user?.id || null
      }));

      console.log('🔒 toggleRosterLock: Query result:', { data, error });

      if (error) throw error;

      // Fetch the updated record with season info
      await fetchSeasonRosterLockStatus(selectedSeason);
      
      setReason('');
      setMessage({ 
        type: 'success', 
        text: `Season ${lockStatus.season?.season_number} roster ${newLockState ? 'locked' : 'unlocked'} successfully. ${newLockState ? 'All pending invites have been cancelled.' : 'Squad invitations are now allowed.'}` 
      });
      
      // Refresh pending invites as they may have been auto-cancelled
      setTimeout(() => fetchPendingInvites(), 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error updating season roster lock: ${error.message}` });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </button>
            <button
              onClick={() => router.push('/admin/ctf')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to CTF Admin
            </button>
          </div>
          <h1 className="text-3xl font-bold mb-2">Roster Lock Management</h1>
          <p className="text-gray-400">Control squad invitation system during tournament periods</p>
        </div>

        {/* Season Selection */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex items-center mb-4">
            <Trophy className="h-6 w-6 text-blue-500 mr-2" />
            <h3 className="text-lg font-bold">Season Selection</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-white font-medium mb-2">Select Season</label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a season...</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    Season {season.season_number}{season.season_name ? ` - ${season.season_name}` : ''}
                    {season.status === 'active' ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            {selectedSeason && lockStatus && (
              <div className="bg-blue-900/30 border border-blue-600 rounded p-3">
                <p className="text-blue-200 text-sm">
                  Managing roster lock for Season {seasons.find(s => s.id === selectedSeason)?.season_number}
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    lockStatus.is_locked ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {lockStatus.is_locked ? 'LOCKED' : 'UNLOCKED'}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Current Status Card */}
        {selectedSeason && (
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex items-center mb-4">
            {lockStatus?.is_locked ? (
              <Lock className="h-8 w-8 text-red-500 mr-3" />
            ) : (
              <Unlock className="h-8 w-8 text-green-500 mr-3" />
            )}
            <div>
              <h2 className="text-xl font-bold">
                Roster Status: {lockStatus?.is_locked ? 'LOCKED' : 'UNLOCKED'}
              </h2>
              <p className="text-gray-400">
                Squad invitations are currently {lockStatus?.is_locked ? 'BLOCKED' : 'ALLOWED'}
              </p>
            </div>
          </div>

          {lockStatus && (
            <div className="space-y-2 text-sm text-gray-300">
              {lockStatus.locked_at && (
                <p><Clock className="h-4 w-4 inline mr-2" />Locked at: {new Date(lockStatus.locked_at).toLocaleString()}</p>
              )}
              {lockStatus.unlocked_at && (
                <p><Clock className="h-4 w-4 inline mr-2" />Unlocked at: {new Date(lockStatus.unlocked_at).toLocaleString()}</p>
              )}
              {lockStatus.reason && (
                <p><Shield className="h-4 w-4 inline mr-2" />Reason: {lockStatus.reason}</p>
              )}
            </div>
          )}
        </div>
        )}

        {/* Pending Invites Summary */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex items-center mb-4">
            <Users className="h-6 w-6 text-blue-500 mr-2" />
            <h3 className="text-lg font-bold">Pending Invitations ({pendingInvites.length})</h3>
          </div>
          
          {pendingInvites.length > 0 ? (
            <div className="space-y-2">
              {pendingInvites.slice(0, 5).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between bg-gray-700 rounded p-3">
                  <div>
                    <span className="font-medium">{invite.invited_player_alias}</span>
                    <span className="text-gray-400 ml-2">→ {invite.squad_name} [{invite.squad_tag}]</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {pendingInvites.length > 5 && (
                <p className="text-gray-400 text-sm">... and {pendingInvites.length - 5} more</p>
              )}
            </div>
          ) : (
            <p className="text-gray-400">No pending invitations</p>
          )}
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center ${
            message.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
          }`}>
            {message.type === 'success' ? 
              <CheckCircle className="h-5 w-5 mr-2" /> : 
              <AlertTriangle className="h-5 w-5 mr-2" />
            }
            {message.text}
          </div>
        )}

        {/* Toggle Control */}
        {selectedSeason && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">
            {lockStatus?.is_locked ? 'Unlock Roster' : 'Lock Roster'}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-white font-medium mb-2">Reason (Required)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={lockStatus?.is_locked ? 
                  "Why are you unlocking the roster? (e.g., Tournament ended, roster changes allowed)" : 
                  "Why are you locking the roster? (e.g., Tournament starting, roster freeze for playoffs)"
                }
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>

            <div className={`p-4 rounded-lg ${
              lockStatus?.is_locked ? 'bg-green-900/50 border border-green-600' : 'bg-red-900/50 border border-red-600'
            }`}>
              <div className="flex items-center">
                <AlertTriangle className={`h-5 w-5 mr-2 ${
                  lockStatus?.is_locked ? 'text-green-400' : 'text-red-400'
                }`} />
                <p className={`text-sm ${
                  lockStatus?.is_locked ? 'text-green-200' : 'text-red-200'
                }`}>
                  {lockStatus?.is_locked ? (
                    <>
                      <strong>Unlocking</strong> will allow squad captains to send invitations and players to accept them.
                    </>
                  ) : (
                    <>
                      <strong>Locking</strong> will immediately cancel all {pendingInvites.length} pending invitations 
                      and prevent new invitations from being sent or accepted.
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={toggleRosterLock}
              disabled={updating || !reason.trim()}
              className={`w-full px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center ${
                lockStatus?.is_locked
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {updating ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              ) : lockStatus?.is_locked ? (
                <Unlock className="h-5 w-5 mr-2" />
              ) : (
                <Lock className="h-5 w-5 mr-2" />
              )}
              {updating ? 'Updating...' : lockStatus?.is_locked ? 'Unlock Roster' : 'Lock Roster'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}