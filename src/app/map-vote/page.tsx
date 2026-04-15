'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import NeutralNavbar from '@/components/home/NeutralNavbar';

interface MapPreset {
  id: string;
  display_name: string;
  zone_name: string;
  cfg_file: string;
  lvl_file: string;
  lio_file: string;
  preview_image_url: string | null;
}

interface VoteSession {
  id: string;
  zone_key: string;
  title: string;
  description: string;
  status: string;
  ends_at: string | null;
  created_at: string;
}

// Star color palette
const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#cce0ff', '#ffe8d6', '#b4dcff', '#dcc8ff', '#c8ffff'];

const generateStars = (count: number, type: 'dust' | 'medium' | 'bright' | 'feature') => {
  return Array.from({ length: count }, (_, i) => {
    const color = type === 'dust' ? '#ffffff' : STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    let size: number, opacity: number;
    switch (type) {
      case 'dust': size = Math.random() * 1 + 0.3; opacity = Math.random() * 0.25 + 0.05; break;
      case 'medium': size = Math.random() * 1.5 + 0.5; opacity = Math.random() * 0.4 + 0.15; break;
      case 'bright': size = Math.random() * 2 + 1; opacity = Math.random() * 0.5 + 0.3; break;
      case 'feature': size = Math.random() * 2.5 + 2; opacity = Math.random() * 0.4 + 0.5; break;
    }
    return {
      id: `vote-${type}-${i}`, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
      size, opacity, color,
      animationDuration: `${Math.random() * 5 + 3}s`, animationDelay: `${Math.random() * 5}s`,
    };
  });
};

const generateWarpStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 800;
    return {
      id: `warp-${i}`,
      originX: (Math.random() - 0.5) * 80, originY: (Math.random() - 0.5) * 80,
      dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance,
      size: Math.random() * 1.5 + 0.5, duration: Math.random() * 6 + 4,
      delay: Math.random() * 10, color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
};

// ─── Map Inspector Modal ───
function MapInspector({ preset, onClose }: { preset: MapPreset; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 6;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    setScale(s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const zoomIn = () => setScale(s => Math.min(MAX_SCALE, s * 1.4));
  const zoomOut = () => setScale(s => Math.max(MIN_SCALE, s / 1.4));

  const handleDownload = async () => {
    if (!preset.preview_image_url) return;
    try {
      const res = await fetch(preset.preview_image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = preset.preview_image_url.split('.').pop()?.split('?')[0] || 'png';
      a.download = `${preset.display_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download image');
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const cleanName = preset.display_name.replace(/^USL\s*-\s*/i, '').replace(/\s*\(Linux\)\s*$/i, '');

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-bold text-lg">{cleanName}</h2>
          <span className="text-gray-500 text-xs font-mono">{preset.lvl_file}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button onClick={zoomOut} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="Zoom out">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>
          </button>
          <span className="text-gray-400 text-xs font-mono min-w-[3.5rem] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="Zoom in">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
          </button>
          <button onClick={resetView} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="Reset view">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          {/* Download */}
          {preset.preview_image_url && (
            <button onClick={handleDownload} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-cyan-400 transition-colors" title="Download map image">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
          )}
          {/* Close */}
          <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-500/80 text-gray-300 hover:text-white transition-colors" title="Close (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Image viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="w-full h-full flex items-center justify-center">
          {preset.preview_image_url ? (
            <img
              src={preset.preview_image_url}
              alt={cleanName}
              draggable={false}
              className="max-w-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: dragging ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          ) : (
            <div className="text-gray-500 text-lg">No preview image available</div>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="text-center py-2 text-gray-600 text-xs bg-gray-900/50 shrink-0">
        Scroll to zoom &middot; Click &amp; drag to pan &middot; Press Esc to close
      </div>
    </div>
  );
}

export default function MapVotePage() {
  const { user } = useAuth();
  const [presets, setPresets] = useState<MapPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [voteSession, setVoteSession] = useState<VoteSession | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [currentMap, setCurrentMap] = useState<any>(null);
  const [inspecting, setInspecting] = useState<MapPreset | null>(null);

  const pageStars = useMemo(() => ({
    dust: generateStars(120, 'dust'),
    medium: generateStars(60, 'medium'),
    bright: generateStars(30, 'bright'),
    feature: generateStars(6, 'feature'),
    warp: generateWarpStars(50),
  }), []);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { 'Content-Type': 'application/json' };
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const fetchData = useCallback(async () => {
    try {
      const [presetsRes, voteRes, currentRes] = await Promise.all([
        fetch('/api/map-vote?action=presets'),
        fetch('/api/map-vote?action=active-vote'),
        fetch('/api/map-vote?action=current-map'),
      ]);

      const presetsJson = await presetsRes.json();
      if (presetsJson.success) setPresets(presetsJson.data || []);

      const voteJson = await voteRes.json();
      if (voteJson.success && voteJson.data) {
        setVoteSession(voteJson.data.session);
        setVoteCounts(voteJson.data.voteCounts || {});
        setTotalVotes(voteJson.data.totalVotes || 0);
      }

      const currentJson = await currentRes.json();
      if (currentJson.success) setCurrentMap(currentJson.data);
    } catch (err) {
      console.error('Failed to fetch vote data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyVote = useCallback(async () => {
    if (!user) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/map-vote?action=my-vote', { headers });
      const json = await res.json();
      if (json.success && json.data) {
        setMyVote(json.data.preset_id);
      }
    } catch (err) {
      console.error('Failed to fetch my vote:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchMyVote();
  }, [fetchMyVote]);

  // Auto-refresh votes every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/map-vote?action=active-vote');
        const json = await res.json();
        if (json.success && json.data) {
          setVoteCounts(json.data.voteCounts || {});
          setTotalVotes(json.data.totalVotes || 0);
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleVote = async (presetId: string) => {
    if (!user) {
      toast.error('You must be logged in to vote');
      return;
    }
    if (!voteSession) {
      toast.error('No active vote session');
      return;
    }
    setVoting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/map-vote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'cast-vote', preset_id: presetId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMyVote(presetId);
      toast.success('Vote cast!');
      // Refresh tallies
      const voteRes = await fetch('/api/map-vote?action=active-vote');
      const voteJson = await voteRes.json();
      if (voteJson.success && voteJson.data) {
        setVoteCounts(voteJson.data.voteCounts || {});
        setTotalVotes(voteJson.data.totalVotes || 0);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to cast vote');
    } finally {
      setVoting(false);
    }
  };

  const getVotePercentage = (presetId: string) => {
    if (totalVotes === 0) return 0;
    return Math.round(((voteCounts[presetId] || 0) / totalVotes) * 100);
  };

  const getLeadingPreset = () => {
    let maxVotes = 0;
    let leaderId = '';
    Object.entries(voteCounts).forEach(([id, count]) => {
      if (count > maxVotes) { maxVotes = count; leaderId = id; }
    });
    return leaderId;
  };

  const leadingPresetId = getLeadingPreset();

  // Clean display name (strip "USL - " prefix and " (Linux)" suffix for cleaner cards)
  const cleanMapName = (name: string) => {
    return name.replace(/^USL\s*-\s*/i, '').replace(/\s*\(Linux\)\s*$/i, '');
  };

  return (
    <div className="min-h-screen relative">
      {/* ─── Space Background ─── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)',
        }} />
        <div className="absolute inset-0 nebula-drift-1" style={{
          background: 'radial-gradient(ellipse at 25% 15%, rgba(34, 211, 238, 0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(34, 211, 238, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-2" style={{
          background: 'radial-gradient(ellipse at 75% 25%, rgba(139, 92, 246, 0.06) 0%, transparent 45%), radial-gradient(ellipse at 15% 75%, rgba(139, 92, 246, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-3" style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(236, 72, 153, 0.04) 0%, transparent 35%), radial-gradient(ellipse at 30% 60%, rgba(59, 130, 246, 0.05) 0%, transparent 45%)',
        }} />
        {pageStars.dust.map((star) => (
          <div key={star.id} className="absolute rounded-full" style={{
            left: star.left, top: star.top, width: star.size, height: star.size,
            backgroundColor: star.color, opacity: star.opacity,
          }} />
        ))}
        {pageStars.medium.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top, width: star.size, height: star.size,
            backgroundColor: star.color, opacity: star.opacity,
            animationDuration: star.animationDuration, animationDelay: star.animationDelay,
          }} />
        ))}
        {pageStars.bright.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top, width: star.size, height: star.size,
            backgroundColor: star.color, opacity: star.opacity,
            boxShadow: `0 0 ${star.size * 3}px ${star.color}50, 0 0 ${star.size * 6}px ${star.color}25`,
            animationDuration: star.animationDuration, animationDelay: star.animationDelay,
          }} />
        ))}
        {pageStars.feature.map((star) => (
          <div key={star.id} className="absolute" style={{ left: star.left, top: star.top }}>
            <div className="absolute rounded-full animate-pulse" style={{
              width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 4}px ${star.color}60, 0 0 ${star.size * 10}px ${star.color}30`,
              animationDuration: star.animationDuration, animationDelay: star.animationDelay,
            }} />
          </div>
        ))}
        {pageStars.warp.map((star) => (
          <div key={star.id} className="absolute rounded-full" style={{
            left: `calc(50% + ${star.originX}px)`, top: `calc(50% + ${star.originY}px)`,
            width: star.size, height: star.size, backgroundColor: star.color,
            ['--warp-x' as string]: `${star.dx}px`, ['--warp-y' as string]: `${star.dy}px`,
            animation: `warpTravel ${star.duration}s linear infinite ${star.delay}s`,
          }} />
        ))}
        <div className="absolute inset-0 overflow-hidden">
          <div className="shooting-star-1" />
          <div className="shooting-star-2" />
        </div>
      </div>

      {/* Space CSS animations */}
      <style jsx>{`
        .nebula-drift-1 { animation: nebulaDrift1 30s ease-in-out infinite; }
        .nebula-drift-2 { animation: nebulaDrift2 25s ease-in-out infinite; }
        .nebula-drift-3 { animation: nebulaDrift3 35s ease-in-out infinite; }
        @keyframes nebulaDrift1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -20px) scale(1.1); } }
        @keyframes nebulaDrift2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-25px, 15px) scale(1.05); } }
        @keyframes nebulaDrift3 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, 25px); } }
        .shooting-star-1, .shooting-star-2 { position: absolute; height: 1px; border-radius: 999px; opacity: 0; }
        .shooting-star-1 {
          top: 15%; left: -100px; width: 80px;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(255,255,255,0.3);
          animation: shootStar1 8s ease-in-out infinite 2s;
        }
        .shooting-star-2 {
          top: 40%; left: -80px; width: 60px;
          background: linear-gradient(90deg, rgba(100,200,255,0) 0%, rgba(100,200,255,0.7) 50%, rgba(100,200,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(100,200,255,0.3);
          animation: shootStar2 12s ease-in-out infinite 6s;
        }
        @keyframes shootStar1 {
          0% { transform: translateX(0) translateY(0) rotate(-25deg); opacity: 0; }
          3% { opacity: 1; } 12% { opacity: 0.8; }
          15% { transform: translateX(calc(100vw + 300px)) translateY(120px) rotate(-25deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes shootStar2 {
          0% { transform: translateX(0) translateY(0) rotate(-15deg); opacity: 0; }
          2% { opacity: 1; } 8% { opacity: 0.8; }
          10% { transform: translateX(calc(100vw + 200px)) translateY(60px) rotate(-15deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes warpTravel {
          0% { transform: translate(0, 0) scale(0.1); opacity: 0; }
          5% { opacity: 0.3; } 40% { opacity: 0.7; } 80% { opacity: 0.9; }
          100% { transform: translate(var(--warp-x), var(--warp-y)) scale(2.5); opacity: 0; }
        }
        @keyframes voteBarFill {
          from { width: 0%; }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 15px rgba(34, 211, 238, 0.3), 0 0 30px rgba(34, 211, 238, 0.1); }
          50% { box-shadow: 0 0 25px rgba(34, 211, 238, 0.5), 0 0 50px rgba(34, 211, 238, 0.2); }
        }
        @keyframes selectedPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.15), inset 0 0 20px rgba(34, 211, 238, 0.05); }
          50% { box-shadow: 0 0 30px rgba(34, 211, 238, 0.6), 0 0 60px rgba(34, 211, 238, 0.25), inset 0 0 30px rgba(34, 211, 238, 0.08); }
        }
        @keyframes leadingGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(250, 204, 21, 0.4), 0 0 40px rgba(250, 204, 21, 0.15); }
          50% { box-shadow: 0 0 35px rgba(250, 204, 21, 0.6), 0 0 60px rgba(250, 204, 21, 0.25); }
        }
      `}</style>

      {/* ─── Content ─── */}
      <div className="relative z-10">
        <NeutralNavbar />

        <main className="max-w-[1400px] mx-auto px-4 pt-4 pb-8">
          {/* Compact Header */}
          <div className="flex items-center justify-between mb-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-full" />
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide">USL Map Vote</h1>
              {currentMap && (
                <>
                  <div className="w-px h-5 bg-gray-700 hidden sm:block" />
                  <div className="hidden sm:flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${currentMap.running ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                    <span className="text-gray-400 text-xs">Now: <span className="text-gray-300">{currentMap.zone_name || currentMap.cfg || 'Unknown'}</span></span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {voteSession && (
                <span className="text-xs text-gray-500">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
              )}
              {!voteSession && !loading && (
                <span className="text-xs text-gray-500 bg-gray-800/50 px-2.5 py-1 rounded-full border border-gray-700/50">No active vote</span>
              )}
              {!user && (
                <a href="/auth/login" className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors">Log in to vote</a>
              )}
            </div>
          </div>

          {/* USL Zone Section */}
          <section className="mb-12">

            {/* Loading */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] bg-gray-900/60 rounded-lg border border-gray-700/30 animate-pulse" />
                ))}
              </div>
            )}

            {/* Map Cards Grid */}
            {!loading && presets.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {presets.map((preset, index) => {
                  const isMyVote = myVote === preset.id;
                  const isLeading = leadingPresetId === preset.id && totalVotes > 0;
                  const votes = voteCounts[preset.id] || 0;
                  const percentage = getVotePercentage(preset.id);

                  return (
                    <div
                      key={preset.id}
                      className="group relative aspect-[4/3]"
                      style={{ animation: `cardEntrance 0.5s ease-out ${index * 0.06}s both` }}
                    >
                      <div
                        className={`
                          relative w-full h-full overflow-hidden rounded-lg border-2 transition-all duration-300 cursor-pointer
                          ${isMyVote
                            ? 'border-cyan-400/70'
                            : isLeading
                              ? 'border-amber-400/50'
                              : 'border-gray-700/30 hover:border-cyan-500/50'
                          }
                        `}
                        style={{
                          animation: isMyVote ? 'selectedPulse 3s ease-in-out infinite' : isLeading ? 'leadingGlow 3s ease-in-out infinite' : undefined,
                        }}
                        onClick={() => voteSession && handleVote(preset.id)}
                      >
                        {/* Full-bleed image */}
                        {preset.preview_image_url ? (
                          <img
                            src={preset.preview_image_url}
                            alt={preset.display_name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                            <span className="text-gray-600 text-sm font-medium">{cleanMapName(preset.display_name)}</span>
                          </div>
                        )}

                        {/* Persistent: map name at bottom (subtle) */}
                        <div className="absolute bottom-0 inset-x-0 px-2.5 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                          <span className="text-white text-xs font-bold drop-shadow-lg truncate block">
                            {cleanMapName(preset.display_name)}
                          </span>
                        </div>

                        {/* Persistent: vote bar at very bottom */}
                        {voteSession && percentage > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-[3px]">
                            <div
                              className={`h-full transition-all duration-700 ease-out ${isMyVote ? 'bg-cyan-400' : isLeading ? 'bg-amber-400' : 'bg-gray-400/60'}`}
                              style={{
                                width: `${percentage}%`,
                                boxShadow: isMyVote ? '0 0 6px rgba(34,211,238,0.6)' : isLeading ? '0 0 6px rgba(250,204,21,0.6)' : undefined,
                              }}
                            />
                          </div>
                        )}

                        {/* Persistent badges: top corners */}
                        {isLeading && (
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-amber-500/90 rounded text-[9px] font-bold text-black uppercase tracking-wider flex items-center gap-0.5">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            Leading
                          </div>
                        )}
                        {isMyVote && (
                          <div className="absolute top-1.5 left-1.5 w-6 h-6 bg-cyan-500/90 rounded-full flex items-center justify-center" style={{ boxShadow: '0 0 10px rgba(34,211,238,0.5)' }}>
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}

                        {/* Hover overlay: full info + vote CTA + inspect/download */}
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-3">
                          <h3 className="text-white font-bold text-sm text-center mb-1 drop-shadow-lg">
                            {cleanMapName(preset.display_name)}
                          </h3>
                          <p className="text-gray-400 text-[10px] font-mono mb-2">{preset.lvl_file}</p>

                          {voteSession && (
                            <>
                              {/* Vote counts */}
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold ${isMyVote ? 'text-cyan-400' : isLeading ? 'text-amber-400' : 'text-gray-300'}`}>
                                  {votes} vote{votes !== 1 ? 's' : ''}
                                </span>
                                {percentage > 0 && (
                                  <span className={`text-xs font-bold ${isMyVote ? 'text-cyan-400' : isLeading ? 'text-amber-400' : 'text-gray-400'}`}>
                                    ({percentage}%)
                                  </span>
                                )}
                              </div>

                              {/* Vote button */}
                              {isMyVote ? (
                                <div className="px-4 py-1.5 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-400 text-xs font-bold">
                                  Your Vote
                                </div>
                              ) : (
                                <div className="px-4 py-1.5 bg-cyan-500/90 rounded-lg text-white text-xs font-bold" style={{ boxShadow: '0 0 15px rgba(34,211,238,0.3)' }}>
                                  {voting ? 'Voting...' : 'Vote'}
                                </div>
                              )}
                            </>
                          )}

                          {/* Inspect & Download row */}
                          <div className="flex items-center gap-2 mt-2">
                            {preset.preview_image_url && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setInspecting(preset); }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-gray-700/80 hover:bg-gray-600/80 rounded text-[10px] text-gray-300 hover:text-white transition-colors"
                                title="Inspect map"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                Inspect
                              </button>
                            )}
                            {preset.preview_image_url && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(preset.preview_image_url!);
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    const ext = preset.preview_image_url!.split('.').pop()?.split('?')[0] || 'png';
                                    a.download = `${preset.display_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  } catch { toast.error('Download failed'); }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-gray-700/80 hover:bg-gray-600/80 rounded text-[10px] text-gray-300 hover:text-white transition-colors"
                                title="Download map image"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!loading && presets.length === 0 && (
              <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-700/50 p-12 text-center">
                <div className="text-gray-500 text-lg">No map presets available yet</div>
              </div>
            )}
          </section>

          {myVote && <p className="text-center text-gray-600 text-xs mt-4">You can change your vote anytime.</p>}
        </main>
      </div>

      {/* Map Inspector Modal */}
      {inspecting && (
        <MapInspector preset={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}
