'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

        <main className="max-w-[1400px] mx-auto px-4 py-8">
          {/* Hero Header */}
          <div className="text-center mb-10 animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(34,211,238,0.6)' }} />
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-[0.15em]">Map Rotation Vote</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-3">
              Choose the Next Map
            </h1>
            <p className="text-gray-400 text-sm md:text-base max-w-2xl mx-auto">
              Vote for the next map rotation. The winning map will be loaded at the next scheduled rotation window.
            </p>
          </div>

          {/* Current Map Status */}
          {currentMap && (
            <div className="flex items-center justify-center gap-4 mb-8 animate-slideUp">
              <div className="bg-gray-900/60 backdrop-blur-sm rounded-lg border border-gray-700/50 px-5 py-3 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentMap.running ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Now Playing</span>
                </div>
                <div className="w-px h-5 bg-gray-700" />
                <span className="text-white font-semibold">{currentMap.zone_name || currentMap.cfg || 'Unknown'}</span>
              </div>
            </div>
          )}

          {/* USL Zone Section */}
          <section className="mb-12">
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 via-blue-400 to-purple-500 rounded-full" />
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">USL Matches</h2>
                <p className="text-gray-500 text-xs mt-0.5">usl_matches2.cfg rotation maps</p>
              </div>
              {voteSession && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-500">{totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast</span>
                  {voteSession.ends_at && (
                    <>
                      <div className="w-px h-4 bg-gray-700" />
                      <span className="text-xs text-amber-400 font-mono">
                        Ends {new Date(voteSession.ends_at).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Vote Status Banner */}
            {!voteSession && !loading && (
              <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-700/50 p-8 text-center mb-6">
                <div className="text-gray-500 text-lg mb-2">No Active Vote</div>
                <p className="text-gray-600 text-sm">Check back later when an admin opens a voting session for the next map rotation.</p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-gray-900/60 rounded-xl border border-gray-700/30 overflow-hidden animate-pulse">
                    <div className="h-44 bg-gray-800/50" />
                    <div className="p-4 space-y-3">
                      <div className="h-5 bg-gray-800/50 rounded w-3/4" />
                      <div className="h-3 bg-gray-800/50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Map Cards Grid */}
            {!loading && presets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {presets.map((preset, index) => {
                  const isMyVote = myVote === preset.id;
                  const isLeading = leadingPresetId === preset.id && totalVotes > 0;
                  const votes = voteCounts[preset.id] || 0;
                  const percentage = getVotePercentage(preset.id);
                  const isHovered = hoveredCard === preset.id;

                  return (
                    <div
                      key={preset.id}
                      className="group relative"
                      style={{
                        animation: `cardEntrance 0.5s ease-out ${index * 0.07}s both`,
                      }}
                      onMouseEnter={() => setHoveredCard(preset.id)}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <div
                        className={`
                          relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer
                          ${isMyVote
                            ? 'border-cyan-400/60 bg-gray-900/80'
                            : isLeading
                              ? 'border-amber-400/40 bg-gray-900/70'
                              : 'border-gray-700/40 bg-gray-900/60 hover:border-cyan-500/40'
                          }
                        `}
                        style={{
                          animation: isMyVote ? 'selectedPulse 3s ease-in-out infinite' : isLeading ? 'leadingGlow 3s ease-in-out infinite' : undefined,
                          backdropFilter: 'blur(8px)',
                        }}
                        onClick={() => voteSession && handleVote(preset.id)}
                      >
                        {/* Top accent bar */}
                        <div className={`h-1 ${isMyVote ? 'bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400' : isLeading ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400' : 'bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 group-hover:from-cyan-500/50 group-hover:via-blue-500/50 group-hover:to-cyan-500/50'}`} style={{ transition: 'all 0.3s' }} />

                        {/* Image Container */}
                        <div className="relative h-44 overflow-hidden bg-gray-800/50">
                          {preset.preview_image_url ? (
                            <img
                              src={preset.preview_image_url}
                              alt={preset.display_name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                              <div className="text-gray-600 text-center">
                                <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <span className="text-xs">No Preview</span>
                              </div>
                            </div>
                          )}

                          {/* Overlay gradient */}
                          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent" />

                          {/* Leading badge */}
                          {isLeading && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-500/90 rounded-full text-[10px] font-bold text-black uppercase tracking-wider flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              Leading
                            </div>
                          )}

                          {/* Your vote checkmark */}
                          {isMyVote && (
                            <div className="absolute top-2 left-2 w-7 h-7 bg-cyan-500/90 rounded-full flex items-center justify-center" style={{ boxShadow: '0 0 12px rgba(34,211,238,0.5)' }}>
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}

                          {/* Hover vote overlay */}
                          {voteSession && !isMyVote && (
                            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                              <div className="px-5 py-2.5 bg-cyan-500/90 rounded-lg text-white font-bold text-sm backdrop-blur-sm" style={{ boxShadow: '0 0 20px rgba(34,211,238,0.4)' }}>
                                {voting ? 'Voting...' : 'Vote for this map'}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Info */}
                        <div className="p-4">
                          <h3 className="text-white font-bold text-base mb-1 truncate group-hover:text-cyan-300 transition-colors">
                            {cleanMapName(preset.display_name)}
                          </h3>
                          <p className="text-gray-500 text-xs font-mono truncate mb-3">
                            {preset.lvl_file}
                          </p>

                          {/* Vote Bar */}
                          {voteSession && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`text-xs font-semibold ${isMyVote ? 'text-cyan-400' : isLeading ? 'text-amber-400' : 'text-gray-500'}`}>
                                  {votes} vote{votes !== 1 ? 's' : ''}
                                </span>
                                <span className={`text-xs font-bold ${isMyVote ? 'text-cyan-400' : isLeading ? 'text-amber-400' : 'text-gray-500'}`}>
                                  {percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ease-out ${isMyVote ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : isLeading ? 'bg-gradient-to-r from-amber-500 to-yellow-500' : 'bg-gradient-to-r from-gray-600 to-gray-500'}`}
                                  style={{
                                    width: `${percentage}%`,
                                    animation: 'voteBarFill 0.8s ease-out',
                                    boxShadow: isMyVote ? '0 0 8px rgba(34,211,238,0.4)' : isLeading ? '0 0 8px rgba(250,204,21,0.4)' : undefined,
                                  }}
                                />
                              </div>
                            </div>
                          )}
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

          {/* Info Footer */}
          <div className="text-center text-gray-600 text-xs pb-8">
            {!user && (
              <p className="mb-2">
                <a href="/auth/login" className="text-cyan-500 hover:text-cyan-400 transition-colors">Log in</a> to cast your vote
              </p>
            )}
            {myVote && <p className="text-gray-500">You can change your vote at any time during the voting period.</p>}
          </div>
        </main>
      </div>
    </div>
  );
}
