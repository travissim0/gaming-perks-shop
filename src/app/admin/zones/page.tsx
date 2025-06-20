'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Zone {
  name: string;
  status: 'RUNNING' | 'STOPPED';
}

interface ZoneData {
  [key: string]: Zone;
}

export default function ZoneManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<ZoneData>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user?.id)
        .single();

      if (!profile?.is_admin) {
        toast.error('Access denied: Admin privileges required');
        router.push('/');
        return;
      }

      setHasAdminAccess(true);
    } catch (error) {
      console.error('Error checking admin status:', error);
      router.push('/');
    }
  };

  // Fetch zone status
  const fetchZoneStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token');

      const response = await fetch('/api/admin/zone-management?action=status-all', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setZones(data.zones);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch zone status');
      }
    } catch (error) {
      console.error('Error fetching zone status:', error);
      setMessage({ type: 'error', text: 'Failed to fetch zone status' });
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
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Infantry Zone Management
          </h1>
          <p className="text-gray-400">
            Manage Infantry game zones - Start, Stop, and Restart zones remotely
          </p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-2">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-900/20 border-green-500/30 text-green-300' 
              : 'bg-red-900/20 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <span className="text-green-400">✅</span>
              ) : (
                <span className="text-red-400">❌</span>
              )}
              {message.text}
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="mb-6">
          <button
            onClick={fetchZoneStatus}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Refreshing...
              </>
            ) : (
              <>
                🔄 Refresh Status
              </>
            )}
          </button>
        </div>

        {/* Zone Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(zones).map(([zoneKey, zone]) => (
              <div
                key={zoneKey}
                className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-600/30 p-6 hover:border-cyan-500/30 transition-all duration-300"
              >
                {/* Zone Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white truncate">
                    {zone.name}
                  </h3>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    zone.status === 'RUNNING'
                      ? 'bg-green-900/30 text-green-300 border border-green-500/30'
                      : 'bg-red-900/30 text-red-300 border border-red-500/30'
                  }`}>
                    {zone.status === 'RUNNING' ? '🟢 RUNNING' : '🔴 STOPPED'}
                  </div>
                </div>

                {/* Zone Details */}
                <div className="text-gray-400 text-sm mb-6">
                  <div>Zone Key: <span className="text-cyan-300 font-mono">{zoneKey}</span></div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {/* Start Button */}
                  <button
                    onClick={() => executeZoneAction(zoneKey, 'start')}
                    disabled={zone.status === 'RUNNING' || actionLoading === `${zoneKey}-start`}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2 min-w-0"
                  >
                    {actionLoading === `${zoneKey}-start` ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Starting...
                      </>
                    ) : (
                      <>
                        ▶️ Start
                      </>
                    )}
                  </button>

                  {/* Stop Button */}
                  <button
                    onClick={() => executeZoneAction(zoneKey, 'stop')}
                    disabled={zone.status === 'STOPPED' || actionLoading === `${zoneKey}-stop`}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2 min-w-0"
                  >
                    {actionLoading === `${zoneKey}-stop` ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Stopping...
                      </>
                    ) : (
                      <>
                        ⏹️ Stop
                      </>
                    )}
                  </button>

                  {/* Restart Button */}
                  <button
                    onClick={() => executeZoneAction(zoneKey, 'restart')}
                    disabled={actionLoading === `${zoneKey}-restart`}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2 mt-2"
                  >
                    {actionLoading === `${zoneKey}-restart` ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Restarting...
                      </>
                    ) : (
                      <>
                        🔄 Restart
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && Object.keys(zones).length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-xl mb-4">No zones found</div>
            <p className="text-gray-500">
              Make sure the zone management scripts are properly installed on your server.
            </p>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-12 bg-gray-800/30 rounded-lg p-6 border border-gray-600/20">
          <h3 className="text-lg font-semibold text-white mb-3">Zone Management Info</h3>
          <div className="text-gray-400 text-sm space-y-2">
            <p>• Zones are automatically refreshed every 30 seconds</p>
            <p>• All actions are logged for security and audit purposes</p>
            <p>• Zone status is retrieved in real-time from the Infantry server</p>
            <p>• Use the restart function to apply configuration changes</p>
          </div>
        </div>
      </div>
    </div>
  );
} 