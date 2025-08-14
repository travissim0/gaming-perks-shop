'use client';

import React from 'react';
import Link from 'next/link';

export default function TripleThreatPage() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      
      {/* Custom Triple Threat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                TRIPLE THREAT
              </div>
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/triple-threat" className="text-cyan-300 hover:text-cyan-100 transition-colors font-medium">
                Home
              </Link>
              <Link href="/triple-threat/rules" className="text-gray-300 hover:text-white transition-colors">
                Rules
              </Link>
              <Link href="/triple-threat/signup" className="text-gray-300 hover:text-white transition-colors">
                Teams
              </Link>
              <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                Matches
              </Link>
              <Link href="/" className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Animated Background */}
      <div className="fixed inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-purple-900/20 to-pink-900/20"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-cyan-400/20 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 4 + 1}px`,
                height: `${Math.random() * 4 + 1}px`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${Math.random() * 3 + 2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative pt-20 pb-16 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent"></div>
        <div className="relative max-w-6xl mx-auto px-6 text-center">
          <div className="mb-8">
            <h1 className="text-8xl font-black mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl animate-pulse">
              TRIPLE
            </h1>
            <h1 className="text-8xl font-black mb-6 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-2xl animate-pulse" style={{ animationDelay: '0.5s' }}>
              THREAT
            </h1>
          </div>
          <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 backdrop-blur-sm border border-cyan-500/30 rounded-2xl p-8 max-w-4xl mx-auto">
            <p className="text-xl text-cyan-100 mb-6 leading-relaxed">
              Competitive 3v3 Infantry matches with team-based gameplay and comprehensive statistics tracking.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <span className="bg-cyan-500/20 border border-cyan-400/50 px-4 py-2 rounded-full text-cyan-300">3 Active Players</span>
              <span className="bg-purple-500/20 border border-purple-400/50 px-4 py-2 rounded-full text-purple-300">1 Alternate</span>
              <span className="bg-pink-500/20 border border-pink-400/50 px-4 py-2 rounded-full text-pink-300">Stats Tracking</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Control Cards */}
      <div className="max-w-6xl mx-auto px-6 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* Rules */}
          <Link href="/triple-threat/rules" className="group relative">
            <div className="bg-gradient-to-br from-cyan-500/5 to-cyan-700/10 backdrop-blur-sm border border-cyan-400/30 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-cyan-300/60 hover:shadow-2xl hover:shadow-cyan-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">📋</div>
                <h3 className="text-2xl font-bold text-cyan-300 mb-4">RULES</h3>
                <p className="text-cyan-100/80">
                  Tournament format and competition guidelines.
                </p>
              </div>
            </div>
          </Link>

          {/* Team Signup */}
          <Link href="/triple-threat/signup" className="group relative">
            <div className="bg-gradient-to-br from-purple-500/5 to-purple-700/10 backdrop-blur-sm border border-purple-400/30 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-purple-300/60 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">🛡️</div>
                <h3 className="text-2xl font-bold text-purple-300 mb-4">TEAM SIGNUP</h3>
                <p className="text-purple-100/80">
                  Create or join a team to compete in tournaments.
                </p>
              </div>
            </div>
          </Link>

          {/* Matches */}
          <Link href="/triple-threat/matches" className="group relative">
            <div className="bg-gradient-to-br from-pink-500/5 to-pink-700/10 backdrop-blur-sm border border-pink-400/30 rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:border-pink-300/60 hover:shadow-2xl hover:shadow-pink-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/0 to-pink-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative text-center">
                <div className="text-5xl mb-6 filter drop-shadow-lg">⚔️</div>
                <h3 className="text-2xl font-bold text-pink-300 mb-4">MATCHES</h3>
                <p className="text-pink-100/80">
                  View upcoming matches and tournament results.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}
