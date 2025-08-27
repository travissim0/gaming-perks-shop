'use client';

import React from 'react';
import { Trophy, Users, Clock, Target, Zap } from 'lucide-react';

interface MatchPlayer {
  player_name: string;
  team: string;
  kills: number;
  deaths: number;
  captures: number;
  result: 'Win' | 'Loss';
  main_class: string;
  left_early: boolean;
}

interface MatchSummaryProps {
  gameId: string;
  gameDate: string;
  gameMode: string;
  gameLengthMinutes: number;
  players: MatchPlayer[];
}

export default function MatchSummary({ 
  gameId, 
  gameDate, 
  gameMode, 
  gameLengthMinutes, 
  players 
}: MatchSummaryProps) {
  const teams = [...new Set(players.map(p => p.team))];
  const winners = players.filter(p => p.result === 'Win');
  const winningTeam = winners.length > 0 ? winners[0].team : '';
  
  const totalKills = players.reduce((sum, p) => sum + p.kills, 0);
  const totalDeaths = players.reduce((sum, p) => sum + p.deaths, 0);
  const totalCaptures = players.reduce((sum, p) => sum + p.captures, 0);
  
  const topFragger = players.reduce((top, player) => 
    player.kills > top.kills ? player : top, players[0] || { kills: 0, player_name: '' }
  );

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTeamStats = (team: string) => {
    const teamPlayers = players.filter(p => p.team === team);
    const kills = teamPlayers.reduce((sum, p) => sum + p.kills, 0);
    const deaths = teamPlayers.reduce((sum, p) => sum + p.deaths, 0);
    const captures = teamPlayers.reduce((sum, p) => sum + p.captures, 0);
    const isWinner = teamPlayers.some(p => p.result === 'Win');
    
    return { kills, deaths, captures, isWinner, playerCount: teamPlayers.length };
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Match Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Match Summary</h2>
          <div className="flex items-center gap-4 text-gray-400">
            <span>Mode: {gameMode}</span>
            <span>Duration: {formatDuration(gameLengthMinutes)}</span>
            <span>Date: {new Date(gameDate).toLocaleDateString()}</span>
          </div>
          <p className="text-sm text-gray-500 font-mono mt-1">Game ID: {gameId}</p>
        </div>
        
        <div className="text-right">
          <div className="bg-gray-700 rounded-lg px-4 py-2">
            <p className="text-sm text-gray-400">Players</p>
            <p className="text-xl font-bold text-white">{players.length}</p>
          </div>
        </div>
      </div>

      {/* Match Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <Target className="h-5 w-5 text-red-400 mr-2" />
            <span className="text-sm text-gray-400">Total Kills</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalKills}</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <Trophy className="h-5 w-5 text-yellow-400 mr-2" />
            <span className="text-sm text-gray-400">Total Captures</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalCaptures}</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <Zap className="h-5 w-5 text-purple-400 mr-2" />
            <span className="text-sm text-gray-400">Top Fragger</span>
          </div>
          <p className="text-lg font-bold text-white">{topFragger.player_name}</p>
          <p className="text-sm text-gray-400">{topFragger.kills} kills</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <Clock className="h-5 w-5 text-blue-400 mr-2" />
            <span className="text-sm text-gray-400">K/D Ratio</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills}
          </p>
        </div>
      </div>

      {/* Team Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {teams.map(team => {
          const teamStats = getTeamStats(team);
          return (
            <div 
              key={team} 
              className={`bg-gray-700 rounded-lg p-4 border-2 ${
                teamStats.isWinner ? 'border-green-500' : 'border-gray-600'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-white">{team}</h3>
                {teamStats.isWinner && (
                  <span className="bg-green-900 text-green-200 px-2 py-1 rounded text-sm font-medium">
                    Winner
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400">Kills</p>
                  <p className="text-lg font-bold text-white">{teamStats.kills}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Deaths</p>
                  <p className="text-lg font-bold text-white">{teamStats.deaths}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Captures</p>
                  <p className="text-lg font-bold text-white">{teamStats.captures}</p>
                </div>
              </div>
              
              {/* Team Players */}
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-2">Players ({teamStats.playerCount}):</p>
                {players.filter(p => p.team === team).map(player => (
                  <div key={player.player_name} className="flex justify-between items-center text-sm">
                    <span className={`${player.left_early ? 'text-orange-400' : 'text-white'}`}>
                      {player.player_name}
                      {player.left_early && ' (Left Early)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{player.kills}K/{player.deaths}D</span>
                      <span className="text-xs text-gray-500">{player.main_class}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}