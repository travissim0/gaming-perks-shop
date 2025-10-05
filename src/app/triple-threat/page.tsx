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
      <div className="relative pt-32 pb-16 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/8 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Side - Large Image */}
            <div className="flex justify-center lg:justify-start">
              <img 
                src="/images/triple-threat/tripleThreatImage.png" 
                alt="Triple Threat" 
                className="w-full max-w-lg h-auto object-contain filter drop-shadow-2xl animate-pulse hover:scale-105 transition-transform duration-500"
                style={{ 
                  imageRendering: 'auto',
                  mixBlendMode: 'multiply',
                  backgroundColor: 'transparent',
                  filter: 'drop-shadow(0 25px 25px rgb(0 0 0 / 0.15)) contrast(1.1) brightness(1.1)'
                }}
              />
            </div>

            {/* Right Side - Descriptive Text */}
            <div className="text-left space-y-6">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-lg">
                The Ultimate <em className="text-yellow-300">3v3</em> Challenge
              </h2>
              
              <div className="text-lg text-white/90 leading-relaxed">
                <p>
                  <strong className="text-cyan-300">Triple Threat</strong> is fast-paced{' '}
                  <span className="text-yellow-300 font-semibold">3v3</span> Infantry combat with team sizes up to{' '}
                  <span className="text-purple-300 font-semibold">4 players</span>. Compete in intense rounds where 
                  teamwork and strategy determine victory in the ultimate competitive battlefield experience.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Mission Control Cards */}
      <div className="max-w-6xl mx-auto px-6 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          
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

          {/* Stats */}
          <Link href="/triple-threat/stats" className="group relative">
            <div className="bg-gradient-to-br from-yellow-400/10 to-orange-600/20 backdrop-blur-sm border border-yellow-300/50 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-yellow-200/70 hover:shadow-2xl hover:shadow-yellow-400/30">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/0 to-yellow-400/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">📊</div>
                <h3 className="text-2xl font-bold text-yellow-200 mb-4">STATS</h3>
                <p className="text-yellow-100/90">
                  View player leaderboards and performance statistics.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

    </TripleThreatBackground>
  );
}
