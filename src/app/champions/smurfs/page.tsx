'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Crown, Flame, Star, Shield, Sword, Target, Award, ArrowLeft, Medal } from 'lucide-react';
import Link from 'next/link';

const SmurfsPage = () => {
  const [scrollY, setScrollY] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<{src: string, alt: string, title: string} | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePhotoClick = (photo: {src: string, alt: string, title: string}) => {
    setSelectedPhoto(photo);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    };

    if (selectedPhoto) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [selectedPhoto]);

  const smurfsData = {
    name: 'Smurfs',
    abbreviation: 'SMURF',
    established: '2003',
    motto: 'Blue and Deadly',
    seasonRecord: {
      overall: { wins: 0, losses: 0, draws: 0 },
      championships: 1,
      runnerUps: 2,
      thirdPlace: 0,
      championshipSeasons: [8],
      runnerUpSeasons: [5, 9],
      thirdPlaceSeasons: [],
      seasonRecords: [
        { season: 5, wins: 0, losses: 0, draws: 0, champion: false, runnerUp: true, thirdPlace: false },
        { season: 6, wins: 0, losses: 0, draws: 0, champion: false, runnerUp: false, thirdPlace: false },
        { season: 7, wins: 0, losses: 0, draws: 0, champion: false, runnerUp: false, thirdPlace: false },
        { season: 8, wins: 0, losses: 0, draws: 0, champion: true, runnerUp: false, thirdPlace: false },
        { season: 9, wins: 0, losses: 0, draws: 0, champion: false, runnerUp: true, thirdPlace: false }
      ]
    },
    players: [
      { alias: 'Beso (Captain)', rings: 1 },
      { alias: 'Aborter', rings: 1 },
      { alias: 'Armor', rings: 1 },
      { alias: 'Eaglestriker', rings: 1 },
      { alias: 'Fausto/noob', rings: 1 },
      { alias: 'Hawkstriker', rings: 1 },
      { alias: 'Kal', rings: 1 },
      { alias: 'hehe`', rings: 1},
      { alias: 'jono!', rings: 1},
      { alias: 'NickGonzo', rings: 1 },
      { alias: 'Rendezvous/r', rings: 1 },
      { alias: 'Streaming', rings: 1 },
      { alias: 'Waldo/Magic 8 Ball', rings: 1 },
      { alias: 'Yushiz~', rings: 1 },
      { alias: 'aircanada', rings: 0},
      { alias: 'angel1ca (OG Capts)', rings: 0 },
      { alias: 'angelus', rings: 0 },
      { alias: 'Badz-Maru', rings: 0},
      { alias: 'Bole.', rings: 0 },
      { alias: 'c0mbo', rings: 0 },
      { alias: 'Evolution', rings: 0},
      { alias: 'Fordie\'', rings: 0 },
      { alias: 'John Woo', rings: 0 },
      { alias: 'Jrinx', rings: 0 },
      { alias: 'Kaizer./Reziak (OG Capts)', rings: 0 },
      { alias: 'Killer4Hire', rings: 0 },
      { alias: 'Killiptos', rings: 0 },
      { alias: 'MisticFusion', rings: 0 },
      { alias: 'Omega Ghost', rings: 0 },
      { alias: 'Ooi', rings: 0 },
      { alias: 'Raiden...', rings: 0 },
      { alias: 'RamboGurlie', rings: 0 },
      { alias: 'Rose\'', rings: 0 },
      { alias: 'sauciness', rings: 0 },
      { alias: 'Skunky', rings: 0 },
      { alias: 'Snowbooze', rings: 0 },
      { alias: 'superD.', rings: 0 },
      { alias: 'The |<orean', rings: 0},
      { alias: 'Tiger', rings: 0 },
      { alias: 'Twist.', rings: 0 },
      { alias: 'Tyrael', rings: 0 },
      { alias: 'Tyson/Android 17/Squalid', rings: 0 },
      { alias: 'Wendog', rings: 0 },
      { alias: 'Z Trigger', rings: 0 },
    ]
  };

  // Dragon Eyes Parallax Component (now "Smurf Eyes" with blue colors)
  const SmurfEyes = () => (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div 
        className="absolute top-20 left-10 w-16 h-16 rounded-full bg-gradient-to-r from-blue-700 to-cyan-500 opacity-30 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.1}px)` }}
      >
        <div className="absolute inset-2 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full animate-ping"></div>
      </div>
      <div 
        className="absolute top-32 right-16 w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 opacity-25 animate-pulse"
        style={{ transform: `translateY(${scrollY * 0.15}px)` }}
      >
        <div className="absolute inset-3 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full animate-ping"></div>
      </div>
    </div>
  );

  // Fire Breathing Animation Component (now "Blue Fire" with blue/cyan colors)
  const BlueFireBreath = ({ visible }: { visible: boolean }) => (
    <div className={`transition-all duration-1000 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
      <div className="relative w-full h-32 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bottom-0 w-4 h-8 bg-gradient-to-t from-blue-700 via-cyan-500 to-blue-300 rounded-full animate-pulse"
            style={{
              left: `${10 + i * 4}%`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
              transform: `scaleY(${0.5 + Math.random() * 1})`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/30 via-cyan-900/20 to-transparent"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900/40 to-green-950/30 relative overflow-hidden">
      <SmurfEyes />
      
      {/* Animated Smurf-themed Background */}
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
            <Star className="text-blue-400 opacity-40" size={3 + Math.random() * 8} />
          </div>
        ))}
        {/* Smurf Village Elements */}
        {[...Array(10)].map((_, i) => (
          <div
            key={`smurf-${i}`}
            className="absolute text-2xl opacity-30 animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          >
            {Math.random() > 0.5 ? '🍄' : '⭐'}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <Link
            href="/champions"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mb-8 group"
          >
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={20} />
            Back to Hall of Champions
          </Link>

          <div className="text-center mb-12">
            <div className="mb-8 relative">
              <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-300 mb-4 tracking-wider animate-pulse">
                SMURFS
              </h1>
              <div className="flex justify-center items-center gap-4 mb-6">
                <div className="w-24 h-1 bg-gradient-to-r from-transparent via-blue-500 to-cyan-500"></div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 text-2xl animate-pulse">🍄</span>
                  <Star className="text-cyan-500 animate-bounce shadow-lg" style={{filter: 'drop-shadow(0 0 8px #06b6d4)'}} size={32} />
                  <span className="text-red-500 text-2xl animate-pulse">🧙‍♂️</span>
                </div>
                <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-transparent"></div>
              </div>
              <p className="text-2xl text-cyan-200 mb-4">"{smurfsData.motto}"</p>
              <div className="flex justify-center items-center gap-4 mb-4">
                <span className="text-3xl animate-bounce">🏠</span>
                <span className="text-2xl text-blue-400">Welcome to Smurf Village</span>
                <span className="text-3xl animate-bounce" style={{animationDelay: '0.3s'}}>🌲</span>
              </div>
              <div className="flex justify-center items-center gap-6 text-blue-300">
                <span className="flex items-center gap-2">
                  <Shield size={20} />
                  Est. {smurfsData.established}
                </span>
                <span className="flex items-center gap-2">
                  <Crown size={20} />
                  1x CTFPL Champion
                </span>
                <span className="flex items-center gap-2">
                  <Award size={20} />
                  2x Runner-up
                </span>
                <span className="flex items-center gap-2">
                  <Medal size={20} />
                  1x Third Place
                </span>
                <span className="flex items-center gap-2">
                  <Trophy size={20} />
                  {smurfsData.seasonRecord.overall.wins}-{smurfsData.seasonRecord.overall.losses}-{smurfsData.seasonRecord.overall.draws} Overall
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Championship Banner */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30 flex justify-center">
          <img
            src="https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/Smurfs_S8_Champions.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9TbXVyZnNfUzhfQ2hhbXBpb25zLmpwZyIsImlhdCI6MTc1MjQzMDQyNiwiZXhwIjoyMzgzMTUwNDI2fQ.gjobokvIF6tD-ruk3U1BE3-Au59Yj5A9b9a7L68L4bY"
            alt="Smurfs Season 8 Champions"
            className="w-[706px] h-[546px] object-contain opacity-90 rounded-lg"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50"></div>
          <div className="absolute bottom-8 left-8 right-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <span className="text-2xl">🏆</span>
              <span className="text-2xl">🍄</span>
              <span className="text-2xl">🏆</span>
            </div>
            <h2 className="text-4xl font-bold text-cyan-400 mb-2">1x CTFPL Champions</h2>
            <p className="text-xl text-cyan-200 mb-2">
              The Smurfs conquered Season 8, leaving a blue mark in CTFPL history.
            </p>
            <p className="text-lg text-gray-300">
              <span className="text-gray-400">Runner-up:</span> Seasons 5, 9 &nbsp;|&nbsp; 
              <span className="text-amber-600">Third Place:</span> Season 6
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="text-lg animate-pulse">🧙‍♂️</span>
              <span className="text-blue-400">Papa Smurf's Champions</span>
              <span className="text-lg animate-pulse">🧙‍♂️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Smurfs Infantry Battle Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30">
          <div className="flex justify-center items-center py-8 px-6">
            <div className="text-center max-w-4xl">
              <div className="flex justify-center items-center gap-4 mb-6">
                <span className="text-3xl animate-bounce">🍄</span>
                <h2 className="text-3xl font-bold text-cyan-400">Smurfs in the Infantry Battlefield</h2>
                <span className="text-3xl animate-bounce" style={{animationDelay: '0.5s'}}>⚔️</span>
              </div>
              
              {/* AI-generated Smurfs battle image */}
              <div className="relative rounded-lg overflow-hidden mb-6 border border-cyan-500/30">
                <img 
                  src="https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/ai_smurfs_battle.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9haV9zbXVyZnNfYmF0dGxlLnBuZyIsImlhdCI6MTc1MjQzMTM2NCwiZXhwIjoyMzgzMTUxMzY0fQ.T-M1lKBdcze2tyqUtRMJ2_4jcC5_vhgwLTxn6yyITZI"
                  alt="AI-generated Smurfs charging into Infantry battle"
                  className="w-full h-32 md:h-40 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
              
              <div className="flex justify-center items-center gap-6 text-blue-300">
                <span className="flex items-center gap-2">
                  <span className="text-xl">🏆</span>
                  Championship Glory
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  Infantry Legends
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xl">🍄</span>
                  Smurf Power
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legacy Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <div className="text-center p-12 rounded-2xl bg-gradient-to-br from-blue-900/40 via-cyan-900/30 to-black/60 backdrop-blur-sm border border-blue-500/30">
          <div className="flex justify-center items-center gap-4 mb-6">
            <span className="text-6xl animate-bounce">🍄</span>
            <Star className="text-cyan-500 animate-pulse shadow-lg" style={{filter: 'drop-shadow(0 0 12px #06b6d4)'}} size={64} />
            <span className="text-6xl animate-bounce" style={{animationDelay: '0.5s'}}>🏠</span>
          </div>
          <h2 className="text-4xl font-bold text-cyan-400 mb-6">The Smurfs' Legacy</h2>
          <p className="text-xl text-cyan-200 max-w-4xl mx-auto leading-relaxed">
            From nobodies to champions. What began as a core squad of underdogs transformed into one of the most respected teams in Infantry history. Their journey was anything but easy—grinding through the brutal gauntlet of BDS, CC, and more. Its history dates back all the way to 2003, with ange1ica, Duffman, and Kaizer starting RWAR that converted into Smurfs. Brief drama ensued was Duffman (the captain at the time) left the squad high and dry. However, the squad was able to bounce back. The lengthy history Season 8 didn't just crown them 1x champions—it proved that with a strong leader in Beso and unwavering brotherhood, greatness was earned, not given. The Smurfs may not be the most decorated, but their rise became a symbol: respect is forged through the climb, not the count.
          </p>
          <div className="mt-8">
            <div className="flex justify-center items-center gap-2">
              <span className="text-xl animate-pulse">🍄</span>
              <div className="w-32 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-300 animate-pulse"></div>
              <span className="text-xl animate-pulse">🍄</span>
            </div>
          </div>
        </div>
      </div>

      {/* Squad Statistics */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-cyan-400 mb-12">Championship Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { label: 'Championships', value: smurfsData.seasonRecord.championships, icon: Crown },
            { label: 'Runner-ups', value: smurfsData.seasonRecord.runnerUps, icon: Award },
            { label: 'Third Place', value: smurfsData.seasonRecord.thirdPlace, icon: Medal },
            { label: 'Total Wins', value: smurfsData.seasonRecord.overall.wins, icon: Trophy },
            { label: 'Total Losses', value: smurfsData.seasonRecord.overall.losses, icon: Target },
            { label: 'Total Draws', value: smurfsData.seasonRecord.overall.draws, icon: Star }
          ].map((stat, index) => (
            <div
              key={index}
              className="relative p-6 rounded-xl bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30 hover:border-cyan-400/60 transition-all duration-300 group"
            >
              <div className="text-center">
                <stat.icon className="mx-auto text-cyan-400 mb-4 group-hover:scale-110 transition-transform" size={40} />
                <div className="text-3xl font-bold text-cyan-300 mb-2">{stat.value}</div>
                <div className="text-blue-300">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Season-by-Season Records */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-cyan-400 mb-12">Season Records</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {smurfsData.seasonRecord.seasonRecords.map((season, index) => (
            <div
              key={index}
              className={`relative p-6 rounded-xl backdrop-blur-sm border transition-all duration-300 group hover:scale-105 ${
                season.champion 
                  ? 'bg-gradient-to-br from-cyan-900/30 via-blue-900/20 to-blue-900/30 border-cyan-500/30 hover:border-cyan-400/60' 
                  : season.runnerUp
                  ? 'bg-gradient-to-br from-gray-700/30 via-gray-800/20 to-gray-900/30 border-gray-400/30 hover:border-gray-300/60'
                  : season.thirdPlace
                  ? 'bg-gradient-to-br from-amber-900/20 via-yellow-900/15 to-orange-900/20 border-amber-600/20 hover:border-amber-500/40'
                  : 'bg-gradient-to-br from-blue-900/20 via-gray-900/20 to-black/40 border-blue-500/20 hover:border-blue-400/40'
              }`}
            >
              {season.champion && (
                <div className="absolute top-2 right-2">
                  <Crown className="text-cyan-400 animate-pulse" size={20} />
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
                  season.champion ? 'text-cyan-400' 
                  : season.runnerUp ? 'text-gray-300' 
                  : season.thirdPlace ? 'text-amber-400'
                  : 'text-blue-300'
                }`}>
                  CTFPL S{season.season}{season.champion ? '*' : season.runnerUp ? '°' : season.thirdPlace ? '^' : ''}
                </h3>
                {(season.wins > 0 || season.losses > 0 || season.draws > 0) && (
                  <div className={`text-xl font-bold mb-2 ${
                    season.champion ? 'text-cyan-300' 
                    : season.runnerUp ? 'text-gray-300' 
                    : season.thirdPlace ? 'text-amber-300'
                    : 'text-gray-300'
                  }`}>
                    {season.wins}-{season.losses}-{season.draws}
                  </div>
                )}
                <div className={`text-sm ${
                  season.champion ? 'text-cyan-200' 
                  : season.runnerUp ? 'text-gray-400' 
                  : season.thirdPlace ? 'text-amber-200'
                  : 'text-gray-400'
                }`}>
                  {season.champion ? 'CHAMPIONS' : season.runnerUp ? 'RUNNER-UP' : season.thirdPlace ? 'THIRD PLACE' : 'Season Record'}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-8">
          <p className="text-cyan-300 text-lg">
            <span className="text-cyan-400 font-bold">*</span> = Championship Season &nbsp;&nbsp;&nbsp;
            <span className="text-gray-400 font-bold">°</span> = Runner-up &nbsp;&nbsp;&nbsp;
            <span className="text-amber-400 font-bold">^</span> = Third Place
          </p>
        </div>
      </div>

      {/* Player Roster */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-cyan-400 mb-12">Smurfs Roster</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {smurfsData.players.map((player, index) => (
            <div
              key={index}
              className="relative p-4 rounded-xl bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30 hover:border-cyan-400/60 transition-all duration-300 group hover:scale-105"
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors mb-2">
                  {player.alias}
                </h3>
                <div className="flex justify-center items-center gap-1 mb-2">
                  {[...Array(player.rings)].map((_, i) => (
                    <Crown key={i} className="text-cyan-400" size={12} />
                  ))}
                </div>
                {player.rings > 0 && (
                  <div className="text-cyan-300 text-sm font-bold">
                    {player.rings} Ring{player.rings !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Photo Memories Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-cyan-400 mb-12">Photo Memories</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/all%20death.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9hbGwgZGVhdGguanBnIiwiaWF0IjoxNzUyNDMyNzQwLCJleHAiOjIzODMxNTI3NDB9.7VT0NCQtdbpBiGC_eOCzcWdEEGJBXzLmNbMoqsrB61Q",
              alt: "All Death Screenshot",
              title: "All Death"
            },
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/kal.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9rYWwuanBnIiwiaWF0IjoxNzUyNDMyNzgwLCJleHAiOjIzODMxNTI3ODB9.TGN9BTiLVmOcW8LkXVYcwFye7EYxtrIXT2QYRne86H4",
              alt: "Kal Screenshot",
              title: "Kal in Action"
            },
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/naded2.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9uYWRlZDIuanBnIiwiaWF0IjoxNzUyNDMyNzk2LCJleHAiOjIzODMxNTI3OTZ9.KYWvtP9YEBig75FMQGGgF3ErzHX9FWucShPBT1wPzJg",
              alt: "Naded 2 Screenshot",
              title: "Naded Action 2"
            },
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/naded!.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9uYWRlZCEuanBnIiwiaWF0IjoxNzUyNDMyODExLCJleHAiOjIzODMxNTI4MTF9.LA8MuR7y2F3HUB6_TDjW6pXU6CSLJ2EHfAVW9OL3fZo",
              alt: "Naded! Screenshot",
              title: "Naded!"
            },
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/smurfs.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9zbXVyZnMuanBnIiwiaWF0IjoxNzUyNDMyODI2LCJleHAiOjIzODMxNTI4MjZ9.By2kihXxkJCxILArviRxS6b9xDG6krbPYh7NNKvALdw",
              alt: "Smurfs Screenshot",
              title: "Smurfs Squad"
            },
            {
              src: "https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/team.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy90ZWFtLmpwZyIsImlhdCI6MTc1MjQzMjgzOSwiZXhwIjoyMzgzMTUyODM5fQ.QmqsZq0YLbaftZtFvsCjNFaq9IguY85mAGxedRJUeoY",
              alt: "Team Screenshot",
              title: "Team Formation"
            }
          ].map((photo, index) => (
            <div
              key={index}
              className="relative group rounded-xl overflow-hidden bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30 hover:border-cyan-400/60 transition-all duration-300 hover:scale-105 cursor-pointer"
              onClick={() => handlePhotoClick(photo)}
            >
              <div className="relative h-64 overflow-hidden">
                <img
                  src={photo.src}
                  alt={photo.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* Click indicator */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-cyan-500/80 text-white rounded-full p-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Photo title */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-lg font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors">
                  {photo.title}
                </h3>
              </div>
              
              {/* Animated border effect */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-cyan-400/50 rounded-xl transition-all duration-300 pointer-events-none">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-8">
          <div className="flex justify-center items-center gap-2">
            <span className="text-xl animate-pulse">📸</span>
            <p className="text-cyan-300 text-lg">Memories from the battlefield</p>
            <span className="text-xl animate-pulse">🍄</span>
          </div>
        </div>
      </div>

      {/* Historical Archives Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 mb-16">
        <h2 className="text-4xl font-bold text-center text-cyan-400 mb-12">Historical Archives</h2>

        <div className="text-center mt-8">
          <div className="flex justify-center items-center gap-2 mb-4">
            <span className="text-xl animate-pulse">⏳</span>
            <p className="text-cyan-300 text-lg">Preserved history from Infantry-Sector.com</p>
            <span className="text-xl animate-pulse">📚</span>
          </div>
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            These archived links preserve the original Infantry community websites and tournament records. 
            Links open via Wayback Machine to show historical content as it appeared during the Smurfs' era.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              title: "RWAR History Archive",
              description: "Complete history of the RWAR (Real War Action Reality) tournament series",
              url: "https://web.archive.org/web/20040705162823/http://www.infantry-sector.com/rwar/history.php",
              date: "July 2004",
              icon: "📜"
            },
            {
              title: "Squad Album & Biographies",
              description: "Detailed biographies and photo albums of all participating squads",
              url: "https://web.archive.org/web/20040714061944/http://www.infantry-sector.com/rwar/album-bios/",
              date: "July 2004",
              icon: "📸"
            },
            {
              title: "RWAR Awards & Recognition",
              description: "Awards, achievements, and recognition for outstanding performances",
              url: "https://web.archive.org/web/20050207045219/http://www.infantry-sector.com:80/rwar/awards.php",
              date: "February 2005",
              icon: "🏆"
            },
            {
              title: "Season 5 Squad Profiles",
              description: "Specific squad biographies and profiles from the historic Season 5",
              url: "http://web.archive.org/web/20040714062604/http://www.infantry-sector.com/rwar/album-bios/season5.htm",
              date: "July 2004",
              icon: "🥈"
            }
          ].map((archive, index) => (
            <div
              key={index}
              className="relative group rounded-xl overflow-hidden bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-black/60 backdrop-blur-sm border border-blue-500/30 hover:border-cyan-400/60 transition-all duration-300 hover:scale-105"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="text-3xl animate-pulse">
                    {archive.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors mb-2">
                      {archive.title}
                    </h3>
                    <p className="text-gray-300 text-sm mb-3 leading-relaxed">
                      {archive.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <span>🕐</span>
                        Archived: {archive.date}
                      </span>
                      <a
                        href={archive.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-cyan-200 rounded-lg transition-all duration-300 text-sm font-medium group-hover:scale-105"
                      >
                        View Archive
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Animated border effect */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-cyan-400/50 rounded-xl transition-all duration-300 pointer-events-none">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div className="relative max-w-6xl max-h-[90vh] mx-4">
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute -top-12 right-0 text-white hover:text-cyan-400 transition-colors z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Image container */}
            <div
              className="relative rounded-lg overflow-hidden border-2 border-cyan-500/30"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.alt}
                className="max-w-full max-h-[80vh] object-contain"
              />
              
              {/* Image title overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <h3 className="text-2xl font-bold text-cyan-300 mb-2">
                  {selectedPhoto.title}
                </h3>
                <p className="text-cyan-200 text-sm">
                  Click outside or press ESC to close
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmurfsPage;