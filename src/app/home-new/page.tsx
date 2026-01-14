'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import NeutralNavbar from '@/components/home/NeutralNavbar';
import DynamicHeroCarousel from '@/components/home/DynamicHeroCarousel';
import ServerStatusBar from '@/components/home/ServerStatusBar';
import CTFPLCard from '@/components/home/CTFPLCard';
import TripleThreatCard from '@/components/home/TripleThreatCard';
import CommunityZonesCard from '@/components/home/CommunityZonesCard';
import TopSupportersWidget from '@/components/TopSupportersWidget';
import { useDonationMode } from '@/hooks/useDonationMode';

interface ServerStats {
  totalPlayers: number;
  activeGames: number;
  serverStatus: string;
}

interface ActiveZone {
  title: string;
  playerCount: number;
}

interface ServerData {
  zones: ActiveZone[];
  stats: ServerStats;
  lastUpdated: string;
}

export default function HomeNew() {
  const { user, loading } = useAuth();
  const { donations: recentDonations } = useDonationMode('recent-donations', 5);
  const [serverData, setServerData] = useState<ServerData>({
    zones: [],
    stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
    lastUpdated: ''
  });

  // Fetch server status
  useEffect(() => {
    const fetchServerData = async () => {
      try {
        const response = await fetch('/api/server-status');
        const data = await response.json();
        if (data) {
          setServerData({
            zones: data.zones || [],
            stats: data.stats || { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
            lastUpdated: data.lastUpdated || new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Failed to fetch server data:', error);
      }
    };

    fetchServerData();
    const interval = setInterval(fetchServerData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Neutral Navbar - No CTFPL branding */}
      <NeutralNavbar />

      {/* Dynamic Space Hero Carousel - Compact */}
      <DynamicHeroCarousel />

      {/* Server Status Bar - Now higher up */}
      <ServerStatusBar
        totalPlayers={serverData.stats.totalPlayers}
        zones={serverData.zones}
        serverStatus={serverData.stats.serverStatus}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Zone Cards Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-3xl">🎮</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
              Active Leagues & Zones
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* CTFPL Card */}
            <CTFPLCard />

            {/* Triple Threat Card */}
            <TripleThreatCard />

            {/* Community Zones Card */}
            <CommunityZonesCard zones={serverData.zones} />
          </div>
        </div>

        {/* Community Support Section - Simplified without News */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Recent Donations */}
          <div className="bg-gray-800/50 rounded-xl border border-yellow-500/30 p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-2xl">💝</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                Recent Supporters
              </span>
            </h3>
            {recentDonations && recentDonations.length > 0 ? (
              <div className="space-y-3">
                {recentDonations.slice(0, 5).map((donation: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-yellow-500/20 hover:border-yellow-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-yellow-400 text-lg">💖</span>
                      <span className="text-gray-200 font-medium">
                        {donation.customerName || 'Anonymous'}
                      </span>
                    </div>
                    <span className="text-yellow-400 font-bold">
                      ${donation.amount}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">No recent donations</p>
            )}
            <Link
              href="/donate"
              className="mt-4 block w-full text-center py-3 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 text-yellow-400 rounded-lg transition-all font-medium border border-yellow-500/30"
            >
              Support the Community
            </Link>
          </div>

          {/* Top Supporters Widget */}
          <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Top Supporters
              </span>
            </h3>
            <TopSupportersWidget maxSupporters={5} />
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-800/50 py-8 bg-gray-950/50">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-2xl font-black tracking-wider mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
              FREE INFANTRY
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            Community Gaming Hub • All Zones Welcome
          </p>
        </div>
      </footer>
    </div>
  );
}
