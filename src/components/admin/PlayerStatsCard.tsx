'use client';

import React from 'react';
import { Trophy, Target, Crosshair, Clock, Users } from 'lucide-react';

interface PlayerStats {
  player_name: string;
  team: string;
  kills: number;
  deaths: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  main_class: string;
  accuracy: string;
  result: 'Win' | 'Loss';
  game_mode: string;
  side: string;
  left_early: boolean;
}

interface PlayerStatsCardProps {
  stats: PlayerStats;
  gameId?: string;
  gameDate?: string;
}

export default function PlayerStatsCard({ stats, gameId, gameDate }: PlayerStatsCardProps) {
  const kdr = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toString();
  const carryTimeFormatted = `${Math.floor(stats.carry_time_seconds / 60)}:${(stats.carry_time_seconds % 60).toString().padStart(2, '0')}`;
  
  const getClassColor = (className: string) => {
    const colors = {
      'Infantry': 'bg-green-900 text-green-200',
      'Heavy Weapons': 'bg-red-900 text-red-200',
      'Squad Leader': 'bg-yellow-900 text-yellow-200',
      'Combat Engineer': 'bg-blue-900 text-blue-200',
      'Field Medic': 'bg-purple-900 text-purple-200',
      'Jump Trooper': 'bg-orange-900 text-orange-200',
      'Infiltrator': 'bg-gray-900 text-gray-200'
    };
    return colors[className as keyof typeof colors] || 'bg-gray-700 text-gray-200';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border-l-4 border-l-blue-500">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{stats.player_name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-400">Team: {stats.team}</span>
            <span className={`px-2 py-1 rounded text-xs ${
              stats.result === 'Win' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
            }`}>
              {stats.result}
            </span>
          </div>
        </div>
        
        <div className="text-right">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getClassColor(stats.main_class)}`}>
            {stats.main_class}
          </div>
          {stats.left_early && (
            <span className="text-xs text-orange-400 mt-1 block">Left Early</span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-700 rounded-lg p-3">
          <div className="flex items-center mb-1">
            <Crosshair className="h-4 w-4 text-red-400 mr-2" />
            <span className="text-xs text-gray-400">K/D</span>
          </div>
          <p className="text-lg font-bold text-white">{stats.kills}/{stats.deaths}</p>
          <p className="text-xs text-gray-400">Ratio: {kdr}</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-3">
          <div className="flex items-center mb-1">
            <Trophy className="h-4 w-4 text-yellow-400 mr-2" />
            <span className="text-xs text-gray-400">Captures</span>
          </div>
          <p className="text-lg font-bold text-white">{stats.captures}</p>
          <p className="text-xs text-gray-400">Carrier Kills: {stats.carrier_kills}</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-3">
          <div className="flex items-center mb-1">
            <Clock className="h-4 w-4 text-blue-400 mr-2" />
            <span className="text-xs text-gray-400">Carry Time</span>
          </div>
          <p className="text-lg font-bold text-white">{carryTimeFormatted}</p>
          <p className="text-xs text-gray-400">mm:ss</p>
        </div>

        <div className="bg-gray-700 rounded-lg p-3">
          <div className="flex items-center mb-1">
            <Target className="h-4 w-4 text-green-400 mr-2" />
            <span className="text-xs text-gray-400">Accuracy</span>
          </div>
          <p className="text-lg font-bold text-white">{(parseFloat(stats.accuracy) * 100).toFixed(1)}%</p>
          <p className="text-xs text-gray-400">Hit Rate</p>
        </div>
      </div>

      {/* Match Details */}
      <div className="flex justify-between items-center text-sm text-gray-400 pt-4 border-t border-gray-700">
        <div className="flex items-center gap-4">
          <span>Mode: {stats.game_mode}</span>
          <span>Side: {stats.side}</span>
        </div>
        <div className="flex items-center gap-2">
          {gameDate && (
            <span>{new Date(gameDate).toLocaleDateString()}</span>
          )}
          {gameId && (
            <span className="font-mono text-xs">#{gameId.slice(-8)}</span>
          )}
        </div>
      </div>
    </div>
  );
}