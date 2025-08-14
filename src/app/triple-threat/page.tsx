'use client';

import React from 'react';
import Link from 'next/link';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader from '@/components/TripleThreatHeader';

export default function TripleThreatPage() {
  return (
    <TripleThreatBackground opacity={0.2}>
      <TripleThreatHeader 
        currentPage="home" 
        showTeamStatus={true}
      />

      {/* Hero Section */}
      <div className="relative pt-20 pb-16 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/8 to-transparent"></div>
        <div className="relative max-w-6xl mx-auto px-6 text-center">
          <div className="mb-8">
            <h1 className="text-8xl font-black mb-4 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-2xl animate-pulse">
              TRIPLE
            </h1>
            <h1 className="text-8xl font-black mb-6 bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-2xl animate-pulse" style={{ animationDelay: '0.5s' }}>
              THREAT
            </h1>
          </div>
          <div className="bg-gradient-to-r from-cyan-400/15 via-purple-500/15 to-pink-400/15 backdrop-blur-sm border border-purple-400/40 rounded-2xl p-8 max-w-4xl mx-auto shadow-2xl shadow-purple-500/20">
            <p className="text-xl text-white/90 mb-6 leading-relaxed">
              Competitive 3v3 Infantry matches with team-based gameplay and comprehensive statistics tracking.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <span className="bg-cyan-400/25 border border-cyan-300/60 px-4 py-2 rounded-full text-cyan-200 shadow-lg">3 Active Players</span>
              <span className="bg-purple-500/25 border border-purple-300/60 px-4 py-2 rounded-full text-purple-200 shadow-lg">1 Alternate</span>
              <span className="bg-pink-400/25 border border-pink-300/60 px-4 py-2 rounded-full text-pink-200 shadow-lg">Stats Tracking</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Control Cards */}
      <div className="max-w-6xl mx-auto px-6 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* Rules */}
          <Link href="/triple-threat/rules" className="group relative">
            <div className="bg-gradient-to-br from-cyan-400/10 to-cyan-600/20 backdrop-blur-sm border border-cyan-300/50 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-cyan-200/70 hover:shadow-2xl hover:shadow-cyan-400/30">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 to-cyan-400/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">📋</div>
                <h3 className="text-2xl font-bold text-cyan-200 mb-4">RULES</h3>
                <p className="text-cyan-100/90">
                  Tournament format and competition guidelines.
                </p>
              </div>
            </div>
          </Link>

          {/* Team Signup */}
          <Link href="/triple-threat/teams" className="group relative">
            <div className="bg-gradient-to-br from-purple-400/10 to-purple-600/20 backdrop-blur-sm border border-purple-300/50 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-purple-200/70 hover:shadow-2xl hover:shadow-purple-400/30">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400/0 to-purple-400/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">🛡️</div>
                <h3 className="text-2xl font-bold text-purple-200 mb-4">TEAMS</h3>
                <p className="text-purple-100/90">
                  View, create, or join teams to compete in tournaments.
                </p>
              </div>
            </div>
          </Link>

          {/* Matches */}
          <Link href="/triple-threat/matches" className="group relative">
            <div className="bg-gradient-to-br from-pink-400/10 to-pink-600/20 backdrop-blur-sm border border-pink-300/50 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-pink-200/70 hover:shadow-2xl hover:shadow-pink-400/30">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-400/0 to-pink-400/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">⚔️</div>
                <h3 className="text-2xl font-bold text-pink-200 mb-4">MATCHES</h3>
                <p className="text-pink-100/90">
                  View upcoming matches and tournament results.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

    </TripleThreatBackground>
  );
}
