'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';

interface Zone {
  name: string;
  status: 'RUNNING' | 'STOPPED';
  key: string;
  playerCount?: number;
}

interface ZoneData {
  [key: string]: Omit<Zone, 'key'>;
}

interface ScheduledOperation {
  id: string;
  zone_key: string;
  zone_name: string;
  action: 'start' | 'stop' | 'restart';
  scheduled_datetime: string;
  created_by_alias: string;
  status: 'scheduled' | 'executed' | 'failed' | 'cancelled' | 'expired';
  created_at: string;
  executed_at?: string;
  error_message?: string;
  execution_result?: string;
}

interface ZoneCommand {
  id: string;
  action: string;
  zone: string;
  status: string;
  admin_id?: string;
  result_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

type SortField = 'name' | 'status' | 'key';
type SortOrder = 'asc' | 'desc';

// Generate time options in 15-minute increments (12-hour format)
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const totalMinutes = i * 15;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  const ampm = hours24 < 12 ? 'AM' : 'PM';
  const formattedMinutes = minutes.toString().padStart(2, '0');
  return {
    display: `${hours12}:${formattedMinutes} ${ampm}`,
    value: `${hours24.toString().padStart(2, '0')}:${formattedMinutes}`
  };
});

export default function ZoneManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [scheduledOperations, setScheduledOperations] = useState<ScheduledOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    zone_key: '',
    action: 'restart' as 'start' | 'stop' | 'restart',
    scheduled_date: '',
    scheduled_time: '',
    use_exact_time: false,
    exact_time: '',
    notes: ''
  });
  const [commandHistory, setCommandHistory] = useState<(ZoneCommand | ScheduledOperation)[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showExpiredOperations, setShowExpiredOperations] = useState(false);
  const [serverPlayerData, setServerPlayerData] = useState<{[key: string]: number}>({});
  
  // Scroll position preservation
  const scrollPositionRef = useRef<number>(0);

  // Check admin access
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }

    if (user) {
      checkAdminStatus();
    }
  }, [user, authLoading, router]);

  const checkAdminStatus = async () => {
    try {
      console.log('Checking admin status for user:', user?.id);
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, is_zone_admin, in_game_alias')
        .eq('id', user?.id)
        .single();

      console.log('Profile query result:', { profile, error });

      if (error) {
        console.error('Error fetching profile:', error);
        throw error;
      }

      const hasAccess = profile?.is_admin || profile?.is_zone_admin;
      setHasAdminAccess(hasAccess || false);
      console.log('Zone Admin Check:', { hasAccess, profileData: profile });

      if (hasAccess) {
        await fetchServerPlayerData();
        await fetchZoneStatus(true); // Initial load
      } else {
        console.log('Access denied - user is not admin or zone admin:', profile);
        toast.error('Access denied: Zone admin privileges required');
        router.push('/');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      toast.error('Error checking admin permissions');
      router.push('/');
    }
  };

  // Add function to fetch server player data
  const fetchServerPlayerData = async () => {
    try {
      const response = await fetch('/api/server-status');
      if (response.ok) {
        const data = await response.json();
        const playerCounts: {[key: string]: number} = {};
        
        // Map server zones to our zone keys based on exact API titles
        data.zones.forEach((zone: any) => {
          const title = zone.title;
          let zoneKey = '';
          
          // Map exact zone titles from API to our zone keys
          switch (title) {
            case 'CTF - Twin Peaks 2.0':
              zoneKey = 'ctf';
              break;
            case 'CTF - Twin Peaks Classic':
              zoneKey = 'tp';
              break;
            case 'USL - Apollo':
            case 'League - USL Matches':
              zoneKey = 'usl';
              break;
            case 'USL - Y Station':
            case 'League - USL Secondary':
              zoneKey = 'usl2';
              break;
            case 'SK - Minimaps':
            case 'Skirmish - Minimaps':
              zoneKey = 'skMini';
              break;
            case 'Sports - GravBall PvK':
            case 'Sports - GravBall':
              zoneKey = 'grav';
              break;
            case 'Arcade - The Arena':
              zoneKey = 'arena';
              break;
            case 'League - USL Test 1':
              zoneKey = 'league_-_usl_test_1';
              break;
            case 'League - USL Test 2':
                zoneKey = 'league_-_usl_test_2';
                break;
            case 'Bots - Zombie Zone':
                  zoneKey = 'zz';
                  break;
          }
          
          if (zoneKey) {
            playerCounts[zoneKey] = zone.playerCount || 0;
          }
        });
        
        setServerPlayerData(playerCounts);
      }
    } catch (error) {
      console.error('Error fetching server player data:', error);
    }
  };

  // Save scroll position before state updates
  const saveScrollPosition = () => {
    scrollPositionRef.current = window.scrollY;
  };

  // Restore scroll position after state updates
  const restoreScrollPosition = () => {
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });
  };

  // Manual refresh function
  const handleManualRefresh = async () => {
    setRefreshing(true);
    saveScrollPosition();
    try {
      await Promise.all([
        fetchServerPlayerData(),
        fetchZoneStatus(false),
        fetchScheduledOperations()
      ]);
      toast.success('Data refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
      restoreScrollPosition();
    }
  };

  // Fetch zone status
  const fetchZoneStatus = async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    } else {
      saveScrollPosition();
    }
    
    try {
      const response = await fetch('/api/admin/zone-management');
      if (!response.ok) {
        throw new Error('Failed to fetch zone data');
      }
      
      const data = await response.json();
      
      // Convert to Zone array format
      const zoneArray: Zone[] = Object.entries(data.zones).map(([key, zone]: [string, any]) => ({
        key,
        name: zone.name,
        status: zone.status,
        playerCount: serverPlayerData[key] || 0
      }));
      
      setZones(zoneArray);
      setLastUpdated(new Date());
      setMessage(null); // Clear any previous error messages
    } catch (error) {
      console.error('Error fetching zone status:', error);
      if (error instanceof TypeError && error.message.includes('NetworkError')) {
        setMessage({ type: 'error', text: 'Network error: Unable to connect to zone management service.' });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setMessage({ type: 'error', text: `Failed to fetch zone status: ${errorMessage}` });
      }
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        restoreScrollPosition();
      }
    }
  };

  // Execute zone action
  const executeZoneAction = async (zoneKey: string, action: 'start' | 'stop' | 'restart') => {
    try {
      setActionLoading(`${zoneKey}-${action}`);
      setMessage(null);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token');

      const response = await fetch('/api/admin/zone-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, zone: zoneKey, admin_id: session?.user?.id }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Zone ${zoneKey} ${action} successful`);
        // Single delayed refresh to allow action to take effect
        setTimeout(() => {
          fetchZoneStatus(false);
          fetchScheduledOperations();
        }, 2000);
      } else {
        throw new Error(data.error || `Failed to ${action} zone`);
      }
    } catch (error) {
      console.error(`Error ${action}ing zone:`, error);
      toast.error(`Failed to ${action} zone ${zoneKey}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Auto-refresh every 60 seconds (reduced from 30s)
  useEffect(() => {
    if (user && hasAdminAccess) {
      fetchZoneStatus(false);
      fetchScheduledOperations();
      const interval = setInterval(() => {
        fetchZoneStatus(false);
        fetchScheduledOperations();
      }, 60000); // Changed from 30000 to 60000 (60 seconds)
      return () => clearInterval(interval);
    }
  }, [user, hasAdminAccess]);

  // Load scheduled operations with automatic cleanup
  const fetchScheduledOperations = async () => {
    try {
      // Mark expired operations (give 5 minute grace period for zone manager to execute)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from('scheduled_zone_management')
        .update({ status: 'expired' })
        .eq('status', 'scheduled')
        .lt('scheduled_datetime', fiveMinutesAgo);

      // Then fetch operations based on filter
      let query = supabase
        .from('scheduled_zone_management')
        .select('*')
        .order('scheduled_datetime', { ascending: true });

      if (!showExpiredOperations) {
        query = query.in('status', ['scheduled', 'executed', 'failed']);
        // Show recent operations (last 7 days) and future scheduled ones
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('scheduled_datetime', sevenDaysAgo);
      } else {
        // Show all operations including expired ones (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('scheduled_datetime', thirtyDaysAgo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setScheduledOperations(data || []);
    } catch (error) {
      console.error('Error fetching scheduled operations:', error);
    }
  };

  // Load command history from both zone_commands and scheduled_zone_management tables
  const fetchCommandHistory = async () => {
    setHistoryLoading(true);
    try {
      // Get zone commands
      const { data: commands, error: commandsError } = await supabase
        .from('zone_commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Last 50 commands

      // Get scheduled operations (executed ones)
      const { data: scheduledOps, error: scheduledError } = await supabase
        .from('scheduled_zone_management')
        .select('*')
        .in('status', ['executed', 'failed'])
        .order('created_at', { ascending: false })
        .limit(50); // Last 50 scheduled operations

      if (commandsError) throw commandsError;
      if (scheduledError) throw scheduledError;

      // Combine and transform scheduled operations to match command format
      const transformedScheduledOps = (scheduledOps || []).map(op => ({
        id: `scheduled_${op.id}`,
        action: op.action,
        zone: op.zone_key,
        status: op.status,
        admin_id: op.created_by,
        result_message: op.execution_result || op.error_message || `Scheduled ${op.action} ${op.status}`,
        created_at: op.created_at,
        started_at: op.created_at,
        completed_at: op.executed_at || op.created_at
      }));

      // Combine both arrays and sort by created_at
      const allHistory = [...(commands || []), ...transformedScheduledOps]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100); // Keep only the most recent 100 entries

      setCommandHistory(allHistory);
    } catch (error) {
      console.error('Error fetching command history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Enhanced create scheduled operation with better error handling
  const createScheduledOperation = async () => {
    const timeToUse = scheduleForm.use_exact_time ? scheduleForm.exact_time : scheduleForm.scheduled_time;
    
    if (!scheduleForm.zone_key || !scheduleForm.scheduled_date || !timeToUse) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    try {
      const scheduledDatetime = new Date(`${scheduleForm.scheduled_date}T${timeToUse}`);
      
      // Validate the scheduled time is in the future
      if (scheduledDatetime <= new Date()) {
        setMessage({ type: 'error', text: 'Scheduled time must be in the future' });
        return;
      }

      // Get zone name from zones data
      const zoneName = zones.find(zone => zone.key === scheduleForm.zone_key)?.name || scheduleForm.zone_key;
      
      const { error } = await supabase
        .from('scheduled_zone_management')
        .insert({
          zone_key: scheduleForm.zone_key,
          zone_name: zoneName,
          action: scheduleForm.action,
          scheduled_datetime: scheduledDatetime.toISOString(),
          created_by: user?.id,
          created_by_alias: user?.user_metadata?.in_game_alias || 'Admin User',
          status: 'scheduled'
        });

      if (error) throw error;

      setMessage({ type: 'success', text: `Scheduled ${scheduleForm.action} for ${zoneName} at ${scheduledDatetime.toLocaleString()}` });
      setShowScheduleModal(false);
      setScheduleForm({
        zone_key: '',
        action: 'restart',
        scheduled_date: '',
        scheduled_time: '',
        use_exact_time: false,
        exact_time: '',
        notes: ''
      });
      await fetchScheduledOperations();
    } catch (error) {
      console.error('Error creating scheduled operation:', error);
      setMessage({ type: 'error', text: 'Failed to schedule operation' });
    }
  };

  // Cancel scheduled operation
  const cancelScheduledOperation = async (operationId: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_zone_management')
        .update({ status: 'cancelled' })
        .eq('id', operationId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Scheduled operation cancelled' });
      await fetchScheduledOperations();
    } catch (error) {
      console.error('Error cancelling scheduled operation:', error);
      setMessage({ type: 'error', text: 'Failed to cancel scheduled operation' });
    }
  };

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  // Convert zones object to sorted and filtered array
  const sortedAndFilteredZones = useMemo(() => {
    const zoneArray = zones.map((zone) => ({
      ...zone,
      key: zone.key
    }));

    // Apply filter
    const filtered = zoneArray.filter(zone => {
      if (filter === 'running') return zone.status === 'RUNNING';
      if (filter === 'stopped') return zone.status === 'STOPPED';
      return true;
    });

    // Apply sort
    return filtered.sort((a, b) => {
      let aValue: string, bValue: string;
      
      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'key':
          aValue = a.key.toLowerCase();
          bValue = b.key.toLowerCase();
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  }, [zones, sortField, sortOrder, filter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-400 bg-blue-900/20 border-blue-500/30';
      case 'executed': return 'text-green-400 bg-green-900/20 border-green-500/30';
      case 'failed': return 'text-red-400 bg-red-900/20 border-red-500/30';
      case 'cancelled': return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
      case 'expired': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
      default: return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return '⏱️';
      case 'executed': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '🚫';
      case 'expired': return '⏰';
      default: return '❓';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return 'N/A';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end.getTime() - start.getTime();
    const seconds = Math.round(durationMs / 1000);
    return `${seconds}s`;
  };

  if (!user || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">
          {authLoading ? 'Loading...' : 'Access Denied'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Infantry Zone Management
          </h1>
          <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-2">
            <p className="text-gray-400">
              Manage Infantry game zones remotely
            </p>
            {lastUpdated && (
              <p className="text-sm text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Removed inline message banner to prevent layout shift. Using toasts instead. */}

        {/* Controls */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {refreshing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Refreshing...
                </>
              ) : (
                <>
                  🔄 Refresh Zones
                </>
              )}
            </button>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              📅 Schedule Operation
            </button>
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) fetchCommandHistory();
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
            >
              📊 {showHistory ? 'Hide' : 'Show'} Command History
            </button>
          </div>

          {/* Zone Filter and Count */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:ml-auto">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-300">Filter:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | 'running' | 'stopped')}
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                <option value="all">All Zones</option>
                <option value="running">Running Only</option>
                <option value="stopped">Stopped Only</option>
              </select>
            </div>
            <div className="text-sm text-gray-400">
              Showing {sortedAndFilteredZones.length} of {zones.length} zones
            </div>
          </div>
        </div>

        {/* Command History Section */}
        {showHistory && (
          <div className="mb-8 bg-gray-800/50 border border-gray-600/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Command History</h2>
              <button
                onClick={fetchCommandHistory}
                disabled={historyLoading}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition-colors disabled:opacity-50"
              >
                {historyLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {historyLoading ? (
              <div className="text-gray-400">Loading command history...</div>
            ) : commandHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600/50">
                      <th className="text-left py-2 text-gray-300">Time</th>
                      <th className="text-left py-2 text-gray-300">Zone</th>
                      <th className="text-left py-2 text-gray-300">Action</th>
                      <th className="text-left py-2 text-gray-300">Status</th>
                      <th className="text-left py-2 text-gray-300">Duration</th>
                      <th className="text-left py-2 text-gray-300">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandHistory.map((command) => {
                      // Type guard to check if it's a ZoneCommand or ScheduledOperation
                      const isZoneCommand = 'zone' in command;
                      const isScheduledOp = 'zone_key' in command;
                      
                      const zoneName = isZoneCommand ? command.zone : isScheduledOp ? command.zone_name : 'Unknown';
                      const startTime = isZoneCommand ? command.started_at : undefined;
                      const endTime = isZoneCommand ? command.completed_at : isScheduledOp ? command.executed_at : undefined;
                      const resultMessage = isZoneCommand ? command.result_message : 
                                          isScheduledOp ? (command.execution_result || command.error_message) : 
                                          'N/A';
                      
                      return (
                        <tr key={command.id} className="border-b border-gray-700/30">
                          <td className="py-2 text-gray-300">{formatDateTime(command.created_at)}</td>
                          <td className="py-2 text-cyan-400">{zoneName}</td>
                          <td className="py-2">
                            <span className="px-2 py-1 bg-blue-900/20 text-blue-300 rounded text-xs border border-blue-500/30">
                              {command.action}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs border ${getStatusColor(command.status)}`}>
                              {getStatusIcon(command.status)} {command.status}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400">
                            {formatDuration(startTime, endTime)}
                          </td>
                          <td className="py-2 text-gray-400 max-w-xs truncate" title={resultMessage || undefined}>
                            {resultMessage || 'N/A'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-gray-400">No command history found</div>
            )}
          </div>
        )}

        {/* Scheduled Operations Section */}
        {scheduledOperations.length > 0 && (
          <div className="mb-8 bg-gray-800/50 border border-gray-600/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Scheduled Operations</h2>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={showExpiredOperations}
                    onChange={(e) => {
                      setShowExpiredOperations(e.target.checked);
                      // Refetch operations when toggling
                      setTimeout(fetchScheduledOperations, 100);
                    }}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  Show Expired
                </label>
                <button
                  onClick={fetchScheduledOperations}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              {scheduledOperations.map((operation) => (
                <div key={operation.id} className="bg-gray-700/30 border border-gray-600/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs border ${getStatusColor(operation.status)}`}>
                        {getStatusIcon(operation.status)} {operation.status}
                      </span>
                      <span className="text-white font-medium">{operation.zone_name}</span>
                      <span className="px-2 py-1 bg-blue-900/20 text-blue-300 rounded text-xs border border-blue-500/30">
                        {operation.action}
                      </span>
                    </div>
                    {operation.status === 'scheduled' && (
                      <button
                        onClick={() => cancelScheduledOperation(operation.id)}
                        className="px-2 py-1 bg-red-600/20 text-red-300 border border-red-500/30 rounded text-xs hover:bg-red-600/30 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-gray-300">
                    <div>
                      <span className="text-gray-400">Scheduled:</span> {formatDateTime(operation.scheduled_datetime)}
                    </div>
                    <div>
                      <span className="text-gray-400">Created by:</span> {operation.created_by_alias}
                    </div>
                    {operation.executed_at && (
                      <div>
                        <span className="text-gray-400">Executed:</span> {formatDateTime(operation.executed_at)}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">Created:</span> {formatDateTime(operation.created_at)}
                    </div>
                  </div>

                  {operation.error_message && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-300 text-sm">
                      <span className="font-medium">Error:</span> {operation.error_message}
                    </div>
                  )}

                  {operation.execution_result && (
                    <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-green-300 text-sm">
                      <span className="font-medium">Result:</span> {operation.execution_result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zone List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cyan-500 border-t-transparent"></div>
          </div>
        ) : sortedAndFilteredZones.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600/30 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-700/50 border-b border-gray-600/30">
                <div className="grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-gray-300">
                  <button
                    onClick={() => handleSort('name')}
                    className="col-span-3 text-left hover:text-white transition-colors flex items-center gap-2"
                  >
                    Zone Name {getSortIcon('name')}
                  </button>
                  <div className="col-span-4 text-center">Actions</div>
                  <button
                    onClick={() => handleSort('key')}
                    className="col-span-2 text-left hover:text-white transition-colors flex items-center gap-2"
                  >
                    Key {getSortIcon('key')}
                  </button>
                  <button
                    onClick={() => handleSort('status')}
                    className="col-span-2 text-left hover:text-white transition-colors flex items-center gap-2"
                  >
                    Status {getSortIcon('status')}
                  </button>
                  <div className="col-span-1 text-center">Players</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-600/30">
                {sortedAndFilteredZones.map((zone) => (
                  <div
                    key={zone.key}
                    className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Zone Name */}
                    <div className="col-span-3 flex items-center">
                      <div className="text-white font-medium truncate">{zone.name}</div>
                    </div>

                    {/* Actions */}
                    <div className="col-span-4 flex items-center justify-start gap-2">
                      {/* Start Button */}
                      <button
                        onClick={() => executeZoneAction(zone.key, 'start')}
                        disabled={zone.status === 'RUNNING' || actionLoading === `${zone.key}-start`}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 min-w-[60px] justify-center"
                      >
                        {actionLoading === `${zone.key}-start` ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                        ) : (
                          <>▶ Start</>
                        )}
                      </button>

                      {/* Stop Button */}
                      <button
                        onClick={() => executeZoneAction(zone.key, 'stop')}
                        disabled={zone.status === 'STOPPED' || actionLoading === `${zone.key}-stop`}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 min-w-[60px] justify-center"
                      >
                        {actionLoading === `${zone.key}-stop` ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                        ) : (
                          <>⏹ Stop</>
                        )}
                      </button>

                      {/* Restart Button */}
                      <button
                        onClick={() => executeZoneAction(zone.key, 'restart')}
                        disabled={actionLoading === `${zone.key}-restart`}
                        className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 min-w-[60px] justify-center"
                      >
                        {actionLoading === `${zone.key}-restart` ? (
                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                        ) : (
                          <>🔄 Restart</>
                        )}
                      </button>
                    </div>

                    {/* Zone Key */}
                    <div className="col-span-2 flex items-center">
                      <code className="text-cyan-300 text-sm bg-gray-900/50 px-2 py-1 rounded">
                        {zone.key}
                      </code>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex items-center">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        zone.status === 'RUNNING'
                          ? 'bg-green-900/30 text-green-300 border border-green-500/30'
                          : 'bg-red-900/30 text-red-300 border border-red-500/30'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          zone.status === 'RUNNING' ? 'bg-green-400' : 'bg-red-400'
                        }`}></div>
                        {zone.status}
                      </div>
                    </div>

                    {/* Player Count */}
                    <div className="col-span-1 flex items-center justify-center">
                      <div className="text-sm text-gray-300">
                        {zone.status === 'RUNNING' ? (zone.playerCount || 0) : 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Card Layout */}
            <div className="lg:hidden space-y-4">
              {sortedAndFilteredZones.map((zone) => (
                <div
                  key={zone.key}
                  className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600/30 p-4"
                >
                  {/* Zone Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {/* Status Indicator */}
                      <div className={`w-3 h-3 rounded-full ${
                        zone.status === 'RUNNING' ? 'bg-green-400' : 'bg-red-400'
                      }`}></div>
                      <div>
                        <h3 className="text-white font-medium truncate">{zone.name}</h3>
                        <code className="text-cyan-300 text-xs bg-gray-900/50 px-1.5 py-0.5 rounded">
                          {zone.key}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Action Dropdown */}
                  <div className="mt-3">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          executeZoneAction(zone.key, e.target.value as 'start' | 'stop' | 'restart');
                          e.target.value = ''; // Reset dropdown
                        }
                      }}
                      disabled={actionLoading?.startsWith(zone.key)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-cyan-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {actionLoading?.startsWith(zone.key) ? 'Processing...' : 'Select Action'}
                      </option>
                      {zone.status === 'STOPPED' && (
                        <option value="start">▶ Start Zone</option>
                      )}
                      {zone.status === 'RUNNING' && (
                        <option value="stop">⏹ Stop Zone</option>
                      )}
                      <option value="restart">🔄 Restart Zone</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        
        ) : (
          <div className="text-center py-12 bg-gray-800/30 rounded-lg border border-gray-600/20">
            <div className="text-gray-400 text-lg mb-2">
              {zones.length === 0 ? 'No zones found' : 'No zones match your filter'}
            </div>
            <p className="text-gray-500 text-sm">
              {zones.length === 0 
                ? 'Make sure the zone management scripts are properly installed on your server.'
                : 'Try adjusting your filter settings.'}
            </p>
          </div>
        )}

        {/* Quick Stats */}
        {!loading && zones.length > 0 && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-600/20 text-center">
              <div className="text-2xl font-bold text-white">{zones.length}</div>
              <div className="text-sm text-gray-400">Total Zones</div>
            </div>
            <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30 text-center">
              <div className="text-2xl font-bold text-green-300">
                {zones.filter(z => z.status === 'RUNNING').length}
              </div>
              <div className="text-sm text-green-400">Running</div>
            </div>
            <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30 text-center">
              <div className="text-2xl font-bold text-red-300">
                {zones.filter(z => z.status === 'STOPPED').length}
              </div>
              <div className="text-sm text-red-400">Stopped</div>
            </div>
          </div>
        )}
      </div>

      {/* Schedule Operation Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">Schedule Zone Operation</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Zone <span className="text-red-400">*</span></label>
                <select
                  value={scheduleForm.zone_key}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, zone_key: e.target.value }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="">Select a zone...</option>
                  {zones.map((zone) => (
                    <option key={zone.key} value={zone.key}>{zone.name} ({zone.key})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Action <span className="text-red-400">*</span></label>
                <select
                  value={scheduleForm.action}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, action: e.target.value as 'start' | 'stop' | 'restart' }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="restart">Restart Zone</option>
                  <option value="start">Start Zone</option>
                  <option value="stop">Stop Zone</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Date <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={scheduleForm.scheduled_date}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Time <span className="text-red-400">*</span></label>
                  {!scheduleForm.use_exact_time ? (
                    <select
                      value={scheduleForm.scheduled_time}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_time: e.target.value }))}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select time...</option>
                      {TIME_OPTIONS.map((time) => (
                        <option key={time.value} value={time.value}>{time.display}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="time"
                      value={scheduleForm.exact_time}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, exact_time: e.target.value }))}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use_exact_time"
                  checked={scheduleForm.use_exact_time}
                  onChange={(e) => setScheduleForm(prev => ({ 
                    ...prev, 
                    use_exact_time: e.target.checked,
                    // Clear the other time field when switching modes
                    scheduled_time: e.target.checked ? '' : prev.scheduled_time,
                    exact_time: e.target.checked ? prev.exact_time : ''
                  }))}
                  className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                />
                <label htmlFor="use_exact_time" className="text-sm text-gray-300">
                  Set exact time (override 15-minute increments)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes (optional)</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this scheduled operation..."
                  rows={3}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  setScheduleForm({
                    zone_key: '',
                    action: 'restart',
                    scheduled_date: '',
                    scheduled_time: '',
                    use_exact_time: false,
                    exact_time: '',
                    notes: ''
                  });
                }}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createScheduledOperation}
                disabled={!scheduleForm.zone_key || !scheduleForm.scheduled_date || (!scheduleForm.use_exact_time && !scheduleForm.scheduled_time) || (scheduleForm.use_exact_time && !scheduleForm.exact_time)}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Schedule Operation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 