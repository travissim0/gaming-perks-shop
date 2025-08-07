'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';

interface UserZone {
  zone_key: string;
  zone_name: string;
  permissions: string[];
  status: 'RUNNING' | 'STOPPED' | 'UNKNOWN';
  playerCount: number;
}

export default function TestZoneManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<UserZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  // Fetch user's zone permissions and status
  const fetchUserZones = async (showLoading = true) => {
    if (!user) return;

    try {
      if (showLoading) setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token');

      const response = await fetch('/api/user-zone-control', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setZones(data.zones || []);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch zone data');
      }
    } catch (error) {
      console.error('Error fetching user zones:', error);
      toast.error('Failed to load zone information');
    } finally {
      setLoading(false);
    }
  };

  // Execute zone action
  const executeZoneAction = async (zoneKey: string, action: 'start' | 'stop' | 'restart') => {
    try {
      setActionLoading(`${zoneKey}-${action}`);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token');

      const response = await fetch('/api/user-zone-control', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, zone_key: zoneKey }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Zone ${zoneKey} ${action} successful: ${data.message}`);
        // Refresh zone status after action
        setTimeout(() => {
          fetchUserZones(false);
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

  // Load zones on mount and set up auto-refresh
  useEffect(() => {
    if (user) {
      fetchUserZones();
      
      // Auto-refresh every 60 seconds
      const interval = setInterval(() => {
        fetchUserZones(false);
      }, 60000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

  // Show loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading zone information...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show no access message if user has no zones
  if (zones.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8">Test Zone Management</h1>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <div className="text-6xl mb-4">🚫</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">No Zone Access</h2>
              <p className="text-gray-400">
                You don't have permission to manage any test zones at this time.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Test Zone Management</h1>
              <p className="text-gray-400">Manage your authorized test zones</p>
            </div>
            
            <div className="flex items-center gap-4">
              {lastUpdated && (
                <span className="text-sm text-gray-400">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              
              <button
                onClick={() => fetchUserZones()}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Zone Cards */}
          <div className="space-y-4">
            {zones.map((zone) => (
              <div key={zone.zone_key} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  
                  {/* Zone Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">{zone.zone_name}</h3>
                      <span 
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          zone.status === 'RUNNING' 
                            ? 'bg-green-900/50 text-green-300 border border-green-500/30'
                            : zone.status === 'STOPPED'
                            ? 'bg-red-900/50 text-red-300 border border-red-500/30'
                            : 'bg-gray-900/50 text-gray-300 border border-gray-500/30'
                        }`}
                      >
                        ● {zone.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>Key: <code className="text-cyan-400">{zone.zone_key}</code></span>
                      <span>Players: <span className="text-white">{zone.playerCount}</span></span>
                      <span>Permissions: <span className="text-cyan-400">{zone.permissions.join(', ')}</span></span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 ml-6">
                    {zone.permissions.includes('start') && (
                      <button
                        onClick={() => executeZoneAction(zone.zone_key, 'start')}
                        disabled={actionLoading === `${zone.zone_key}-start`}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {actionLoading === `${zone.zone_key}-start` ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Starting...
                          </>
                        ) : (
                          <>
                            ▶️ Start
                          </>
                        )}
                      </button>
                    )}

                    {zone.permissions.includes('stop') && (
                      <button
                        onClick={() => executeZoneAction(zone.zone_key, 'stop')}
                        disabled={actionLoading === `${zone.zone_key}-stop`}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {actionLoading === `${zone.zone_key}-stop` ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Stopping...
                          </>
                        ) : (
                          <>
                            ⏹️ Stop
                          </>
                        )}
                      </button>
                    )}

                    {zone.permissions.includes('restart') && (
                      <button
                        onClick={() => executeZoneAction(zone.zone_key, 'restart')}
                        disabled={actionLoading === `${zone.zone_key}-restart`}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {actionLoading === `${zone.zone_key}-restart` ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Restarting...
                          </>
                        ) : (
                          <>
                            🔄 Restart
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Info */}
          <div className="mt-8 p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-400">
              ℹ️ You have been granted specific permissions to manage these test zones. 
              Changes will take effect within a few seconds. If you encounter any issues, please contact an administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
