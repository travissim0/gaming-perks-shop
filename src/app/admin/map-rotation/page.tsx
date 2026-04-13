'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';

interface ZoneStatus {
  running: boolean;
  cfg: string;
  lvl: string;
  lio: string;
  zoneName: string;
  stale?: boolean;
  age_seconds?: number;
}

interface CfgFile {
  cfg: string;
  lvl: string;
  lio: string;
}

interface PoolEntry {
  id: string;
  display_name: string;
  cfg_file: string;
  lvl_file: string;
  lio_file: string;
  enabled: boolean;
}

interface HistoryEntry {
  id: string;
  created_at: string;
  previous_cfg: string;
  new_cfg: string;
  previous_lvl: string;
  new_lvl: string;
  triggered_by_alias: string;
  force_rotated: boolean;
  player_count_at_rotation: number;
  status: string;
  rotation_type: string;
  error_message: string;
}

interface CommandEntry {
  id: string;
  command: string;
  args: any;
  status: string;
  requested_by_alias: string;
  created_at: string;
  completed_at: string;
  error_message: string;
}

type QuickRotateTab = 'swap-cfg' | 'custom-lvl-lio';

export default function MapRotationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const [zoneStatus, setZoneStatus] = useState<ZoneStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [quickRotateTab, setQuickRotateTab] = useState<QuickRotateTab>('swap-cfg');
  const [cfgFiles, setCfgFiles] = useState<CfgFile[]>([]);
  const [lvlFiles, setLvlFiles] = useState<string[]>([]);
  const [lioFiles, setLioFiles] = useState<string[]>([]);
  const [selectedCfg, setSelectedCfg] = useState('');
  const [selectedLvl, setSelectedLvl] = useState('');
  const [selectedLio, setSelectedLio] = useState('');
  const [targetCfgForCustom, setTargetCfgForCustom] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [rotating, setRotating] = useState(false);

  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [newPoolCfg, setNewPoolCfg] = useState('');
  const [newPoolName, setNewPoolName] = useState('');

  // Map Presets
  const [presets, setPresets] = useState<any[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetLvl, setNewPresetLvl] = useState('');
  const [newPresetLio, setNewPresetLio] = useState('');
  const [newPresetCfg, setNewPresetCfg] = useState('');
  const [newPresetZoneName, setNewPresetZoneName] = useState('');
  const [newPresetImageUrl, setNewPresetImageUrl] = useState('');

  const [scheduleWindowStart, setScheduleWindowStart] = useState('02:00');
  const [scheduleWindowEnd, setScheduleWindowEnd] = useState('08:00');
  const [scheduleThreshold, setScheduleThreshold] = useState(16);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [recentCommands, setRecentCommands] = useState<CommandEntry[]>([]);

  const [showForceConfirm, setShowForceConfirm] = useState(false);

  // Helper to get auth headers
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (user) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  const checkAdminStatus = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, is_zone_admin')
        .eq('id', user?.id)
        .single();

      const hasAccess = profile?.is_admin || profile?.is_zone_admin;
      setHasAdminAccess(hasAccess || false);

      if (hasAccess) {
        setPageLoading(false);
        fetchAll();
      } else {
        toast.error('Access denied: Admin privileges required');
        router.push('/');
      }
    } catch {
      toast.error('Error checking admin permissions');
      router.push('/');
    }
  };

  const fetchAll = useCallback(() => {
    fetchStatus();
    fetchCfgFiles();
    fetchLvlFiles();
    fetchLioFiles();
    fetchPlayerCount();
    fetchPool();
    fetchPresets();
    fetchSchedule();
    fetchHistory();
    fetchCommands();
  }, []);

  // Auto-guess LIO when LVL is selected
  const handleLvlSelect = (lvl: string) => {
    setSelectedLvl(lvl);
    if (lvl) {
      const baseName = lvl.replace(/\.lvl$/i, '');
      const matchingLio = lioFiles.find(f => f.toLowerCase() === `${baseName}.lio`.toLowerCase());
      setSelectedLio(matchingLio || '');
    } else {
      setSelectedLio('');
    }
  };

  // Same auto-guess for preset form
  const handlePresetLvlSelect = (lvl: string) => {
    setNewPresetLvl(lvl);
    if (lvl) {
      const baseName = lvl.replace(/\.lvl$/i, '');
      const matchingLio = lioFiles.find(f => f.toLowerCase() === `${baseName}.lio`.toLowerCase());
      setNewPresetLio(matchingLio || '');
    } else {
      setNewPresetLio('');
    }
  };

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!hasAdminAccess) return;
    const interval = setInterval(() => {
      fetchStatus();
      fetchPlayerCount();
      fetchCommands();
    }, 15000);
    return () => clearInterval(interval);
  }, [hasAdminAccess]);

  // --- Fetch functions ---

  const apiFetch = async (url: string, options?: RequestInit) => {
    const headers = await getAuthHeaders();
    return fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
  };

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=status');
      const json = await res.json();
      if (json.success && json.data) {
        setZoneStatus(json.data);
      }
    } catch (err) {
      console.error('Error fetching zone status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchCfgFiles = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=list-cfgs');
      const json = await res.json();
      if (json.success && json.data) {
        setCfgFiles(Array.isArray(json.data) ? json.data : []);
      }
    } catch (err) {
      console.error('Error fetching cfg files:', err);
    }
  };

  const fetchLvlFiles = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=list-lvls');
      const json = await res.json();
      if (json.success && json.data) {
        setLvlFiles(Array.isArray(json.data) ? json.data : []);
      }
    } catch (err) {
      console.error('Error fetching lvl files:', err);
    }
  };

  const fetchLioFiles = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=list-lios');
      const json = await res.json();
      if (json.success && json.data) {
        setLioFiles(Array.isArray(json.data) ? json.data : []);
      }
    } catch (err) {
      console.error('Error fetching lio files:', err);
    }
  };

  const fetchPlayerCount = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=check-players');
      const json = await res.json();
      if (json.success && json.data) {
        setPlayerCount(json.data.playerCount ?? null);
      }
    } catch (err) {
      console.error('Error fetching player count:', err);
    }
  };

  const fetchPool = async () => {
    setPoolLoading(true);
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=pool');
      const json = await res.json();
      if (json.success && json.data) {
        setPool(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching pool:', err);
    } finally {
      setPoolLoading(false);
    }
  };

  const fetchSchedule = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=schedule');
      const json = await res.json();
      if (json.success && json.data?.[0]) {
        const s = json.data[0];
        setScheduleWindowStart(s.rotation_window_start || '02:00');
        setScheduleWindowEnd(s.rotation_window_end || '08:00');
        setScheduleThreshold(s.player_threshold ?? 16);
        setScheduleEnabled(s.enabled ?? false);
      }
    } catch (err) {
      console.error('Error fetching schedule:', err);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=history');
      const json = await res.json();
      if (json.success && json.data) {
        setHistory(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchPresets = async () => {
    setPresetsLoading(true);
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=presets');
      const json = await res.json();
      if (json.success && json.data) {
        setPresets(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching presets:', err);
    } finally {
      setPresetsLoading(false);
    }
  };

  const fetchCommands = async () => {
    try {
      const res = await apiFetch('/api/admin/map-rotation?action=commands');
      const json = await res.json();
      if (json.success && json.data) {
        setRecentCommands(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching commands:', err);
    }
  };

  // --- Action functions ---

  const handleRotate = async (force: boolean) => {
    setRotating(true);
    setShowForceConfirm(false);
    try {
      let postBody: any;

      const zn = zoneName.trim() || undefined;

      if (force) {
        if (quickRotateTab === 'swap-cfg') {
          if (!selectedCfg) { toast.error('Please select a cfg file'); setRotating(false); return; }
          postBody = { action: 'force-rotate', cfg: selectedCfg, zone_name: zn };
        } else {
          if (!selectedLvl || !selectedLio) { toast.error('Please select both LVL and LIO files'); setRotating(false); return; }
          postBody = { action: 'force-rotate', lvl: selectedLvl, lio: selectedLio, cfg: targetCfgForCustom || undefined, zone_name: zn };
        }
      } else {
        if (quickRotateTab === 'swap-cfg') {
          if (!selectedCfg) { toast.error('Please select a cfg file'); setRotating(false); return; }
          postBody = { action: 'swap-cfg', cfg: selectedCfg, zone_name: zn };
        } else {
          if (!selectedLvl || !selectedLio) { toast.error('Please select both LVL and LIO files'); setRotating(false); return; }
          postBody = { action: 'swap-lvl', lvl: selectedLvl, lio: selectedLio, cfg: targetCfgForCustom || undefined, zone_name: zn };
        }
      }

      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify(postBody),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rotation failed');

      toast.success(data.message || 'Rotation command queued! The daemon will execute it shortly.');

      // Poll for command completion
      setTimeout(() => { fetchCommands(); fetchStatus(); fetchHistory(); }, 3000);
      setTimeout(() => { fetchCommands(); fetchStatus(); fetchHistory(); }, 8000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to rotate map');
    } finally {
      setRotating(false);
    }
  };

  const handleAddPoolEntry = async () => {
    if (!newPoolCfg || !newPoolName) {
      toast.error('Please fill in cfg file and display name');
      return;
    }

    try {
      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify({ action: 'add-to-pool', cfg: newPoolCfg, display_name: newPoolName, enabled: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add entry');

      toast.success('Added to rotation pool');
      setNewPoolCfg('');
      setNewPoolName('');
      fetchPool();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add pool entry');
    }
  };

  const handleRemovePoolEntry = async (id: string) => {
    try {
      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove-from-pool', id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove entry');

      setPool((prev) => prev.filter((e) => e.id !== id));
      toast.success('Removed from pool');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove pool entry');
    }
  };

  const handleSavePreset = async () => {
    if (!newPresetName || !newPresetLvl || !newPresetLio) {
      toast.error('Please fill in name, LVL, and LIO for the preset');
      return;
    }
    try {
      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save-preset',
          display_name: newPresetName,
          lvl_file: newPresetLvl,
          lio_file: newPresetLio,
          cfg_file: newPresetCfg || undefined,
          zone_name: newPresetZoneName || newPresetName,
          preview_image_url: newPresetImageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save preset');
      toast.success('Map preset saved');
      setNewPresetName('');
      setNewPresetLvl('');
      setNewPresetLio('');
      setNewPresetCfg('');
      setNewPresetZoneName('');
      setNewPresetImageUrl('');
      fetchPresets();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete-preset', id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPresets(prev => prev.filter(p => p.id !== id));
      toast.success('Preset deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLoadPreset = (preset: any) => {
    setQuickRotateTab('custom-lvl-lio');
    setSelectedLvl(preset.lvl_file);
    setSelectedLio(preset.lio_file);
    setTargetCfgForCustom(preset.cfg_file || '');
    setZoneName(preset.zone_name || preset.display_name);
    toast.success(`Loaded preset: ${preset.display_name}`);
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const res = await apiFetch('/api/admin/map-rotation', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update-schedule',
          rotation_window_start: scheduleWindowStart,
          rotation_window_end: scheduleWindowEnd,
          player_threshold: scheduleThreshold,
          enabled: scheduleEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save schedule');

      toast.success('Schedule settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save schedule settings');
    } finally {
      setScheduleSaving(false);
    }
  };

  // --- Loading screen ---
  if (authLoading || pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!hasAdminAccess) return null;

  const selectedCfgInfo = cfgFiles.find((c) => c.cfg === selectedCfg);
  const pendingCommands = recentCommands.filter(c => c.status === 'pending' || c.status === 'in_progress');

  const formatTimestamp = (ts: string) => {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      running: 'bg-green-500/20 text-green-400 border-green-500/30',
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      expired: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    const dotColors: Record<string, string> = {
      running: 'bg-green-400', success: 'bg-green-400', completed: 'bg-green-400',
      stopped: 'bg-red-400', failed: 'bg-red-400', expired: 'bg-red-400',
      pending: 'bg-yellow-400', in_progress: 'bg-blue-400',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColors[status] || 'bg-yellow-400'}`} />
        {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />

      <main className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Map Rotation Manager</h1>
            <p className="text-gray-400 text-sm mt-1">Infantry Zone Map Management (USL Linux Server)</p>
          </div>
          <button
            onClick={fetchAll}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
          >
            Refresh All
          </button>
        </div>

        {/* Pending Commands Banner */}
        {pendingCommands.length > 0 && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-blue-300 text-sm font-medium mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
              {pendingCommands.length} command(s) pending execution
            </div>
            {pendingCommands.map(cmd => (
              <div key={cmd.id} className="text-xs text-blue-200/70">
                {cmd.command} {JSON.stringify(cmd.args)} - requested by {cmd.requested_by_alias}
              </div>
            ))}
          </div>
        )}

        {/* ===== Section 1: Current Status ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 mb-6">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Current Status</h2>

          {statusLoading && !zoneStatus ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 bg-gray-700 rounded w-1/3"></div>
              <div className="h-5 bg-gray-700 rounded w-1/2"></div>
            </div>
          ) : zoneStatus ? (
            <>
              {zoneStatus.stale && (
                <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-xs">
                  Status data is stale ({zoneStatus.age_seconds}s old). Check if the rotation daemon is running.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Zone Status</div>
                  <StatusBadge status={zoneStatus.running ? 'running' : 'stopped'} />
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Zone Name</div>
                  <div className="text-white font-medium">{zoneStatus.zoneName || 'N/A'}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active CFG</div>
                  <div className="text-white font-medium font-mono text-sm">{zoneStatus.cfg || 'N/A'}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current LVL</div>
                  <div className="text-white font-medium font-mono text-sm">{zoneStatus.lvl || 'N/A'}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current LIO</div>
                  <div className="text-white font-medium font-mono text-sm">{zoneStatus.lio || 'N/A'}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Player Count</div>
                  <div className={`font-medium ${playerCount !== null && playerCount >= 16 ? 'text-yellow-400' : 'text-white'}`}>
                    {playerCount !== null ? playerCount : 'N/A'}
                    {playerCount !== null && playerCount >= 16 && (
                      <span className="text-yellow-400 text-xs ml-2">(game in progress)</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm">No status data available. Make sure the rotation daemon is running on the Linux server.</p>
          )}
        </section>

        {/* ===== Section 2: Quick Rotate ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 mb-6">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Quick Rotate</h2>

          {playerCount !== null && playerCount >= 16 && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
              Warning: {playerCount} players online. Standard rotation will be blocked. Use Force Rotate to override.
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-4">
            <button
              onClick={() => setQuickRotateTab('swap-cfg')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                quickRotateTab === 'swap-cfg' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Swap Config File
            </button>
            <button
              onClick={() => setQuickRotateTab('custom-lvl-lio')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                quickRotateTab === 'custom-lvl-lio' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Custom LVL/LIO
            </button>
          </div>

          {/* Tab A: Swap Config */}
          {quickRotateTab === 'swap-cfg' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Zone Name <span className="text-gray-600">(optional, updates display name)</span></label>
                <input type="text" value={zoneName} onChange={(e) => setZoneName(e.target.value)}
                  placeholder={zoneStatus?.zoneName || 'Leave blank to keep current'}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 placeholder-gray-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Select CFG File</label>
                <select
                  value={selectedCfg}
                  onChange={(e) => setSelectedCfg(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Choose a config file --</option>
                  {cfgFiles.map((c) => (
                    <option key={c.cfg} value={c.cfg}>
                      {c.cfg} {c.lvl ? `(${c.lvl})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedCfgInfo && (
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700 text-sm">
                  <div className="text-gray-400"><span className="text-gray-500">LVL:</span> <span className="text-white font-mono">{selectedCfgInfo.lvl || 'N/A'}</span></div>
                  <div className="text-gray-400 mt-1"><span className="text-gray-500">LIO:</span> <span className="text-white font-mono">{selectedCfgInfo.lio || 'N/A'}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Tab B: Custom LVL/LIO */}
          {quickRotateTab === 'custom-lvl-lio' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Zone Name <span className="text-gray-600">(displayed in game)</span></label>
                <input type="text" value={zoneName} onChange={(e) => setZoneName(e.target.value)}
                  placeholder={zoneStatus?.zoneName || 'e.g. USL - Dragon\'s Lair'}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 placeholder-gray-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Select LVL File</label>
                <select value={selectedLvl} onChange={(e) => handleLvlSelect(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                  <option value="">-- Choose a LVL file --</option>
                  {lvlFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Select LIO File
                  {selectedLvl && !selectedLio && <span className="text-yellow-400 ml-2 text-xs">(no matching .lio found)</span>}
                  {selectedLvl && selectedLio && <span className="text-green-400 ml-2 text-xs">(auto-matched)</span>}
                </label>
                <select value={selectedLio} onChange={(e) => setSelectedLio(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                  <option value="">-- Choose a LIO file --</option>
                  {lioFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Target CFG <span className="text-gray-600">(optional)</span></label>
                <select value={targetCfgForCustom} onChange={(e) => setTargetCfgForCustom(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                  <option value="">-- Use current CFG --</option>
                  {cfgFiles.map((c) => <option key={c.cfg} value={c.cfg}>{c.cfg}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Rotate buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => handleRotate(false)}
              disabled={rotating}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            >
              {rotating ? 'Queuing...' : 'Rotate Now'}
            </button>
            <button
              onClick={() => setShowForceConfirm(true)}
              disabled={rotating}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            >
              Force Rotate (Skip Checks)
            </button>
          </div>

          <p className="text-gray-500 text-xs mt-3">
            Commands are queued and executed by the daemon on the Linux server (typically within 5 seconds).
          </p>
        </section>

        {/* Force Rotate Confirmation */}
        {showForceConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 border border-red-500/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-red-400 mb-3">Confirm Force Rotate</h3>
              <p className="text-gray-300 text-sm mb-2">This bypasses player count and time window checks.</p>
              {playerCount !== null && playerCount >= 16 && (
                <p className="text-yellow-400 text-sm mb-4">Currently {playerCount} players online!</p>
              )}
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowForceConfirm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">Cancel</button>
                <button onClick={() => handleRotate(true)} disabled={rotating}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                  {rotating ? 'Queuing...' : 'Force Rotate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Section 3: Map Presets ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-6 mb-6">
          <h2 className="text-xl font-semibold text-purple-400 mb-2">Map Presets</h2>
          <p className="text-gray-400 text-xs mb-4">Saved LVL/LIO/Zone Name pairings. Click "Load" to populate the Quick Rotate form. These will be used for public voting later.</p>

          {presetsLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-gray-700 rounded w-full"></div>
            </div>
          ) : (
            <>
              {presets.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Preview</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Name</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Zone Name</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">CFG</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">LVL</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">LIO</th>
                        <th className="text-center py-2 px-3 text-gray-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presets.map((p) => (
                        <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                          <td className="py-2 px-3">
                            {p.preview_image_url ? (
                              <img src={p.preview_image_url} alt={p.display_name} className="w-12 h-12 rounded object-cover border border-gray-600" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-700 border border-gray-600 flex items-center justify-center text-gray-500 text-xs">N/A</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-white font-medium">{p.display_name}</td>
                          <td className="py-2 px-3 text-gray-300 text-xs">{p.zone_name}</td>
                          <td className="py-2 px-3 text-gray-300 font-mono text-xs">{p.cfg_file || '-'}</td>
                          <td className="py-2 px-3 text-gray-300 font-mono text-xs">{p.lvl_file}</td>
                          <td className="py-2 px-3 text-gray-300 font-mono text-xs">{p.lio_file}</td>
                          <td className="py-2 px-3 text-center space-x-2">
                            <button onClick={() => handleLoadPreset(p)}
                              className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">Load</button>
                            <button onClick={() => handleDeletePreset(p.id)}
                              className="text-red-400 hover:text-red-300 text-xs font-medium">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-3 border-t border-gray-700">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Save New Preset</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Preset Name</label>
                    <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g. Dragon's Lair CTF"
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Zone Name (in-game)</label>
                    <input type="text" value={newPresetZoneName} onChange={(e) => setNewPresetZoneName(e.target.value)}
                      placeholder="Defaults to preset name"
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CFG File</label>
                    <select value={newPresetCfg} onChange={(e) => setNewPresetCfg(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                      <option value="">-- Select CFG --</option>
                      {cfgFiles.map((c) => <option key={c.cfg} value={c.cfg}>{c.cfg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">LVL File</label>
                    <select value={newPresetLvl} onChange={(e) => handlePresetLvlSelect(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                      <option value="">-- Select LVL --</option>
                      {lvlFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      LIO File
                      {newPresetLvl && newPresetLio && <span className="text-green-400 ml-1">(auto)</span>}
                    </label>
                    <select value={newPresetLio} onChange={(e) => setNewPresetLio(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                      <option value="">-- Select LIO --</option>
                      {lioFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs text-gray-500 mb-1">Preview Image URL <span className="text-gray-600">(for map voting)</span></label>
                    <input type="text" value={newPresetImageUrl} onChange={(e) => setNewPresetImageUrl(e.target.value)}
                      placeholder="https://example.com/maps/preview.jpg"
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleSavePreset}
                      className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">
                      Save Preset
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ===== Section 4: Rotation Pool ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 mb-6">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Rotation Pool</h2>

          {poolLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-gray-700 rounded w-full"></div>
              <div className="h-8 bg-gray-700 rounded w-full"></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">Display Name</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">CFG File</th>
                      <th className="text-center py-2 px-3 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-6 text-gray-500">No maps in the pool yet.</td></tr>
                    ) : (
                      pool.map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                          <td className="py-2 px-3 text-white">{entry.display_name}</td>
                          <td className="py-2 px-3 text-gray-300 font-mono text-xs">{entry.cfg_file}</td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => handleRemovePoolEntry(entry.id)}
                              className="text-red-400 hover:text-red-300 text-xs font-medium">Remove</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Add to Pool</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select value={newPoolCfg} onChange={(e) => setNewPoolCfg(e.target.value)}
                    className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                    <option value="">-- Select CFG --</option>
                    {cfgFiles.map((c) => <option key={c.cfg} value={c.cfg}>{c.cfg}</option>)}
                  </select>
                  <input type="text" value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)}
                    placeholder="Display name" className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 placeholder-gray-500" />
                  <button onClick={handleAddPoolEntry}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">Add</button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ===== Section 4: Schedule Settings ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 mb-6">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Schedule Settings</h2>
          <p className="text-gray-400 text-sm mb-4">
            Standard rotations will only execute during the time window AND when player count is below threshold.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Window Start (UTC)</label>
              <input type="time" value={scheduleWindowStart} onChange={(e) => setScheduleWindowStart(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Window End (UTC)</label>
              <input type="time" value={scheduleWindowEnd} onChange={(e) => setScheduleWindowEnd(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Player Threshold</label>
              <input type="number" min={0} value={scheduleThreshold} onChange={(e) => setScheduleThreshold(parseInt(e.target.value) || 0)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer pb-2">
                <button onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scheduleEnabled ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scheduleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                {scheduleEnabled ? 'Enabled' : 'Disabled'}
              </label>
            </div>
          </div>

          <button onClick={handleSaveSchedule} disabled={scheduleSaving}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            {scheduleSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </section>

        {/* ===== Section 5: Recent Commands ===== */}
        {recentCommands.length > 0 && (
          <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 mb-6">
            <h2 className="text-xl font-semibold text-cyan-400 mb-4">Recent Commands</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Time</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Command</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Args</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">By</th>
                    <th className="text-center py-2 px-3 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCommands.slice(0, 10).map((cmd) => (
                    <tr key={cmd.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                      <td className="py-2 px-3 text-gray-300 text-xs">{formatTimestamp(cmd.created_at)}</td>
                      <td className="py-2 px-3 text-white font-mono text-xs">{cmd.command}</td>
                      <td className="py-2 px-3 text-gray-300 font-mono text-xs">{JSON.stringify(cmd.args)}</td>
                      <td className="py-2 px-3 text-gray-300 text-xs">{cmd.requested_by_alias}</td>
                      <td className="py-2 px-3 text-center"><StatusBadge status={cmd.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===== Section 6: Rotation History ===== */}
        <section className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Rotation History</h2>

          {historyLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-gray-700 rounded w-full"></div>
              <div className="h-8 bg-gray-700 rounded w-full"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Date/Time</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Previous</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">New</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">By</th>
                    <th className="text-center py-2 px-3 text-gray-400 font-medium">Forced</th>
                    <th className="text-center py-2 px-3 text-gray-400 font-medium">Players</th>
                    <th className="text-center py-2 px-3 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-500">No rotation history.</td></tr>
                  ) : (
                    history.slice(0, 20).map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                        <td className="py-2 px-3 text-gray-300 text-xs">{formatTimestamp(entry.created_at)}</td>
                        <td className="py-2 px-3 text-gray-300 font-mono text-xs">{entry.previous_cfg || entry.previous_lvl || '-'}</td>
                        <td className="py-2 px-3 text-white font-mono text-xs">{entry.new_cfg || entry.new_lvl || '-'}</td>
                        <td className="py-2 px-3 text-gray-300 text-xs">{entry.triggered_by_alias || '-'}</td>
                        <td className="py-2 px-3 text-center">
                          {entry.force_rotated ? <span className="text-yellow-400 text-xs">Yes</span> : <span className="text-gray-500 text-xs">No</span>}
                        </td>
                        <td className="py-2 px-3 text-center text-gray-300 text-xs">{entry.player_count_at_rotation ?? '-'}</td>
                        <td className="py-2 px-3 text-center"><StatusBadge status={entry.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
