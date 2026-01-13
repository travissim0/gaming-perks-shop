'use client';

import React from 'react';
import Link from 'next/link';
import ZoneCard from './ZoneCard';

interface ActiveZone {
  title: string;
  playerCount: number;
}

interface CommunityZonesCardProps {
  zones: ActiveZone[];
}

// Zone configuration with icons and colors
const zoneConfig: Record<string, { icon: string; color: string }> = {
  'Zombie Zone': { icon: '🧟', color: 'text-green-400' },
  'GravBall': { icon: '⚽', color: 'text-blue-400' },
  'The Arena': { icon: '🏟️', color: 'text-purple-400' },
  'Deathmatch': { icon: '💀', color: 'text-red-400' },
  'CTF': { icon: '🚩', color: 'text-cyan-400' },
  'Twin Peaks': { icon: '⛰️', color: 'text-cyan-400' },
  'Skirmish': { icon: '⚔️', color: 'text-yellow-400' },
  'USL': { icon: '🏅', color: 'text-orange-400' },
};

const getZoneConfig = (title: string) => {
  // Try exact match first
  if (zoneConfig[title]) return zoneConfig[title];

  // Try partial match
  for (const [key, config] of Object.entries(zoneConfig)) {
    if (title.toLowerCase().includes(key.toLowerCase())) {
      return config;
    }
  }

  // Default
  return { icon: '🎮', color: 'text-gray-400' };
};

export default function CommunityZonesCard({ zones }: CommunityZonesCardProps) {
  // Filter out CTFPL and Triple Threat related zones since they have their own cards
  const communityZones = zones.filter(zone => {
    const title = zone.title.toLowerCase();
    return !title.includes('ctfpl') && !title.includes('triple threat');
  });

  const sortedZones = [...communityZones].sort((a, b) => b.playerCount - a.playerCount);

  return (
    <ZoneCard
      title="Community Zones"
      icon="🌐"
      accentColor="green"
      linkTo="/zones"
      linkText="View All Zones"
    >
      <div className="space-y-4">
        {/* Zone Grid */}
        {sortedZones.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {sortedZones.slice(0, 6).map((zone, index) => {
              const config = getZoneConfig(zone.title);
              return (
                <div
                  key={index}
                  className="bg-gray-900/50 rounded-lg p-3 flex flex-col items-center justify-center text-center"
                >
                  <span className="text-2xl mb-1">{config.icon}</span>
                  <span className="text-xs text-gray-400 truncate w-full">{zone.title}</span>
                  <span className={`text-sm font-bold ${zone.playerCount > 0 ? config.color : 'text-gray-600'}`}>
                    {zone.playerCount} {zone.playerCount === 1 ? 'player' : 'players'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <span className="text-4xl">🌐</span>
            <p className="text-gray-500 text-sm mt-2">Loading zones...</p>
          </div>
        )}

        {/* Total Players Summary */}
        {sortedZones.length > 0 && (
          <div className="pt-2 border-t border-gray-700/50">
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">
                {sortedZones.reduce((sum, zone) => sum + zone.playerCount, 0)}
              </div>
              <div className="text-xs text-gray-500">Total Players Across Zones</div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Link
            href="/community/zone-interest"
            className="bg-gray-900/50 hover:bg-gray-900/70 rounded-lg p-2 text-center text-gray-400 hover:text-white transition-colors"
          >
            Zone Interest
          </Link>
          <Link
            href="/tools"
            className="bg-gray-900/50 hover:bg-gray-900/70 rounded-lg p-2 text-center text-gray-400 hover:text-white transition-colors"
          >
            Tools
          </Link>
        </div>
      </div>
    </ZoneCard>
  );
}
