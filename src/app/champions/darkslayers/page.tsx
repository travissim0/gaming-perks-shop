'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Crown, Star, Shield, Sword, Target, Award, ArrowLeft, Medal, Skull } from 'lucide-react';
import Link from 'next/link';

const DarkslayersPage = () => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const darkslayersData = {
    name: 'Darkslayers',
    abbreviation: 'DS',
    established: '2002',
    motto: 'From Darkness Comes Victory',
    seasonRecord: {
      overall: { wins: 87, losses: 29, draws: 5 },
      playoffs: { wins: 24, losses: 8 },
      championships: 1,
      runnerUps: 0,
      thirdPlace: 0,
      bestFinish: '1st Place (Season 1)',
      championshipSeasons: [1],
      runnerUpSeasons: [],
      thirdPlaceSeasons: [],
      seasonRecords: [
        { season: 1, wins: 0, losses: 0, draws: 0, champion: true, runnerUp: false, thirdPlace: false }
      ]
    },
    players: [
      // Season 1 Champions (with rings) - alphabetically
      { alias: '007_Sniper', seasons: [1, 2], rings: 1 },
      { alias: 'BaBo-', seasons: [1, 2], rings: 1 },
      { alias: 'C-Spy', seasons: [1, 2], rings: 1 },
      { alias: 'Captain Ax', seasons: [1, 2, 3, 4], rings: 1 },
      { alias: 'cccrimson', seasons: [1, 2], rings: 1 },
      { alias: 'Cyrus Alexander', seasons: [1, 2, 4, 5], rings: 1 },
      { alias: 'darkhog', seasons: [1, 2], rings: 1 },
      { alias: 'delerious', seasons: [1, 2, 5], rings: 1 },
      { alias: 'Dr@gon', seasons: [1, 2, 3], rings: 1 },
      { alias: 'FiReFiGhT', seasons: [1, 2], rings: 1 },
      { alias: 'FishBrain (aka KindGrind)', seasons: [1, 2], rings: 1 },
      { alias: 'Guy Smily', seasons: [1], rings: 1 },
      { alias: 'Keltar', seasons: [1], rings: 1 },
      { alias: 'Krono', seasons: [1, 2], rings: 1 },
      { alias: 'Logik', seasons: [1, 2], rings: 1 },
      { alias: 'Lune', seasons: [1, 2, 3], rings: 1 },
      { alias: 'Pinkyz-Head', seasons: [1, 2], rings: 1 },
      { alias: 'pumaking', seasons: [1, 2], rings: 1 },
      { alias: 'Rebelsim', seasons: [1, 2], rings: 1 },
      { alias: 'SeeD Engineer', seasons: [1, 2], rings: 1 },
      { alias: 'Shugotenshi', seasons: [1, 2, 5], rings: 1 },
      { alias: 'SilentDrum', seasons: [1, 2, 3], rings: 1 },
      { alias: 'Sniper.Wolf', seasons: [1, 2], rings: 1 },
      { alias: 'Sunshine Lolipops', seasons: [1, 2], rings: 1 },
      { alias: 'Talmage', seasons: [1, 2], rings: 1 },
      { alias: 'Turbofrog', seasons: [1, 2], rings: 1 },
      { alias: 'Wen (Capt)', seasons: [1, 2], rings: 1 },
      { alias: 'XXXXX (Co-Capt)', seasons: [1, 2, 3, 4], rings: 1 },
      // Non-Season 1 players (no rings) - alphabetically
      { alias: 'Altema', seasons: [3, 4], rings: 0 },
      { alias: 'Anime', seasons: [3, 4, 5], rings: 0 },
      { alias: 'Armageddon-Fang', seasons: [4, 5], rings: 0 },
      { alias: 'Attacker', seasons: [3, 4], rings: 0 },
      { alias: 'Azalin', seasons: [5], rings: 0 },
      { alias: 'Cheerio$', seasons: [4], rings: 0 },
      { alias: 'Dark Weapon', seasons: [5], rings: 0 },
      { alias: 'Daventry (Co-Capt)', seasons: [2, 3, 4], rings: 0 },
      { alias: 'Decoy Octopus', seasons: [4], rings: 0 },
      { alias: 'DePH', seasons: [5], rings: 0 },
      { alias: 'Desert Cobra (Co-Capt)', seasons: [5], rings: 0 },
      { alias: 'DrkCloudXX', seasons: [2], rings: 0 },
      { alias: 'Eagle', seasons: [4, 5], rings: 0 },
      { alias: 'Eaglestriker', seasons: [4], rings: 0 },
      { alias: 'Emperor', seasons: [4], rings: 0 },
      { alias: 'farzzie', seasons: [5], rings: 0 },
      { alias: 'Flave', seasons: [5], rings: 0 },
      { alias: 'hed', seasons: [3], rings: 0 },
      { alias: 'iKx-', seasons: [4], rings: 0 },
      { alias: 'ike', seasons: [3], rings: 0 },
      { alias: 'Intertech', seasons: [5], rings: 0 },
      { alias: 'Jericho', seasons: [5], rings: 0 },
      { alias: 'Jusdemon', seasons: [5], rings: 0 },
      { alias: 'KindGrind', seasons: [4], rings: 0 },
      { alias: 'Lamprey (aka Polo)', seasons: [3], rings: 0 },
      { alias: 'Liche_pt', seasons: [2, 4], rings: 0 },
      { alias: 'Liw', seasons: [4], rings: 0 },
      { alias: 'Mr. Mackaveli (Co-Capt)', seasons: [2, 3, 4, 5], rings: 0 },
      { alias: 'Mystik-', seasons: [5], rings: 0 },
      { alias: 'NeoNirvana', seasons: [5], rings: 0 },
      { alias: 'Omni.', seasons: [3], rings: 0 },
      { alias: 'Perceptor', seasons: [3, 4], rings: 0 },
      { alias: 'perceptor', seasons: [5], rings: 0 },
      { alias: 'Power', seasons: [3], rings: 0 },
      { alias: 'PsykoJ', seasons: [5], rings: 0 },
      { alias: 'r1os', seasons: [4], rings: 0 },
      { alias: 'Rattlesnake', seasons: [4, 5], rings: 0 },
      { alias: 'RiderGZ', seasons: [5], rings: 0 },
      { alias: 'Saishyuro', seasons: [4], rings: 0 },
      { alias: 'shaw', seasons: [3], rings: 0 },
      { alias: 'Smegle', seasons: [5], rings: 0 },
      { alias: 'Smuggle', seasons: [5], rings: 0 },
      { alias: 'TaiMaiShu', seasons: [4], rings: 0 },
      { alias: 'Teachers', seasons: [4], rings: 0 },
      { alias: 'Tough-Luck (Capt)', seasons: [4, 5], rings: 0 },
      { alias: 'vicks minty', seasons: [4], rings: 0 },
      { alias: 'Wimp The Pimp', seasons: [3], rings: 0 }
    ]
  };

  // Dark Eyes Parallax Component with dark theme
  const DarkEyes = () => (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div 
        className="absolute top-20 left-10 w-16 h-16 rounded-full bg-gradient-to-r from-gray-800 to-gray-700 opacity-30 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.1}px)` }}
      >
        <div className="absolute inset-2 bg-gradient-to-r from-gray-600 to-gray-500 rounded-full animate-ping"></div>
      </div>
      <div 
        className="absolute top-32 right-16 w-20 h-20 rounded-full bg-gradient-to-r from-gray-700 to-gray-600 opacity-25 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.15}px)` }}
      >
        <div className="absolute inset-3 bg-gradient-to-r from-gray-500 to-gray-400 rounded-full animate-ping"></div>
      </div>
    </div>
  );

  // Dark Flame Animation Component with dark theme
  const DarkFlameBreath = ({ visible }: { visible: boolean }) => (
    <div className={`transition-all duration-1000 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
      <div className="relative w-full h-32 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bottom-0 w-4 h-8 bg-gradient-to-t from-gray-800 via-gray-600 to-gray-400 rounded-full animate-pulse"
            style={{
              left: `${10 + i * 4}%`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
              transform: `scaleY(${0.5 + Math.random() * 1})`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-gray-900/30 to-transparent"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900/40 to-black relative overflow-hidden">
      <DarkEyes />
      
      {/* Animated Dark-themed Background */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
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
            <Skull className="text-gray-500 opacity-40" size={3 + Math.random() * 8} />
          </div>
        ))}
        {/* Dark Elements */}
        {[...Array(10)].map((_, i) => (
          <div
            key={`dark-${i}`}
            className="absolute text-2xl opacity-30 animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          >
            {Math.random() > 0.5 ? '⚔️' : '🗡️'}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <Link
            href="/champions"
            className="inline-flex items-center gap-2 text-white hover:text-gray-300 transition-colors mb-8 group"
          >
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={20} />
            Back to Hall of Champions
          </Link>

          <div className="text-center mb-12">
            <div className="mb-8 relative">
              <h1 className="text-7xl font-bold mb-4 tracking-wider animate-pulse" style={{color: '#ff72ef'}}>
                DARKSLAYERS
              </h1>
              <div className="flex justify-center items-center gap-4 mb-6">
                <div className="w-24 h-1 bg-gradient-to-r from-transparent via-gray-500 to-gray-300"></div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-2xl animate-pulse">⚔️</span>
                  <Skull className="text-white animate-bounce shadow-lg" style={{filter: 'drop-shadow(0 0 8px #ff72ef)'}} size={32} />
                  <span className="text-white text-2xl animate-pulse">🗡️</span>
                </div>
                <div className="w-24 h-1 bg-gradient-to-r from-gray-300 via-gray-500 to-transparent"></div>
              </div>
              <p className="text-2xl text-white mb-4">"{darkslayersData.motto}"</p>
              <div className="flex justify-center items-center gap-4 mb-4">
                <span className="text-3xl animate-bounce">🏴</span>
                <span className="text-2xl text-white">The Inaugural Champions</span>
                <span className="text-3xl animate-bounce" style={{animationDelay: '0.3s'}}>👑</span>
              </div>
              <div className="flex justify-center items-center gap-6 text-white">
                <span className="flex items-center gap-2">
                  <Shield size={20} />
                  Est. {darkslayersData.established}
                </span>
                <span className="flex items-center gap-2">
                  <Crown size={20} />
                  1x CTFPL Champion
                </span>
                <span className="flex items-center gap-2">
                  <Trophy size={20} />
                  {darkslayersData.seasonRecord.overall.wins}-{darkslayersData.seasonRecord.overall.losses}-{darkslayersData.seasonRecord.overall.draws} Overall
                </span>
                <span className="flex items-center gap-2">
                  <Award size={20} />
                  {darkslayersData.seasonRecord.playoffs.wins}-{darkslayersData.seasonRecord.playoffs.losses} Playoffs
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Championship Banner */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900/30 via-black/20 to-gray-800/60 backdrop-blur-sm border border-gray-500/30 flex justify-center">
          <img
            src="https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/darkslayers/ds1.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL2RhcmtzbGF5ZXJzL2RzMS5qcGciLCJpYXQiOjE3NTMxMzI2NjIsImV4cCI6MjM4Mzg1MjY2Mn0.50o9MRw6uRKeEEMDqJcEfHDukxbzIJR4JUtBtO-mSY4"
            alt="Darkslayers Season 1 Champions"
            className="w-[706px] h-[546px] object-contain opacity-90 rounded-lg"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50"></div>
          <div className="absolute bottom-8 left-8 right-8">
            <h2 className="text-4xl font-bold mb-2" style={{color: '#ff72ef'}}>CTFPL Season 1 Champions</h2>
            <p className="text-xl text-white mb-2">
              The Darkslayers made history as the inaugural CTFPL champions, setting the standard for all who followed.
            </p>
            <p className="text-lg text-gray-300">
              <span className="text-white">All-Time Record:</span> 87-29-5 | <span className="text-white">Playoffs:</span> 24-8
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="text-lg animate-pulse">⚔️</span>
              <span className="text-white">The Original Dynasty</span>
              <span className="text-lg animate-pulse">⚔️</span>
            </div>
          </div>
        </div>
      </div>


      {/* Legacy Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="text-center p-12 rounded-2xl bg-gradient-to-br from-gray-900/40 via-black/30 to-gray-800/60 backdrop-blur-sm border border-gray-500/30">
          <div className="flex justify-center items-center gap-4 mb-6">
            <span className="text-6xl animate-bounce">⚔️</span>
            <Skull className="text-white animate-pulse shadow-lg" style={{filter: 'drop-shadow(0 0 12px #ff72ef)'}} size={64} />
            <span className="text-6xl animate-bounce" style={{animationDelay: '0.5s'}}>👑</span>
          </div>
          <h2 className="text-4xl font-bold mb-6" style={{color: '#ff72ef'}}>The Darkslayers Legacy</h2>
          <p className="text-xl text-white max-w-4xl mx-auto leading-relaxed">
            Before there were dynasties, before there were legends, there were the Darkslayers. As the inaugural champions of CTFPL Season 1, they didn't just win a tournament—they created a legacy. Every squad that followed walked in the shadow of their achievement. Every champion since has chased the standard they set. In the annals of Infantry history, many names have been etched, but none carry the weight of being first. The Darkslayers weren't just champions; they were the foundation upon which an entire competitive ecosystem was built.
          </p>
          <div className="mt-8">
            <div className="flex justify-center items-center gap-2">
              <span className="text-xl animate-pulse">⚔️</span>
              <div className="w-32 h-1 bg-gradient-to-r from-gray-500 via-gray-400 to-gray-300 animate-pulse"></div>
              <span className="text-xl animate-pulse">⚔️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Squad Statistics */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center mb-12" style={{color: '#ff72ef'}}>Championship Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { label: 'Championships', value: darkslayersData.seasonRecord.championships, icon: Crown },
            { label: 'Total Wins', value: darkslayersData.seasonRecord.overall.wins, icon: Trophy },
            { label: 'Total Losses', value: darkslayersData.seasonRecord.overall.losses, icon: Target },
            { label: 'Total Draws', value: darkslayersData.seasonRecord.overall.draws, icon: Star },
            { label: 'Playoff Wins', value: darkslayersData.seasonRecord.playoffs.wins, icon: Award },
            { label: 'Playoff Losses', value: darkslayersData.seasonRecord.playoffs.losses, icon: Medal }
          ].map((stat, index) => (
            <div
              key={index}
              className="relative p-6 rounded-xl bg-gradient-to-br from-gray-900/30 via-black/20 to-gray-800/60 backdrop-blur-sm border border-gray-500/30 hover:border-gray-400/60 transition-all duration-300 group"
            >
              <div className="text-center">
                <stat.icon className="mx-auto text-white mb-4 group-hover:scale-110 transition-transform" size={40} />
                <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-gray-300">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Season-by-Season Records */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center mb-12" style={{color: '#ff72ef'}}>Season Records</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {darkslayersData.seasonRecord.seasonRecords.map((season, index) => (
            <div
              key={index}
              className={`relative p-6 rounded-xl backdrop-blur-sm border transition-all duration-300 group hover:scale-105 ${
                season.champion 
                  ? 'bg-gradient-to-br from-gray-900/40 via-black/30 to-gray-800/40 border-gray-400/40 hover:border-white/60' 
                  : season.runnerUp
                  ? 'bg-gradient-to-br from-gray-700/30 via-gray-800/20 to-gray-900/30 border-gray-400/30 hover:border-gray-300/60'
                  : season.thirdPlace
                  ? 'bg-gradient-to-br from-amber-900/20 via-yellow-900/15 to-orange-900/20 border-amber-600/20 hover:border-amber-500/40'
                  : 'bg-gradient-to-br from-gray-900/20 via-black/20 to-gray-800/40 border-gray-500/20 hover:border-gray-400/40'
              }`}
            >
              {season.champion && (
                <div className="absolute top-2 right-2">
                  <Crown style={{color: '#ff72ef'}} className="animate-pulse" size={20} />
                </div>
              )}
              {season.runnerUp && (
                <div className="absolute top-2 right-2">
                  <Award className="text-gray-300 animate-pulse" size={20} />
                </div>
              )}
              {season.thirdPlace && (
                <div className="absolute top-2 right-2">
                  <Medal className="text-amber-600 animate-pulse" size={20} />
                </div>
              )}
              
              <div className="text-center">
                <h3 className={`text-2xl font-bold mb-3 ${
                  season.champion ? '' 
                  : season.runnerUp ? 'text-gray-300' 
                  : season.thirdPlace ? 'text-amber-400'
                  : 'text-white'
                }`} style={season.champion ? {color: '#ff72ef'} : {}}>
                  CTFPL S{season.season}{season.champion ? '*' : season.runnerUp ? '°' : season.thirdPlace ? '^' : ''}
                </h3>
                {(season.wins > 0 || season.losses > 0 || season.draws > 0) && (
                  <div className={`text-xl font-bold mb-2 ${
                    season.champion ? 'text-white' 
                    : season.runnerUp ? 'text-gray-300' 
                    : season.thirdPlace ? 'text-amber-300'
                    : 'text-gray-300'
                  }`}>
                    {season.wins}-{season.losses}-{season.draws}
                  </div>
                )}
                <div className={`text-sm ${
                  season.champion ? 'text-gray-300' 
                  : season.runnerUp ? 'text-gray-400' 
                  : season.thirdPlace ? 'text-amber-200'
                  : 'text-gray-400'
                }`}>
                  {season.champion ? 'INAUGURAL CHAMPIONS' : season.runnerUp ? 'RUNNER-UP' : season.thirdPlace ? 'THIRD PLACE' : 'Season Record'}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-8">
          <p className="text-white text-lg">
            <span style={{color: '#ff72ef'}} className="font-bold">*</span> = Championship Season &nbsp;&nbsp;&nbsp;
            <span className="text-gray-400 font-bold">°</span> = Runner-up &nbsp;&nbsp;&nbsp;
            <span className="text-amber-400 font-bold">^</span> = Third Place
          </p>
        </div>
      </div>

      {/* Player Roster */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center mb-12" style={{color: '#ff72ef'}}>Darkslayers Roster</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {darkslayersData.players.map((player, index) => (
            <div
              key={index}
              className="relative p-4 rounded-xl bg-gradient-to-br from-gray-900/30 via-black/20 to-gray-800/60 backdrop-blur-sm border border-gray-500/30 hover:border-white/60 transition-all duration-300 group hover:scale-105"
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-white group-hover:text-gray-300 transition-colors mb-2">
                  {player.alias}
                </h3>
                <div className="text-gray-300 text-xs mb-2">
                  ({player.seasons.map(season => `S${season}`).join(', ')})
                </div>
                <div className="flex justify-center items-center gap-1 mb-2">
                  {[...Array(player.rings)].map((_, i) => (
                    <Crown key={i} style={{color: '#ff72ef'}} size={12} />
                  ))}
                </div>
                {player.rings > 0 && (
                  <div className="text-white text-sm font-bold">
                    {player.rings} Ring{player.rings !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default DarkslayersPage;