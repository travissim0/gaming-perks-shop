'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { buildMapPairs, mapNameFor, presetsForZone, type MapPreset } from '@/lib/zoneMaps';

// Must stay in sync with GRANTABLE_USER_ACTIONS in src/lib/zoneControl.ts.
// 'maps' is the grant name for map rotation; the daemon action it queues is
// swap-lvl-lio.
type ZoneAction = 'start' | 'stop' | 'restart' | 'rebuild' | 'maps';

interface UserZone {
  zone_key: string;
  zone_name: string;
  permissions: string[];
  status: 'RUNNING' | 'STOPPED' | 'UNKNOWN';
  playerCount: number;
  runningOn?: string | null;
}

export default function TestZoneManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<UserZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Map picker (only for zones granted 'maps') - same inventory the admin
  // console shows: the daemon-reported zone_maps row + curated presets.
  const [mapsZone, setMapsZone] = useState<UserZone | null>(null);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsRows, setMapsRows] = useState<any[]>([]);
  const [mapPresets, setMapPresets] = useState<MapPreset[]>([]);
  const [mapForm, setMapForm] = useState<{ cfg: string; lvl: string; lio: string }>({ cfg: '', lvl: '', lio: '' });
  const [showManualMap, setShowManualMap] = useState(false);

  const activeMapRow = mapsZone
    ? (mapsRows.find(r => r.server_key === mapsZone.runningOn) || mapsRows[0])
    : null;
  const mapPairs = buildMapPairs(activeMapRow);
  const zonePresets = presetsForZone(activeMapRow, mapPresets);
  const mapName = mapForm.lvl && mapForm.lio
    ? mapNameFor(mapForm.lvl, mapForm.lio, mapPresets, mapPairs)
    : '';

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

  // Open the map picker for a zone and load its inventory
  const openMaps = async (zone: UserZone) => {
    setMapsZone(zone);
    setMapsLoading(true);
    setMapsRows([]);
    setMapPresets([]);
    setMapForm({ cfg: '', lvl: '', lio: '' });
    setShowManualMap(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/user-zone-control?maps=${encodeURIComponent(zone.zone_key)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load maps');
      const rows: any[] = data.maps || [];
      setMapsRows(rows);
      setMapPresets(data.presets || []);
      const row = rows.find(r => r.server_key === zone.runningOn) || rows[0];
      if (row) setMapForm({ cfg: row.current_cfg || '', lvl: row.current_lvl || '', lio: row.current_lio || '' });
    } catch (e: any) {
      toast.error(e.message || 'Failed to load maps');
    } finally {
      setMapsLoading(false);
    }
  };

  // Queue a map swap: points the zone's cfg at the new lvl/lio and restarts it
  const submitMapSwap = async () => {
    if (!mapsZone || !mapForm.lvl || !mapForm.lio) return;
    if (!window.confirm(
      `Load ${mapName || mapForm.lvl} on ${mapsZone.zone_name}?\n\nThe zone restarts to load the map, so anyone playing will be disconnected.`
    )) {
      return;
    }
    setActionLoading(`${mapsZone.zone_key}-maps`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/user-zone-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'maps',
          zone_key: mapsZone.zone_key,
          args: {
            cfg: mapForm.cfg || undefined,
            lvl: mapForm.lvl,
            lio: mapForm.lio,
            zoneName: mapName || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Map swap failed');
      toast.success(`${mapName || mapForm.lvl} queued for ${mapsZone.zone_key} — the zone will restart`);
      setMapsZone(null);
      setTimeout(() => fetchUserZones(false), 3000);
    } catch (e: any) {
      toast.error(e.message || 'Map swap failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Execute zone action
  const executeZoneAction = async (zoneKey: string, action: ZoneAction) => {
    // Rebuild downloads the latest server build and restarts the zone, so it
    // kicks everyone in it - make it a deliberate click.
    if (action === 'rebuild' && !window.confirm(
      `Rebuild ${zoneKey}?\n\nThis downloads the latest server build, deploys it to the zone and restarts it. Anyone currently playing will be disconnected.`
    )) {
      return;
    }

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
            <h1 className="text-3xl font-bold text-white mb-8">Zone Management</h1>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <div className="text-6xl mb-4">🚫</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">No Zone Access</h2>
              <p className="text-gray-400">
                You don't have permission to manage any zones at this time.
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
              <h1 className="text-3xl font-bold text-white mb-2">Zone Management</h1>
              <p className="text-gray-400">Manage the zones you have been granted control of</p>
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

                    {zone.permissions.includes('maps') && (
                      <button
                        onClick={() => openMaps(zone)}
                        disabled={actionLoading === `${zone.zone_key}-maps`}
                        title="Pick a map for this zone (the zone restarts to load it)"
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {actionLoading === `${zone.zone_key}-maps` ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Swapping...
                          </>
                        ) : (
                          <>
                            🗺 Maps
                          </>
                        )}
                      </button>
                    )}

                    {zone.permissions.includes('rebuild') && (
                      <button
                        onClick={() => executeZoneAction(zone.zone_key, 'rebuild')}
                        disabled={actionLoading === `${zone.zone_key}-rebuild`}
                        title="Download the latest server build, deploy it to this zone and restart it"
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {actionLoading === `${zone.zone_key}-rebuild` ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Rebuilding...
                          </>
                        ) : (
                          <>
                            🛠️ Rebuild
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
              ℹ️ You have been granted specific permissions to manage these zones.
              Changes will take effect within a few seconds. If you encounter any issues, please contact an administrator.
            </p>
          </div>
        </div>
      </div>

      {/* Map picker - mirrors the admin console's Maps modal */}
      {mapsZone && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900/95 border border-cyan-500/20 rounded-2xl shadow-xl shadow-cyan-500/10 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-xl font-semibold text-white">🗺 Swap Map — {mapsZone.zone_name}</h3>
              <button
                onClick={() => setMapsZone(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-5">
              Points the zone's config at a new map and restarts the zone to load it.
            </p>

            {mapsLoading ? (
              <div className="text-gray-400 py-8 text-center">Loading maps...</div>
            ) : !activeMapRow ? (
              <div className="text-gray-400 py-8 text-center">
                No map configs have been reported for this zone yet.
              </div>
            ) : (
              <>
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 mb-4 text-sm">
                  <div className="text-gray-400 mb-1">Currently loaded</div>
                  <div className="text-gray-300">
                    lvl: <span className="text-white">{activeMapRow.current_lvl || '—'}</span> ·
                    lio: <span className="text-white">{activeMapRow.current_lio || '—'}</span>
                  </div>
                </div>

                {/* Curated maps with thumbnails */}
                {zonePresets.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    {zonePresets.map((p) => {
                      const selected = mapForm.lvl === p.lvl_file && mapForm.lio === p.lio_file;
                      return (
                        <button
                          key={p.id || `${p.lvl_file}|${p.lio_file}`}
                          onClick={() => setMapForm(prev => ({ ...prev, lvl: p.lvl_file!, lio: p.lio_file! }))}
                          className={`rounded-lg overflow-hidden border text-left transition-colors ${
                            selected ? 'border-cyan-400 ring-2 ring-cyan-500/40' : 'border-gray-700 hover:border-gray-500'
                          }`}
                        >
                          {p.preview_image_url ? (
                            <img src={p.preview_image_url} alt={p.display_name || ''} className="w-full h-24 object-cover" />
                          ) : (
                            <div className="w-full h-24 bg-gray-800 flex items-center justify-center text-gray-600 text-2xl">🗺</div>
                          )}
                          <div className="px-2 py-1.5 text-sm text-white truncate bg-gray-800/80">
                            {p.display_name || p.lvl_file}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Everything else the zone has on disk */}
                {mapPairs.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {zonePresets.length > 0 ? 'Other maps' : 'Map'}
                    </label>
                    <select
                      value={`${mapForm.lvl}|${mapForm.lio}`}
                      onChange={(e) => {
                        const [lvl, lio] = e.target.value.split('|');
                        setMapForm(prev => ({ ...prev, lvl, lio }));
                      }}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="|">Select a map...</option>
                      {mapPairs.map((pair) => (
                        <option key={pair.key} value={pair.key}>{pair.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={() => setShowManualMap(v => !v)}
                  className="text-xs text-gray-400 hover:text-gray-200 mb-3"
                >
                  {showManualMap ? 'Hide' : 'Pick lvl / lio files individually'}
                </button>

                {showManualMap && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">.lvl</label>
                      <select
                        value={mapForm.lvl}
                        onChange={(e) => setMapForm(prev => ({ ...prev, lvl: e.target.value }))}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      >
                        <option value="">Select...</option>
                        {(activeMapRow.lvls || []).map((f: string) => (<option key={f} value={f}>{f}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">.lio</label>
                      <select
                        value={mapForm.lio}
                        onChange={(e) => setMapForm(prev => ({ ...prev, lio: e.target.value }))}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      >
                        <option value="">Select...</option>
                        {(activeMapRow.lios || []).map((f: string) => (<option key={f} value={f}>{f}</option>))}
                      </select>
                    </div>
                  </div>
                )}

                {mapForm.lvl && mapForm.lio && (
                  <div className="text-sm text-gray-400 mb-4">
                    Selected: <span className="text-white">{mapForm.lvl}</span> · <span className="text-white">{mapForm.lio}</span>
                    {mapName && (
                      <div className="mt-1">
                        Zone name will be set to <span className="text-cyan-300 font-medium">{mapName}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setMapsZone(null)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitMapSwap}
                    disabled={!mapForm.lvl || !mapForm.lio || actionLoading === `${mapsZone.zone_key}-maps`}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg font-medium"
                  >
                    {actionLoading === `${mapsZone.zone_key}-maps` ? 'Swapping…' : 'Swap & Restart'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
