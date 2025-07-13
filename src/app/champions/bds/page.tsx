'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Crown, Flame, Star, Shield, Sword, Target, Award, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const BDSPage = () => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const bdsData = {
    name: 'Black Dragon Society',
    abbreviation: 'BDS',
    established: '2024',
    motto: 'From the Shadows, We Strike',
    seasonRecord: {
      overall: { wins: 221, losses: 17, draws: 7 },
      championships: 8,
      championshipSeasons: [3, 4, 5, 6, 10, 13, 16, 17],
      seasonRecords: [
        { season: 3, wins: 21, losses: 0, draws: 1, champion: true },
        { season: 4, wins: 30, losses: 0, draws: 1, champion: true },
        { season: 5, wins: 17, losses: 1, draws: 1, champion: true },
        { season: 6, wins: 22, losses: 3, draws: 0, champion: true },
        { season: 7, wins: 17, losses: 3, draws: 1, champion: false },
        { season: 8, wins: 11, losses: 2, draws: 0, champion: false },
        { season: 10, wins: 28, losses: 3, draws: 1, champion: true },
        { season: 13, wins: 24, losses: 2, draws: 0, champion: true },
        { season: 16, wins: 26, losses: 1, draws: 1, champion: true },
        { season: 17, wins: 25, losses: 2, draws: 1, champion: true }
      ]
    },
    players: [
      { alias: 'Seifer', rings: 8 },
      { alias: 'LiNgo', rings: 8 },
      { alias: 'Thor', rings: 8 },
      { alias: 'Plaps', rings: 7 },
      { alias: 'Prisoner', rings: 7 },
      { alias: 'Emp', rings: 5 },
      { alias: 'Angelus', rings: 4 },
      { alias: 'Flair', rings: 4 },
      { alias: 'An RR User', rings: 3 },
      { alias: 'funk', rings: 3 },
      { alias: 'panT', rings: 3 },
      { alias: 'Strike', rings: 3 },
      { alias: 'Amplifier', rings: 2 },
      { alias: 'Carnilion', rings: 2 },
      { alias: 'FlyMolo', rings: 2 },
      { alias: 'Goliath', rings: 2 },
      { alias: 'Herthbul', rings: 2 },
      { alias: 'Nac', rings: 2 },
      { alias: 'Polo', rings: 2 },
      { alias: 'Smoka', rings: 2 },
      { alias: 'Whirlwind', rings: 2 },
      { alias: 'Aborter', rings: 1 },
      { alias: 'albert', rings: 1 },
      { alias: 'Angela', rings: 1 },
      { alias: 'Blackchaoz', rings: 1 },
      { alias: 'Boss', rings: 1 },
      { alias: 'Designer', rings: 1 },
      { alias: 'Dilatory', rings: 1 },
      { alias: 'Dro', rings: 1 },
      { alias: 'Force', rings: 1 },
      { alias: 'Gallet', rings: 1 },
      { alias: 'Gravity', rings: 1 },
      { alias: 'John', rings: 1 },
      { alias: 'Kev', rings: 1 },
      { alias: 'Keyser', rings: 1 },
      { alias: 'Matt', rings: 1 },
      { alias: 'Mighty Mouse', rings: 1 },
      { alias: 'Mights', rings: 1 },
      { alias: 'Moon Shine', rings: 1 },
      { alias: 'Mugi', rings: 1 },
      { alias: 'Nothing', rings: 1 },
      { alias: 'Penguin', rings: 1 },
      { alias: 'Pheer', rings: 1 },
      { alias: 'Price Tag', rings: 1 },
      { alias: 'Revenge', rings: 1 },
      { alias: 'Rocky', rings: 1 },
      { alias: 'shadow', rings: 1 },
      { alias: 'Terminator', rings: 1 },
      { alias: 'The Korean', rings: 1 },
      { alias: 'Tyrael', rings: 1 },
      { alias: 'WolveN', rings: 1 }
    ]
  };

  // Dragon Eyes Parallax Component
  const DragonEyes = () => (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div 
        className="absolute top-20 left-10 w-16 h-16 rounded-full bg-gradient-to-r from-red-600 to-orange-500 opacity-30 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.1}px)` }}
      >
        <div className="absolute inset-2 bg-gradient-to-r from-yellow-400 to-red-500 rounded-full animate-ping"></div>
      </div>
      <div 
        className="absolute top-32 right-16 w-20 h-20 rounded-full bg-gradient-to-r from-red-500 to-orange-600 opacity-25 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.15}px)` }}
      >
        <div className="absolute inset-3 bg-gradient-to-r from-orange-400 to-red-600 rounded-full animate-ping"></div>
      </div>
    </div>
  );

  // Fire Breathing Animation Component
  const FireBreath = ({ visible }: { visible: boolean }) => (
    <div className={`transition-all duration-1000 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
      <div className="relative w-full h-32 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bottom-0 w-4 h-8 bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 rounded-full animate-pulse"
            style={{
              left: `${10 + i * 4}%`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
              transform: `scaleY(${0.5 + Math.random() * 1})`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-red-900/30 via-orange-900/20 to-transparent"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-red-900/20 to-black relative overflow-hidden">
      <DragonEyes />
      
      {/* Animated Background */}
      <div className="absolute inset-0">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          >
            <Flame className="text-red-400 opacity-40" size={3 + Math.random() * 8} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <Link
            href="/champions"
            className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors mb-8 group"
          >
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={20} />
            Back to Hall of Champions
          </Link>

          <div className="text-center mb-12">
            <div className="mb-8 relative">
              <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-400 to-yellow-500 mb-4 tracking-wider animate-pulse">
                BLACK DRAGON SOCIETY
              </h1>
              <div className="flex justify-center items-center gap-4 mb-6">
                <div className="w-24 h-1 bg-gradient-to-r from-transparent via-red-500 to-orange-500"></div>
                <Flame className="text-orange-500 animate-bounce" size={32} />
                <div className="w-24 h-1 bg-gradient-to-r from-orange-500 via-red-500 to-transparent"></div>
              </div>
              <p className="text-2xl text-orange-200 mb-4">"{bdsData.motto}"</p>
              <div className="flex justify-center items-center gap-6 text-red-300">
                <span className="flex items-center gap-2">
                  <Shield size={20} />
                  Est. {bdsData.established}
                </span>
                <span className="flex items-center gap-2">
                  <Crown size={20} />
                  8x CTFPL Champions
                </span>
                <span className="flex items-center gap-2">
                  <Trophy size={20} />
                  {bdsData.seasonRecord.overall.wins}-{bdsData.seasonRecord.overall.losses}-{bdsData.seasonRecord.overall.draws} Overall
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Championship Banner */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/30 via-orange-900/20 to-black/60 backdrop-blur-sm border border-red-500/30">
          <img
            src="/images/champion squads/BDS/BDS_S10_Champions.jpg"
            alt="BDS Season 10 Champions"
            className="w-full h-96 object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50"></div>
          <div className="absolute bottom-8 left-8 right-8">
            <h2 className="text-4xl font-bold text-orange-400 mb-2">8x CTFPL Champions</h2>
            <p className="text-xl text-orange-200">
              Legendary dynasty that conquered Seasons 3, 4, 5, 6, 10, 13, 16, and 17
            </p>
          </div>
        </div>
      </div>

      {/* Fire Breathing Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <FireBreath visible={scrollY > 300} />
      </div>

      {/* Squad Statistics */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-orange-400 mb-12">Championship Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Wins', value: bdsData.seasonRecord.overall.wins, icon: Trophy },
            { label: 'Total Losses', value: bdsData.seasonRecord.overall.losses, icon: Target },
            { label: 'Total Draws', value: bdsData.seasonRecord.overall.draws, icon: Award },
            { label: 'Championships', value: bdsData.seasonRecord.championships, icon: Crown }
          ].map((stat, index) => (
            <div
              key={index}
              className="relative p-6 rounded-xl bg-gradient-to-br from-red-900/30 via-orange-900/20 to-black/60 backdrop-blur-sm border border-red-500/30 hover:border-orange-400/60 transition-all duration-300 group"
            >
              <div className="text-center">
                <stat.icon className="mx-auto text-orange-400 mb-4 group-hover:scale-110 transition-transform" size={40} />
                <div className="text-3xl font-bold text-orange-300 mb-2">{stat.value}</div>
                <div className="text-red-300">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Season-by-Season Records */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-orange-400 mb-12">Season Records</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {bdsData.seasonRecord.seasonRecords.map((season, index) => (
            <div
              key={index}
              className={`relative p-6 rounded-xl backdrop-blur-sm border transition-all duration-300 group hover:scale-105 ${
                season.champion 
                  ? 'bg-gradient-to-br from-yellow-900/30 via-orange-900/20 to-red-900/30 border-yellow-500/30 hover:border-yellow-400/60' 
                  : 'bg-gradient-to-br from-red-900/20 via-gray-900/20 to-black/40 border-red-500/20 hover:border-red-400/40'
              }`}
            >
              {season.champion && (
                <div className="absolute top-2 right-2">
                  <Crown className="text-yellow-400 animate-pulse" size={20} />
                </div>
              )}
              
              <div className="text-center">
                <h3 className={`text-2xl font-bold mb-3 ${season.champion ? 'text-yellow-400' : 'text-red-300'}`}>
                  CTFPL S{season.season}{season.champion ? '*' : ''}
                </h3>
                <div className={`text-xl font-bold mb-2 ${season.champion ? 'text-orange-300' : 'text-gray-300'}`}>
                  {season.wins}-{season.losses}-{season.draws}
                </div>
                <div className={`text-sm ${season.champion ? 'text-yellow-200' : 'text-gray-400'}`}>
                  {season.champion ? 'CHAMPIONS' : 'Season Record'}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-8">
          <p className="text-orange-300 text-lg">
            <span className="text-yellow-400 font-bold">*</span> = Championship Season
          </p>
        </div>
      </div>

      {/* Player Roster */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-orange-400 mb-12">Dragon Warriors</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {bdsData.players.map((player, index) => (
            <div
              key={index}
              className="relative p-4 rounded-xl bg-gradient-to-br from-red-900/30 via-orange-900/20 to-black/60 backdrop-blur-sm border border-red-500/30 hover:border-orange-400/60 transition-all duration-300 group hover:scale-105"
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-orange-400 group-hover:text-orange-300 transition-colors mb-2">
                  {player.alias}
                </h3>
                <div className="flex justify-center items-center gap-1 mb-2">
                  {[...Array(player.rings)].map((_, i) => (
                    <Crown key={i} className="text-yellow-400" size={12} />
                  ))}
                </div>
                <div className="text-yellow-300 text-sm font-bold">
                  {player.rings} Ring{player.rings !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legacy Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="text-center p-12 rounded-2xl bg-gradient-to-br from-red-900/40 via-orange-900/30 to-black/60 backdrop-blur-sm border border-red-500/30">
          <Flame className="mx-auto text-orange-500 mb-6 animate-pulse" size={64} />
          <h2 className="text-4xl font-bold text-orange-400 mb-6">The Dragon's Legacy</h2>
          <p className="text-xl text-orange-200 max-w-4xl mx-auto leading-relaxed">
            From the shadows they emerged, forging the greatest dynasty in CTFPL history. The Black Dragon Society's 
            eight championship conquests across Seasons 3, 4, 5, 6, 10, 13, 16, and 17 established an unmatched legacy 
            of tactical supremacy and brotherhood. No squad has matched their dominance, no dynasty has burned brighter. 
            Their legend endures eternal in the halls of CTFPL history, an impossible standard for future champions to chase.
          </p>
          <div className="mt-8">
            <div className="w-32 h-1 bg-gradient-to-r from-red-500 via-orange-400 to-yellow-500 mx-auto animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BDSPage; 