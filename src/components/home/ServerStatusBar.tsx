'use client';

import React from 'react';

interface ActiveZone {
  title: string;
  playerCount: number;
}

interface ServerStatusBarProps {
  totalPlayers: number;
  zones: ActiveZone[];
  serverStatus: string;
}

export default function ServerStatusBar({ totalPlayers, zones, serverStatus }: ServerStatusBarProps) {
  const isOnline = serverStatus === 'online' || totalPlayers > 0;

  return (
    <div className="bg-gray-900/80 border-y border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Server Status */}
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-gray-300 font-medium">
              Server {isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="text-cyan-400 font-bold">
              {totalPlayers} Players
            </span>
          </div>

          {/* Active Zones */}
          <div className="flex flex-wrap items-center gap-4">
            {zones.slice(0, 5).map((zone, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-1 bg-gray-800/50 rounded-full border border-gray-700"
              >
                <span className="text-gray-400 text-sm">{zone.title}</span>
                <span className={`text-sm font-bold ${zone.playerCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                  {zone.playerCount}
                </span>
              </div>
            ))}
            {zones.length > 5 && (
              <span className="text-gray-500 text-sm">+{zones.length - 5} more</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
