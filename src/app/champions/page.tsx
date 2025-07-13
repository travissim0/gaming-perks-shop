'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Crown, Star, Sword, Shield } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

const ChampionArchives = () => {
  const { user } = useAuth();
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const seasonRecords = {
    'Season 3': { winner: 'BDS', runnerUp: null },
    'Season 4': { winner: 'BDS', runnerUp: null },
    'Season 5': { winner: 'BDS', runnerUp: 'Smurfs' },
    'Season 6': { winner: 'BDS', runnerUp: null },
    'Season 7': { winner: '--', runnerUp: null },
    'Season 8': { winner: 'Smurfs', runnerUp: null },
    'Season 9': { winner: '---', runnerUp: null },
    'Season 10': { winner: 'BDS', runnerUp: null },
    'Season 13': { winner: 'BDS', runnerUp: null },
    'Season 16': { winner: 'BDS', runnerUp: null },
    'Season 17': { winner: 'BDS', runnerUp: null }
  };

  const championSquads = [
    {
      id: 'bds',
      name: 'Black Dragon Society',
      abbreviation: 'BDS',
      seasons: ['Season 3', 'Season 4', 'Season 5', 'Season 6', 'Season 10', 'Season 13', 'Season 16', 'Season 17'],
      titles: 8,
      description: 'Legendary dynasty that conquered eight CTFPL championships, the most dominant squad in Infantry history.',
      image: '/images/champion squads/BDS/BDS_S10_Champions.jpg',
      theme: 'dragon',
      established: '2024'
    },
    {
      id: 'smurfs',
      name: 'Smurfs',
      abbreviation: 'SMURF',
      seasons: ['Season 8'],
      runnerUpSeasons: ['Season 5'],
      participatedSeasons: ['Season 5', 'Season 6', 'Season 7', 'Season 8', 'Season 9'],
      titles: 1,
      description: 'Legendary squad from nobodies and never quit attitude to PL Champions that shocked the league.',
      image: 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/Smurfs_S8_Champions.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9TbXVyZnNfUzhfQ2hhbXBpb25zLmpwZyIsImlhdCI6MTc1MjQzMDQyNiwiZXhwIjoyMzgzMTUwNDI2fQ.gjobokvIF6tD-ruk3U1BE3-Au59Yj5A9b9a7L68L4bY',
      theme: 'dragon',
      established: '2003'
    }
  ];

  // Generate consistent stars positions
  const generateStars = () => {
    const stars = [];
    for (let i = 0; i < 50; i++) {
      stars.push({
        id: i,
        left: (i * 7.3) % 100, // Use a consistent formula instead of Math.random()
        top: (i * 13.7) % 100,
        delay: (i * 0.1) % 3,
        duration: 2 + (i % 3),
        size: 2 + (i % 3)
      });
    }
    return stars;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-blue-900 to-black relative overflow-hidden">
      <div className="relative z-50">
        <Navbar user={user} />
      </div>
      
      {/* Animated Background Stars */}
      <div className="absolute inset-0 z-0">
        {isClient && generateStars().map((star) => (
          <div
            key={star.id}
            className="absolute animate-pulse"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`
            }}
          >
            <Star className="text-blue-300 opacity-60" size={star.size} />
          </div>
        ))}
      </div>

      {/* Grand Hall Header */}
      <div className="relative z-10 pt-16 pb-12 text-center">
        <div className="mb-8">
          <Crown className="mx-auto text-yellow-400 mb-4 animate-pulse" size={64} />
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 mb-4 tracking-wider">
            HALL OF CHAMPIONS
          </h1>
          <div className="w-32 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto mb-6"></div>
          <p className="text-xl text-blue-200 max-w-3xl mx-auto leading-relaxed">
            Enter the Grand Space Halls where titans of Infantry gather. Here lie the legends,
            the champions who carved their names into CTFPL history with honor, skill, and glory.
          </p>
        </div>
      </div>

      {/* Champions Grid */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {championSquads.map((squad, index) => (
            <Link
              key={squad.id}
              href={`/champions/${squad.id}`}
              className="group relative"
            >
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-800/80 via-gray-900/80 to-black/80 backdrop-blur-sm border border-yellow-500/20 hover:border-yellow-400/60 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl hover:shadow-yellow-400/20">
                {/* Animated Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                {/* Squad Image */}
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={squad.image}
                    alt={squad.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  
                  {/* Floating Trophy */}
                  <div className="absolute top-4 right-4 transform group-hover:rotate-12 transition-transform duration-300">
                    <Trophy className="text-yellow-400 animate-pulse" size={32} />
                  </div>
                </div>

                {/* Squad Info */}
                <div className="p-6 relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-2xl font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors">
                      {squad.abbreviation}
                    </h3>
                    <div className="flex items-center gap-1">
                      {[...Array(squad.titles)].map((_, i) => (
                        <Crown key={i} className="text-yellow-400" size={16} />
                      ))}
                    </div>
                  </div>
                  
                  <h4 className="text-lg text-blue-200 mb-3 group-hover:text-blue-100 transition-colors">
                    {squad.name}
                  </h4>
                  
                  <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                    {squad.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Shield size={12} />
                        Est. {squad.established}
                      </span>
                      <span className="flex items-center gap-1">
                        <Sword size={12} />
                        {squad.titles} Championships
                      </span>
                    </div>
                    
                    <div className="text-xs">
                      <div className="text-yellow-400 mb-1">
                        🏆 Champions: {squad.seasons.join(', ')}
                      </div>
                      {squad.runnerUpSeasons && (
                        <div className="text-gray-300 mb-1">
                          🥈 Runner-up: {squad.runnerUpSeasons.join(', ')}
                        </div>
                      )}
                      {squad.participatedSeasons && (
                        <div className="text-gray-400">
                          📋 Participated: {squad.participatedSeasons.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hover Effect Border Animation */}
                <div className="absolute inset-0 border-2 border-transparent group-hover:border-yellow-400/50 rounded-xl transition-all duration-500 pointer-events-none">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Coming Soon Placeholder */}
        <div className="mt-12 text-center">
          <div className="inline-block p-8 rounded-xl bg-gradient-to-br from-gray-800/40 via-gray-900/40 to-black/40 backdrop-blur-sm border border-gray-600/30">
            <Trophy className="mx-auto text-gray-500 mb-4 animate-pulse" size={48} />
            <h3 className="text-2xl font-bold text-gray-400 mb-2">More Legends Coming Soon</h3>
            <p className="text-gray-500">
              The halls echo with anticipation for future champions to claim their throne...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChampionArchives; 