'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getClassColor, getClassColorStyle } from '@/utils/classColors';

interface PlayerGameStats {
  id: number;
  game_id: string;
  player_name: string;
  squad_name: string;
  team: string;
  main_class: string;
  side: string;
  base_used: string;
  kills: number;
  deaths: number;
  flag_captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  class_swaps: number;
  turret_damage: number;
  eb_hits: number;
  resource_unused_per_death: number;
  explosive_unused_per_death: number;
  accuracy: number;
  game_date: string;
  game_mode: string;
  map_name: string;
  server_name: string;
  duration_seconds: number;
  total_players: number;
}

interface VideoInfo {
  matchId: string;
  matchTitle: string;
  youtube_url?: string;
  vod_url?: string;
  highlight_url?: string;
  video_title?: string;
  video_description?: string;
  video_thumbnail_url?: string;
  has_video: boolean;
}

interface GameData {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  serverName: string;
  duration: number;
  totalPlayers: number;
  players: PlayerGameStats[];
  linkedMatchId?: string;
  linkedMatchTitle?: string;
  videoInfo?: VideoInfo;
  winningInfo?: {
    type: string;
    side: string;
    winner: string;
  };
}

export default function GameStatsPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVideoExpanded, setIsVideoExpanded] = useState(true);
  const [showVideoEmbed, setShowVideoEmbed] = useState(false);

  useEffect(() => {
    if (gameId) {
      fetchGameData();
    }
  }, [gameId]);

  const fetchGameData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/player-stats/game/${gameId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setGameData(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch game data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Helper function to get YouTube video ID from URL
  const getYouTubeVideoId = (url: string) => {
    if (!url) return null;
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,           // youtube.com/watch?v=
      /(?:youtube\.com\/embed\/)([^&\n?#]+)/,             // youtube.com/embed/
      /(?:youtube\.com\/v\/)([^&\n?#]+)/,                 // youtube.com/v/
      /(?:youtu\.be\/)([^&\n?#]+)/,                       // youtu.be/
      /(?:youtube\.com\/\S*[?&]v=)([^&\n?#]+)/           // any youtube.com with v= parameter
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  };

  // Helper function to get YouTube thumbnail URL
  const getYouTubeThumbnail = (url: string, quality = 'hqdefault') => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
  };

  // Class ordering functions
  const getDefenseClassOrder = (className: string): number => {
    const order = {
      'Field Medic': 1,
      'Combat Engineer': 2,
      'Heavy Weapons': 3,
      'Infantry': 4
    };
    return order[className as keyof typeof order] || 5;
  };

  const getOffenseClassOrder = (className: string): number => {
    const order = {
      'Squad Leader': 1,
      'Jump Trooper': 2,
      'Infiltrator': 3,
      'Heavy Weapons': 4,
      'Infantry': 5
    };
    return order[className as keyof typeof order] || 6;
  };

  // Team color function
  const getTeamColor = (teamName: string): string => {
    if (teamName.includes('C')) return '#ef4444'; // red for Collective
    if (teamName.includes('T')) return '#22c55e'; // green for Titan
    return '#9ca3af'; // default gray
  };

  // Win/Loss determination function
  const getPlayerWinStatus = (player: PlayerGameStats): 'win' | 'loss' | 'unknown' => {
    if (!gameData?.winningInfo) return 'unknown';
    
    const { type, side, winner } = gameData.winningInfo;
    
    if (type === 'side') {
      // Win/loss based on offensive/defensive side
      return player.side === side ? 'win' : 'loss';
    } else if (type === 'team') {
      // Win/loss based on team
      return player.team === winner ? 'win' : 'loss';
    }
    
    return 'unknown';
  };

  // Get background class for win/loss
  const getWinLossBackground = (player: PlayerGameStats): string => {
    const status = getPlayerWinStatus(player);
    switch (status) {
      case 'win':
        return 'bg-green-500/10 border-green-500/20';
      case 'loss':
        return 'bg-red-500/10 border-red-500/20';
      default:
        return 'bg-transparent';
    }
  };

  // Group and sort players
  const getGroupedPlayers = () => {
    if (!gameData?.players) return {};
    
    // Group by team
    const teamGroups = gameData.players.reduce((acc, player) => {
      const team = player.team || 'Unknown';
      if (!acc[team]) {
        acc[team] = { defense: [], offense: [] };
      }
      
      const side = player.side || 'N/A';
      if (side === 'defense') {
        acc[team].defense.push(player);
      } else if (side === 'offense') {
        acc[team].offense.push(player);
      }
      
      return acc;
    }, {} as Record<string, { defense: PlayerGameStats[], offense: PlayerGameStats[] }>);

    // Sort within each team/side group
    Object.keys(teamGroups).forEach(team => {
      // Sort defense by class order
      teamGroups[team].defense.sort((a, b) => {
        const orderA = getDefenseClassOrder(a.main_class || '');
        const orderB = getDefenseClassOrder(b.main_class || '');
        if (orderA !== orderB) return orderA - orderB;
        // If same class, sort by kills descending
        return b.kills - a.kills;
      });

      // Sort offense by class order
      teamGroups[team].offense.sort((a, b) => {
        const orderA = getOffenseClassOrder(a.main_class || '');
        const orderB = getOffenseClassOrder(b.main_class || '');
        if (orderA !== orderB) return orderA - orderB;
        // If same class, sort by kills descending
        return b.kills - a.kills;
      });
    });

    return teamGroups;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-blue-200">Loading game statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error Loading Game</h1>
          <p className="text-blue-200 mb-4">{error || 'Game not found'}</p>
          <Link href="/stats" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded">
            Back to Stats
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <Link href="/stats" className="text-cyan-400 hover:text-cyan-300">
              ← Back to Stats
            </Link>
            {gameData.linkedMatchId && (
              <Link 
                href={`/matches/${gameData.linkedMatchId}`}
                className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
              >
                🔗 View Match: {gameData.linkedMatchTitle}
              </Link>
            )}
          </div>
          
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Game Statistics
          </h1>
          <p className="text-xl text-blue-200">Game ID: {gameData.gameId}</p>
        </motion.div>

        {/* Game Summary - Compact horizontal layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-8 border border-white/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-xl font-bold text-cyan-400">{gameData.gameMode}</div>
                <div className="text-xs text-blue-200">Mode</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-purple-400">{gameData.mapName}</div>
                <div className="text-xs text-blue-200">Map</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-400">{gameData.totalPlayers}</div>
                <div className="text-xs text-blue-200">Players</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-400">
                  {gameData.duration > 0 ? formatTime(gameData.duration) : 'Unknown'}
                </div>
                <div className="text-xs text-blue-200">Duration</div>
              </div>
            </div>
            
            {/* Winner display */}
            {gameData.winningInfo && (
              <div className="text-center">
                <div className={`text-xl font-bold ${
                  gameData.winningInfo.type === 'side' 
                    ? (gameData.winningInfo.side === 'offense' ? 'text-red-400' : 'text-blue-400')
                    : 'text-yellow-400'
                }`}>
                  🏆 {gameData.winningInfo.winner}
                </div>
                <div className="text-xs text-blue-200">Winner</div>
              </div>
            )}
          </div>
          
          <div className="mt-3 text-center text-sm text-blue-200">
            <span className="font-semibold">{gameData.serverName}</span> • {formatDate(gameData.gameDate)}
          </div>
        </motion.div>

        {/* Video and Stats Grid Layout */}
        <div className={`${gameData.videoInfo?.has_video && isVideoExpanded ? 'grid grid-cols-1 xl:grid-cols-5 gap-6' : 'block'}`}>
          
          {/* Video Section */}
          {gameData.videoInfo?.has_video && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-8 ${isVideoExpanded ? 'xl:col-span-3' : ''}`}
            >
            <div className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20">
              {/* Video Header */}
              <div className="p-4 bg-white/20 border-b border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-blue-200">Match Video</h2>
                  {gameData.videoInfo.video_title && (
                    <span className="text-sm text-gray-300">• {gameData.videoInfo.video_title}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* External Links */}
                  {gameData.videoInfo.youtube_url && (
                    <a
                      href={gameData.videoInfo.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      📺 YouTube
                    </a>
                  )}
                  {gameData.videoInfo.vod_url && (
                    <a
                      href={gameData.videoInfo.vod_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      🎮 VOD
                    </a>
                  )}
                  {gameData.videoInfo.highlight_url && (
                    <a
                      href={gameData.videoInfo.highlight_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      ⭐ Highlights
                    </a>
                  )}
                  
                  {/* Expand/Collapse Toggle */}
                  <button
                    onClick={() => setIsVideoExpanded(!isVideoExpanded)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    {isVideoExpanded ? '📱 Minimize' : '📺 Expand'}
                  </button>
                </div>
              </div>

              {/* Video Content */}
              {isVideoExpanded && (
                <div className="p-4">
                  {gameData.videoInfo.youtube_url && !showVideoEmbed ? (
                    /* YouTube Thumbnail/Preview */
                    <div 
                      className="relative cursor-pointer group"
                      onClick={() => setShowVideoEmbed(true)}
                    >
                      <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                        <img
                          src={getYouTubeThumbnail(gameData.videoInfo.youtube_url) || '/placeholder-video.jpg'}
                          alt={gameData.videoInfo.video_title || 'Match Video'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                          <div className="bg-red-600 rounded-full p-4 group-hover:bg-red-500 transition-colors">
                            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-center">
                        <p className="text-gray-300 text-sm">Click to play embedded video</p>
                      </div>
                    </div>
                  ) : gameData.videoInfo.youtube_url && showVideoEmbed ? (
                    /* YouTube Embedded Player */
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <iframe
                        src={`https://www.youtube.com/embed/${getYouTubeVideoId(gameData.videoInfo.youtube_url)}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`}
                        title={gameData.videoInfo.video_title || 'Match Video'}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="eager"
                      />
                      <div className="mt-2 text-center">
                        <button
                          onClick={() => setShowVideoEmbed(false)}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          🔙 Show Thumbnail
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* No YouTube URL - Show other video options */
                    <div className="text-center py-8">
                      <div className="text-4xl mb-4">🎬</div>
                      <p className="text-gray-400 mb-4">Video available via external links</p>
                      <div className="flex justify-center gap-2">
                        {gameData.videoInfo.vod_url && (
                          <a
                            href={gameData.videoInfo.vod_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors"
                          >
                            📺 Watch VOD
                          </a>
                        )}
                        {gameData.videoInfo.highlight_url && (
                          <a
                            href={gameData.videoInfo.highlight_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition-colors"
                          >
                            ⭐ View Highlights
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Video Description */}
                  {gameData.videoInfo.video_description && (
                    <div className="mt-4 p-3 bg-white/5 rounded-lg">
                      <p className="text-gray-300 text-sm">{gameData.videoInfo.video_description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

          {/* Player Statistics Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20 ${
              gameData.videoInfo?.has_video && isVideoExpanded ? 'xl:col-span-2' : ''
            }`}
          >
          <div className="p-4 bg-white/20 border-b border-white/20">
            <h2 className="text-xl font-bold text-blue-200">Player Performance</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/20">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Player</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Side</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Base</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">K</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">D</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">K/D</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Caps</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Carrier Kills</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Carry Time</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Class Swaps</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">EB Hits</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Turret DMG</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                                 {Object.entries(getGroupedPlayers()).map(([team, { defense, offense }]) => (
                   <React.Fragment key={team}>
                                         <tr className="bg-white/30">
                       <td colSpan={14} className="px-3 py-2 text-center text-sm font-bold">
                         <span 
                           className="font-bold text-lg"
                           style={{ color: getTeamColor(team) }}
                         >
                           {team}
                         </span>
                         <span className="text-xs text-blue-200 ml-2">
                           ({defense.length + offense.length} players)
                         </span>
                                              </td>
                     </tr>
                     {defense.length > 0 && (
                       <tr className="bg-blue-500/20">
                         <td colSpan={14} className="px-3 py-1 text-center text-xs font-semibold text-blue-300">
                           🛡️ DEFENSE ({defense.length})
                         </td>
                       </tr>
                     )}
                     {defense.map((player, index) => (
                      <motion.tr
                        key={player.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-b border-white/10 hover:bg-white/5 transition-colors ${getWinLossBackground(player)}`}
                      >
                        <td className="px-3 py-2">
                          <Link 
                            href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                            className="transition-colors font-medium hover:text-cyan-300"
                            style={getClassColorStyle(player.main_class || '')}
                          >
                            {player.player_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span 
                            className="font-medium text-xs"
                            style={getClassColorStyle(player.main_class || '')}
                          >
                            {player.main_class || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            player.side === 'offense' 
                              ? 'bg-red-500/20 text-red-300' 
                              : player.side === 'defense' 
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-gray-500/20 text-gray-300'
                          }`}>
                            {player.side || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-white/20 px-2 py-1 rounded text-xs">
                            {player.base_used || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-green-400">{player.kills}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-red-400">{player.deaths}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-cyan-400">
                          {typeof player.deaths === 'number' && player.deaths > 0
                            ? (typeof player.kills === 'number' ? (player.kills / player.deaths).toFixed(2) : 'N/A')
                            : (typeof player.kills === 'number' ? player.kills.toFixed(2) : 'N/A')}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-purple-400">{player.flag_captures}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.carrier_kills}</td>
                        <td className="px-3 py-2 text-right text-xs">{formatTime(player.carry_time_seconds)}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.class_swaps}</td>
                        <td className="px-3 py-2 text-right text-xs text-yellow-400">{player.eb_hits}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.turret_damage}</td>
                        <td className="px-3 py-2 text-right text-xs text-orange-400">{formatPercentage(player.accuracy)}</td>
                                             </motion.tr>
                     ))}
                     {offense.length > 0 && (
                       <tr className="bg-red-500/20">
                         <td colSpan={14} className="px-3 py-1 text-center text-xs font-semibold text-red-300">
                           ⚔️ OFFENSE ({offense.length})
                         </td>
                       </tr>
                     )}
                     {offense.map((player, index) => (
                      <motion.tr
                        key={player.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-b border-white/10 hover:bg-white/5 transition-colors ${getWinLossBackground(player)}`}
                      >
                        <td className="px-3 py-2">
                          <Link 
                            href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                            className="transition-colors font-medium hover:text-cyan-300"
                            style={getClassColorStyle(player.main_class || '')}
                          >
                            {player.player_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span 
                            className="font-medium text-xs"
                            style={getClassColorStyle(player.main_class || '')}
                          >
                            {player.main_class || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            player.side === 'offense' 
                              ? 'bg-red-500/20 text-red-300' 
                              : player.side === 'defense' 
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-gray-500/20 text-gray-300'
                          }`}>
                            {player.side || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-white/20 px-2 py-1 rounded text-xs">
                            {player.base_used || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-green-400">{player.kills}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-red-400">{player.deaths}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-cyan-400">
                          {typeof player.deaths === 'number' && player.deaths > 0
                            ? (typeof player.kills === 'number' ? (player.kills / player.deaths).toFixed(2) : 'N/A')
                            : (typeof player.kills === 'number' ? player.kills.toFixed(2) : 'N/A')}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-purple-400">{player.flag_captures}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.carrier_kills}</td>
                        <td className="px-3 py-2 text-right text-xs">{formatTime(player.carry_time_seconds)}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.class_swaps}</td>
                        <td className="px-3 py-2 text-right text-xs text-yellow-400">{player.eb_hits}</td>
                        <td className="px-3 py-2 text-right text-xs">{player.turret_damage}</td>
                        <td className="px-3 py-2 text-right text-xs text-orange-400">{formatPercentage(player.accuracy)}</td>
                                             </motion.tr>
                     ))}
                   </React.Fragment>
                 ))}
              </tbody>
            </table>
          </div>
          </motion.div>
        
        </div> {/* End Video and Stats Grid Layout */}

        {/* Squad Performance Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <h2 className="text-2xl font-bold text-blue-200 mb-4">Squad Performance</h2>
          <div className="grid gap-4">
            {Object.entries(
              gameData.players.reduce((squads, player) => {
                if (!squads[player.squad_name]) {
                  squads[player.squad_name] = [];
                }
                squads[player.squad_name].push(player);
                return squads;
              }, {} as Record<string, PlayerGameStats[]>)
            ).map(([squadName, players]) => {
              const totalKills = players.reduce((sum, p) => sum + p.kills, 0);
              const totalDeaths = players.reduce((sum, p) => sum + p.deaths, 0);
              const totalCaptures = players.reduce((sum, p) => sum + p.flag_captures, 0);
              
              return (
                <div key={squadName} className="bg-white/10 backdrop-blur-lg rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-bold text-cyan-400 mb-2">{squadName}</h3>
                  <div className="grid grid-cols-4 gap-4 text-center text-sm">
                    <div>
                      <div className="text-xl font-bold">{totalKills}</div>
                      <div className="text-blue-200">Total Kills</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{totalDeaths}</div>
                      <div className="text-blue-200">Total Deaths</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{totalCaptures}</div>
                      <div className="text-blue-200">Flag Captures</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{players.length}</div>
                      <div className="text-blue-200">Players</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
} 