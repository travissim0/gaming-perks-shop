'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import DynamicHeroCarousel from '@/components/home/DynamicHeroCarousel';
import ServerStatusBar from '@/components/home/ServerStatusBar';
import ZoneCard from '@/components/home/ZoneCard';
import CTFPLCard from '@/components/home/CTFPLCard';
import TripleThreatCard from '@/components/home/TripleThreatCard';
import CommunityZonesCard from '@/components/home/CommunityZonesCard';
import TopSupportersWidget from '@/components/TopSupportersWidget';
import NewsSection from '@/components/NewsSection';
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black">
      <Navbar />

      {/* Dynamic Hero Carousel */}
      <DynamicHeroCarousel />

      {/* Server Status Bar */}
      <ServerStatusBar
        totalPlayers={serverData.stats.totalPlayers}
        zones={serverData.zones}
        serverStatus={serverData.stats.serverStatus}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Zone Cards Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-3xl">🎮</span>
            Active Leagues & Zones
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

        {/* Community Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* News Section - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 rounded-xl border border-blue-500/30 p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📰</span>
                Latest News & Updates
              </h3>
              <NewsSection maxPosts={4} showFeaturedOnly={true} />
            </div>
          </div>

          {/* Right Column - Donations & Supporters */}
          <div className="space-y-6">
            {/* Recent Donations */}
            <div className="bg-gray-800/50 rounded-xl border border-yellow-500/30 p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">💝</span>
                Recent Supporters
              </h3>
              {recentDonations && recentDonations.length > 0 ? (
                <div className="space-y-3">
                  {recentDonations.slice(0, 5).map((donation: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-yellow-500/20"
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
                className="mt-4 block w-full text-center py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors"
              >
                Support the Community
              </Link>
            </div>

            {/* Top Supporters Widget */}
            <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                Top Supporters
              </h3>
              <TopSupportersWidget maxSupporters={5} />
            </div>
          </div>
        </div>

        {/* Quick Links Footer */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/squads"
            className="flex items-center justify-center gap-2 p-4 bg-gray-800/50 rounded-xl border border-purple-500/30 hover:bg-purple-500/20 transition-colors text-white"
          >
            <span className="text-2xl">🛡️</span>
            <span className="font-medium">Squads</span>
          </Link>
          <Link
            href="/matches"
            className="flex items-center justify-center gap-2 p-4 bg-gray-800/50 rounded-xl border border-green-500/30 hover:bg-green-500/20 transition-colors text-white"
          >
            <span className="text-2xl">⚔️</span>
            <span className="font-medium">Matches</span>
          </Link>
          <Link
            href="/stats"
            className="flex items-center justify-center gap-2 p-4 bg-gray-800/50 rounded-xl border border-blue-500/30 hover:bg-blue-500/20 transition-colors text-white"
          >
            <span className="text-2xl">📊</span>
            <span className="font-medium">Stats</span>
          </Link>
          <Link
            href="/forum"
            className="flex items-center justify-center gap-2 p-4 bg-gray-800/50 rounded-xl border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors text-white"
          >
            <span className="text-2xl">💬</span>
            <span className="font-medium">Forum</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500">
          <p>Free Infantry Community Hub</p>
          <p className="text-sm mt-2">Supporting all zones and leagues</p>
        </div>
      </footer>
    </div>
  );
}
