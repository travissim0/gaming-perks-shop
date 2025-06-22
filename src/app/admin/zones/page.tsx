'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Zone {
  name: string;
  status: 'RUNNING' | 'STOPPED';
  key: string;
}

interface ZoneData {
  [key: string]: Omit<Zone, 'key'>;
}

type SortField = 'name' | 'status' | 'key';
type SortOrder = 'asc' | 'desc';

export default function ZoneManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<ZoneData>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');

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
        await fetchZoneStatus();
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

  // Fetch zone status
  const fetchZoneStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      console.log('Auth debug:', {
        hasSession: !!session,
        hasToken: !!token,
        user: session?.user?.id,
        tokenLength: token?.length
      });
      
      if (!token) {
        console.error('No auth token available');
        setMessage({ type: 'error', text: 'Authentication required. Please log in again.' });
        return;
      }

      const response = await fetch('/api/admin/zone-management?action=status-all', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      const result = await response.json();
      console.log('Raw API response:', result);
      
      if (response.status === 401) {
        setMessage({ type: 'error', text: 'Authentication failed. Please log in again.' });
        return;
      }
      
      if (response.status === 403) {
        setMessage({ type: 'error', text: 'Access denied. Zone admin privileges required.' });
        return;
      }
      
      if (!response.ok) {
        throw new Error(result.error || `Failed to fetch zone status (${response.status})`);
      }
      
      console.log('Fetched zone data:', result.data);
      
      const zoneData: ZoneData = result.data;
      if (!zoneData) {
        console.error("zoneData is null or undefined", result);
        throw new Error("No zone data received from API.");
      }
      const zonesArray = Object.entries(zoneData).map(([key, value]) => ({
        key,
        name: value.name,
        status: value.status,
      }));

      setZones(zoneData);
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
      setLoading(false);
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
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action, zone: zoneKey }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: `Zone ${zoneKey} ${action} successful: ${data.message}` });
        // Refresh zone status after action
        setTimeout(() => fetchZoneStatus(), 2000);
      } else {
        throw new Error(data.error || `Failed to ${action} zone`);
      }
    } catch (error) {
      console.error(`Error ${action}ing zone:`, error);
      setMessage({ type: 'error', text: `Failed to ${action} zone ${zoneKey}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (user && hasAdminAccess) {
      fetchZoneStatus();
      const interval = setInterval(fetchZoneStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user, hasAdminAccess]);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  // Convert zones object to sorted and filtered array
  const sortedAndFilteredZones = useMemo(() => {
    const zoneArray = Object.entries(zones).map(([key, zone]) => ({
      ...zone,
      key
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Infantry Zone Management
          </h1>
          <div className="flex items-center justify-between">
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

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-3 rounded-lg border text-sm ${
            message.type === 'success' 
              ? 'bg-green-900/20 border-green-500/30 text-green-300' 
              : 'bg-red-900/20 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <span className="text-green-400">✓</span>
              ) : (
                <span className="text-red-400">✗</span>
              )}
              {message.text}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'running' | 'stopped')}
              className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Zones</option>
              <option value="running">Running Only</option>
              <option value="stopped">Stopped Only</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchZoneStatus}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-200 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                Refreshing...
              </>
            ) : (
              <>
                🔄 Refresh
              </>
            )}
          </button>

          {/* Zone Count */}
          <div className="text-sm text-gray-400 ml-auto">
            Showing {sortedAndFilteredZones.length} of {Object.keys(zones).length} zones
          </div>
        </div>

        {/* Zone Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cyan-500 border-t-transparent"></div>
          </div>
        ) : sortedAndFilteredZones.length > 0 ? (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600/30 overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-700/50 border-b border-gray-600/30">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-gray-300">
                <button
                  onClick={() => handleSort('name')}
                  className="col-span-4 text-left hover:text-white transition-colors flex items-center gap-2"
                >
                  Zone Name {getSortIcon('name')}
                </button>
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
                <div className="col-span-4 text-center">Actions</div>
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
                  <div className="col-span-4 flex items-center">
                    <div className="text-white font-medium truncate">{zone.name}</div>
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

                  {/* Actions */}
                  <div className="col-span-4 flex items-center justify-center gap-2">
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
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-800/30 rounded-lg border border-gray-600/20">
            <div className="text-gray-400 text-lg mb-2">
              {Object.keys(zones).length === 0 ? 'No zones found' : 'No zones match your filter'}
            </div>
            <p className="text-gray-500 text-sm">
              {Object.keys(zones).length === 0 
                ? 'Make sure the zone management scripts are properly installed on your server.'
                : 'Try adjusting your filter settings.'}
            </p>
          </div>
        )}

        {/* Quick Stats */}
        {!loading && Object.keys(zones).length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-600/20 text-center">
              <div className="text-2xl font-bold text-white">{Object.keys(zones).length}</div>
              <div className="text-sm text-gray-400">Total Zones</div>
            </div>
            <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30 text-center">
              <div className="text-2xl font-bold text-green-300">
                {Object.values(zones).filter(z => z.status === 'RUNNING').length}
              </div>
              <div className="text-sm text-green-400">Running</div>
            </div>
            <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30 text-center">
              <div className="text-2xl font-bold text-red-300">
                {Object.values(zones).filter(z => z.status === 'STOPPED').length}
              </div>
              <div className="text-sm text-red-400">Stopped</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 