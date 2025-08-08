'use client';

import { useState, useEffect } from 'react';
import { getClassColorStyle } from '@/utils/classColors';

interface PlayerData {
  alias: string;
  team: string;
  teamType: string;
  className: string;
  isOffense: boolean;
  weapon: string;
  classPlayTimes?: { [className: string]: number }; // milliseconds
  totalPlayTime?: number; // milliseconds
  isDueling?: boolean;
  duelOpponent?: string;
  duelType?: string;
  currentHealth?: number;
  currentEnergy?: number;
  isAlive?: boolean;
}

interface GameData {
  arenaName: string | null;
  gameType: string | null;
  baseUsed: string | null;
  players: PlayerData[];
  lastUpdated: string | null;
  winningTeam?: string | null;
  participantData?: any[];
  serverStatus?: 'active' | 'idle' | 'unknown';
  totalPlayers?: number;
  playingPlayers?: number;
  spectators?: number;
  dataStale?: boolean;
  dataAge?: number;
  message?: string;
}

interface TeamGroup {
  name: string;
  type: string;
  players: PlayerData[];
  isOffense: boolean | null;
  isSpectator: boolean;
}

export default function LiveGameDataPage() {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  const fetchGameData = async () => {
    try {
      setConnectionStatus('connecting');
      const response = await fetch('/api/live-game-data', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setGameData(data);
        
        // Set connection status based on data staleness
        if (data.dataStale || data.serverStatus === 'unknown') {
          setConnectionStatus('disconnected');
        } else {
          setConnectionStatus('connected');
        }
        
        setLastRefresh(new Date());
      } else {
        console.error('Failed to fetch game data:', response.statusText);
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error('Error fetching game data:', error);
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchGameData();

    // Set up interval for 30-second updates
    const interval = setInterval(fetchGameData, 30000);

    return () => clearInterval(interval);
  }, []);

  const groupPlayersByTeam = (players: PlayerData[]): TeamGroup[] => {
    const teams = new Map<string, TeamGroup>();

    players.forEach(player => {
      const teamKey = player.team;
      
      if (!teams.has(teamKey)) {
        const isSpectator = player.team.toLowerCase().includes('spec') || 
                           player.team.toLowerCase().includes('np') ||
                           player.teamType === 'Spectator';
        
        teams.set(teamKey, {
          name: player.team,
          type: player.teamType,
          players: [],
          isOffense: isSpectator ? null : player.isOffense,
          isSpectator: isSpectator
        });
      }
      
      teams.get(teamKey)!.players.push(player);
    });

    // Sort teams: offense first, then defense, then spectators
    return Array.from(teams.values()).sort((a, b) => {
      if (a.isSpectator && !b.isSpectator) return 1;
      if (!a.isSpectator && b.isSpectator) return -1;
      if (a.isSpectator && b.isSpectator) return 0;
      
      if (a.isOffense && !b.isOffense) return -1;
      if (!a.isOffense && b.isOffense) return 1;
      
      return a.name.localeCompare(b.name);
    });
  };

  const formatDuration = (lastUpdated: string | null): string => {
    if (!lastUpdated) return 'Never';
    
    const diff = Date.now() - new Date(lastUpdated).getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const getConnectionStatusColor = () => {
    if (gameData?.dataStale) return 'text-orange-400';
    
    switch (connectionStatus) {
      case 'connected': return 'text-green-400';
      case 'disconnected': return 'text-red-400';
      case 'connecting': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusText = () => {
    if (gameData?.dataStale) return 'STALE DATA';
    
    switch (connectionStatus) {
      case 'connected': return 'SYNCED';
      case 'disconnected': return 'DISCONNECTED';
      case 'connecting': return 'SYNCING...';
      default: return 'UNKNOWN';
    }
  };

  const formatPlayTime = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg">Loading live game data...</p>
        </div>
      </div>
    );
  }

  const teams = gameData?.players ? groupPlayersByTeam(gameData.players) : [];
  const playingTeams = teams.filter(team => !team.isSpectator);
  const spectatorTeams = teams.filter(team => team.isSpectator);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-blue-400">Live Game Data Monitor</h1>
            <div className="flex items-center space-x-4">
              <div className={`font-mono text-sm ${getConnectionStatusColor()}`}>
                <span className="mr-2">●</span>
                {getConnectionStatusText()}
              </div>
              {lastRefresh && (
                <div className="text-sm text-gray-400">
                  Last Refresh: {lastRefresh.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          
          {/* Game Info */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 bg-gray-800 rounded-lg p-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Arena</label>
              <p className="text-lg font-semibold text-blue-300">
                {gameData?.arenaName || 'No Arena'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Game Type</label>
              <p className="text-lg font-semibold">
                <span className={gameData?.gameType === 'OvD' ? 'text-orange-400' : 'text-purple-400'}>
                  {gameData?.gameType || 'Unknown'}
                </span>
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Base Used</label>
              <p className="text-lg font-semibold text-green-400">
                {gameData?.baseUsed || 'Unknown'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Players</label>
              <p className="text-lg font-semibold text-cyan-400">
                {gameData?.totalPlayers || 0}
                <span className="text-sm text-gray-400 ml-1">
                  ({gameData?.playingPlayers || 0}+{gameData?.spectators || 0})
                </span>
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Server Status</label>
              <p className="text-lg font-semibold">
                <span className={gameData?.serverStatus === 'active' ? 'text-green-400' : 'text-gray-500'}>
                  {gameData?.serverStatus?.toUpperCase() || 'UNKNOWN'}
                </span>
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Last Update</label>
              <p className="text-lg font-semibold text-yellow-400">
                {formatDuration(gameData?.lastUpdated)}
                {gameData?.dataStale && (
                  <span className="ml-1 text-xs text-orange-400">STALE</span>
                )}
              </p>
            </div>
          </div>

          {/* Status Messages */}
          {gameData?.message && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
              <span className="font-semibold">Notice:</span> {gameData.message}
            </div>
          )}
        </div>

        {/* Player Teams */}
        {playingTeams.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {playingTeams.map((team, index) => (
                <div key={team.name} className="bg-gray-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">
                      <span className="text-white">{team.name}</span>
                      <span className="ml-2 text-sm">
                        ({team.type})
                      </span>
                    </h2>
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                        team.isOffense 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {team.isOffense ? 'OFFENSE' : 'DEFENSE'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {team.players.length} player{team.players.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {team.players.map((player, playerIndex) => (
                      <div 
                        key={`${player.alias}-${playerIndex}`}
                        className="p-3 bg-gray-700/50 rounded space-y-2"
                      >
                        {/* Player Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium text-white">
                              {player.alias}
                            </span>
                            <span 
                              className="px-2 py-1 rounded text-xs font-semibold"
                              style={{
                                backgroundColor: getClassColorStyle(player.className).color + '20',
                                border: `1px solid ${getClassColorStyle(player.className).color}30`,
                                ...getClassColorStyle(player.className)
                              }}
                            >
                              {player.className}
                            </span>
                            {player.isDueling && (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                                DUELING {player.duelOpponent ? `vs ${player.duelOpponent}` : ''}
                              </span>
                            )}
                            {player.currentHealth !== undefined && player.currentHealth < 60 && (
                              <span className="px-2 py-1 rounded text-xs bg-orange-500/20 text-orange-400">
                                {player.currentHealth}HP
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-gray-400">
                            {player.weapon && player.weapon !== 'Standard' && (
                              <span className="bg-gray-600 px-2 py-1 rounded">
                                {player.weapon}
                              </span>
                            )}
                            {player.totalPlayTime && (
                              <span className="text-cyan-400">
                                {formatPlayTime(player.totalPlayTime)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Class Play Times */}
                        {player.classPlayTimes && Object.keys(player.classPlayTimes).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(player.classPlayTimes)
                              .filter(([, time]) => time > 5000) // Only show classes with 5+ seconds
                              .sort(([, a], [, b]) => b - a) // Sort by time descending
                              .map(([className, time]) => (
                                <span 
                                  key={className}
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: getClassColorStyle(className).color + '15',
                                    border: `1px solid ${getClassColorStyle(className).color}40`,
                                    ...getClassColorStyle(className)
                                  }}
                                >
                                  {className}: {formatPlayTime(time)}
                                </span>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Spectators */}
            {spectatorTeams.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-400 mb-4">Spectators</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {spectatorTeams.map((team) => (
                    <div key={team.name} className="bg-gray-800/50 rounded-lg p-4 opacity-75">
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">
                        {team.name} ({team.players.length})
                      </h3>
                      <div className="space-y-1">
                        {team.players.map((player, playerIndex) => (
                          <div 
                            key={`${player.alias}-${playerIndex}`}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-gray-400">{player.alias}</span>
                            <span 
                              className="text-xs px-1 py-0.5 rounded"
                              style={getClassColorStyle(player.className)}
                            >
                              {player.className}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">No Active Game</h2>
            <p className="text-gray-500">
              Waiting for game data from the CTF server...
            </p>
            <div className="mt-4 text-sm text-gray-600">
              Data refreshes every 30 seconds
            </div>
          </div>
        )}

        {/* Debug Info */}
        {gameData && (
          <div className="mt-8 bg-gray-800/30 rounded-lg p-4">
            <details className="cursor-pointer">
              <summary className="text-sm text-gray-400 hover:text-gray-300">
                Debug Information
              </summary>
              <pre className="mt-2 text-xs text-gray-500 bg-gray-900/50 p-3 rounded overflow-auto">
                {JSON.stringify(gameData, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}