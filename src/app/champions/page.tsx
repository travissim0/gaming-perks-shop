'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Crown, Star, Sword, Shield } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import SeasonWinnersModal from '@/components/SeasonWinnersModal';

const ChampionArchives = () => {
  const { user } = useAuth();
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const seasonRecords = {
    'Season 1': { goldenFlag: 'Darkslayers',            silverFlag: 'Epidemic',             bronzeFlag: 'Aoi', date: null },
    'Season 2': { goldenFlag: 'N/A',                    silverFlag: 'N/A',                  bronzeFlag: 'N/A', date: null },
    'Season 3': { goldenFlag: 'Black Dragon Society',   silverFlag: 'Martyr',               bronzeFlag: 'Epidemic', date: null },
    'Season 4': { goldenFlag: 'Black Dragon Society',   silverFlag: 'Shadow Syndicate',     bronzeFlag: 'Darkslayers', date: null },
    'Season 5': { goldenFlag: 'Black Dragon Society',   silverFlag: 'Smurfs',               bronzeFlag: 'Shadow Syndicate', date: null },
    'Season 6': { goldenFlag: 'Black Dragon Society',   silverFlag: 'Martyr',               bronzeFlag: 'Ephemera', date: null },
    'Season 7': { goldenFlag: 'Camp Chaos',             silverFlag: 'Black Dragon Society', bronzeFlag: '(TIE) Martyr, Murderous Plush Toys', date: null },
    'Season 8': { goldenFlag: 'Smurfs',                 silverFlag: 'Camp Chaos',           bronzeFlag: '(TIE) Black Dragon Society, Emi', date: '07-17-2005' },
    'Season 9': { goldenFlag: 'kuk',                    silverFlag: 'Smurfs',               bronzeFlag: 'Redemption', date: null },
    'Season 10': { goldenFlag: 'Black Dragon Society',  silverFlag: 'Memento',              bronzeFlag: '(TIE) Ascension, Sunday School', date: '09-03-2006' },
    'Season 11': { goldenFlag: 'Newfie',                silverFlag: 'Black Dragon Society', bronzeFlag: 'Bingo', date: '05-27-2007' },
    'Season 12': { goldenFlag: 'Newfie',                silverFlag: 'Martyr',               bronzeFlag: '(TIE) Black Dragon Society, kuk', date: null },
    'Season 13': { goldenFlag: 'Black Dragon Society',  silverFlag: 'ASAP',                 bronzeFlag: '(TIE) kuk, Phoenix Down', date: null },
    'Season 14': { goldenFlag: 'Halogen',               silverFlag: 'Phoenix Down',         bronzeFlag: '(TIE) Black Dragon Society, kuk', date: null },
    'Season 15': { goldenFlag: 'Redemption',            silverFlag: 'Black Dragon Society', bronzeFlag: '(TIE) Wartortle, Phoenix Down', date: null },
    'Season 16': { goldenFlag: 'Black Dragon Society',  silverFlag: 'Cobra Kai',            bronzeFlag: '(TIE) MONSTERHOUSE, Thunder Cunts', date: null },
    'Season 17': { goldenFlag: 'Black Dragon Society',  silverFlag: 'Fracture',             bronzeFlag: '(TIE) MONSTERHOUSE, Camp Kill Yourself', date: null },
    'Season 18': { goldenFlag: 'Canucks',               silverFlag: 'N/A',                  bronzeFlag: null, date: null },
    'Season 19': { goldenFlag: 'Canucks',               silverFlag: 'N/A',                  bronzeFlag: null, date: null },
    'Season 20': { goldenFlag: 'Pure Talent',           silverFlag: 'N/A',                  bronzeFlag: null, date: null },
    'Season 21': { goldenFlag: 'Pure Talent',           silverFlag: 'Camp Kill Yourself',   bronzeFlag: null, date: '08-30-2015' }
  };

  const championSquads = [
    {
      id: 'bds',
      name: 'Black Dragon Society',
      abbreviation: 'BDS',
      seasons: ['Season 3', 'Season 4', 'Season 5', 'Season 6', 'Season 10', 'Season 13', 'Season 16', 'Season 17'],
      runnerUpSeasons: ['Season 7', 'Season 11', 'Season 15'],
      thirdPlaceSeasons: ['Season 8', 'Season 12', 'Season 14'],
      participatedSeasons: ['Season 3', 'Season 4', 'Season 5', 'Season 6', 'Season 7', 'Season 8', 'Season 10', 'Season 11', 'Season 12', 'Season 13', 'Season 14', 'Season 15', 'Season 16', 'Season 17'],
      titles: 8,
      description: 'Legendary dynasty that conquered eight CTFPL championships, the most dominant squad in Infantry history.',
      image: '/images/champion squads/BDS/BDS_S10_Champions.jpg',
      theme: 'dragon',
      established: '2001'
    },
    {
      id: 'darkslayers',
      name: 'Darkslayers',
      abbreviation: 'DS',
      seasons: ['Season 1'],
      participatedSeasons: ['Season 1', 'Season 2', 'Season 3', 'Season 4', 'Season 5'],
      titles: 1,
      description: 'The inaugural CTFPL champions who set the foundation for all future squads. The original dynasty.',
      image: 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/darkslayers/ds1.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL2RhcmtzbGF5ZXJzL2RzMS5qcGciLCJpYXQiOjE3NTMxMzI2NjIsImV4cCI6MjM4Mzg1MjY2Mn0.50o9MRw6uRKeEEMDqJcEfHDukxbzIJR4JUtBtO-mSY4',
      theme: 'darkslayers',
      established: '2002'
    },
    {
      id: 'smurfs',
      name: 'Smurfs',
      abbreviation: 'SMURF',
      seasons: ['Season 8'],
      runnerUpSeasons: ['Season 5', 'Season 9'],
      participatedSeasons: ['Season 5', 'Season 6', 'Season 7', 'Season 8', 'Season 9'],
      titles: 1,
      description: 'Legendary squad from nobodies and never quit attitude to PL Champions that shocked the league.',
      image: 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/squads/champions/smurfs/Smurfs_S8_Champions.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcXVhZHMvY2hhbXBpb25zL3NtdXJmcy9TbXVyZnNfUzhfQ2hhbXBpb25zLmpwZyIsImlhdCI6MTc1MjQzMDQyNiwiZXhwIjoyMzgzMTUwNDI2fQ.gjobokvIF6tD-ruk3U1BE3-Au59Yj5A9b9a7L68L4bY',
      theme: 'smurfs',
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

  const [modalSeason, setModalSeason] = useState<number | null>(null);

  const seasonWinners: Record<number, string[]> = {
    17: ["Aborter", "Dro", "Flair", "Gallet", "Goliath", "Keyser", "LiNgo", "Mighty Mouse", "Nac", "panT", "Plaps", "Polo", "Revenge", "Rhylic", "shadow", "Smoka", "Terminator", "Thor", "Tyrael", "Whirlwind", "Seifer"],
    16: ["Angela", "Boss", "Dilatory", "Flair", "FlyMolo", "Goliath", "Gravity", "Kev", "LiNgo", "Nac", "panT", "Plaps", "Price Tag", "Prisoner", "Rhylic", "Smoka", "Thor", "Whirlwind", "Seifer"],
    15: ["Aborter", "An RR User", "anjro", "aqua", "Bango", "Daventry", "District", "Eggrolls", "Ghost Dance", "Got Tsolvy?", "Jerrett", "Les Savy Fav", "Silly Wanker", "sor", "The Korean", "Verb", "Waldo", "Whirlwind", "WolveN"],
    14: ["An RR User", "Big Fat Noob", "Chuckie", "Croix de Guerre", "Dilatory", "District", "Dodge", "Goliath", "Iron Monkey", "Kiss", "Mamba", "nox", "Playstation", "shadow", "shaw", "Sov", "Whirlwind", "Yah"],
    13: ["Angelus", "Blackchaoz", "Emp", "Flair", "Matt", "Nothing", "panT", "Prisoner", "Rhylic", "Rocky", "Thor", "WolveN", "Seifer"],
    12: ["Dank", "Alaris", "albert", "Designer", "Doug", "Emp", "Force", "hans", "mugi", "nac", "Nemesis", "Nothing", "Pintsize", "Polaris", "Rocky", "Shawnv", "SMEG", "Taylor", "WolveN", "Yeh"],
    11: ["albert", "dcman", "Designer", "Dilatory", "Doug", "Emp", "Force", "Nothing", "Polaris", "Primal", "Rocky", "Ron", "SMEG", "Taylor", "WolveN"],
    10: ["Mights", "albert", "Angelus", "Designer", "Flair", "FlyMolo", "Lingo", "Moon Shine", "Mugi", "Penguin", "Plaps", "Polo", "Prisoner", "Rhylic", "The Korean", "Thor", "Seifer"],
    9: ["Homsar", "Flave", "aqua", "Blackchaoz", "Daventry", "Defect", "destiny", "funk", "Itsuken", "Nothing", "Pheer", "platinum", "Rambo", "ron", "Soup", "tyson", "Zard"],
    8: ["Kal", "NickGonzo", "noob", "Aborter", "Armor", "Beso", "Eaglestriker", "Hawkstriker", "Jono!", "Mant", "Mugi", "Pistor", "r", "Streaming", "tyson", "Waldo", "Yushiz"],
    7: ["br0od", "hotman homsar", "blissid", "Angelus", "Chuckie", "Herthbul", "Jaxis", "Jericho", "John", "Les Savy Fav", "Penguind", "ron", "RuFo", "Strike", "Verb", "Yak"],
    6: ["Amplifier", "Emp", "Forcer", "funk", "Plaps", "Prisoner", "Rhylic", "Strike", "Thor", "Seifer"],
    5: ["An RR User", "Angelus", "Emp", "Herthbal", "Plaps", "Prisoner", "Rhylic", "Strike", "Thor", "Seifer"],
    4: ["Amplifier", "An RR User", "Angelus", "Carrilion", "Emp", "funk", "Herthbul", "John", "Plaps", "Prisoner", "Rhylic", "Strike", "Thor", "Seifer"],
    3: ["An RR User", "Carnillion", "Emp", "Pheer", "Plaps", "Prisoner", "Rhylic", "Thor", "Seifer"],
    2: [],
    1: ["Dr@gon", "Wen", "Shugotenshi", "TurboFrog", "Captain Ax", "SilentDrum", "FishBrain", "BaBo-", "DrkCloudXX", "Cyrus Alexander", "Daventry", "Mr. Mackaveli", "Pinkyz-Head", "vicks minty", "XXXXX"]
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
                      {squad.runnerUpSeasons && squad.runnerUpSeasons.length > 0 && (
                        <div className="text-gray-300 mb-1">
                          🥈 Runner-up: {squad.runnerUpSeasons.join(', ')}
                        </div>
                      )}
                      {squad.thirdPlaceSeasons && squad.thirdPlaceSeasons.length > 0 && (
                        <div className="text-amber-600 mb-1">
                          🥉 Third Place: {squad.thirdPlaceSeasons.join(', ')}
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

        {/* Season Records */}
        <div className="mt-16 mb-12">
          <h2 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 mb-8 tracking-wider">
            SEASON RECORDS
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto mb-8"></div>
          <div className="text-center mb-4">
            <span className="inline-block bg-cyan-900/60 text-cyan-200 px-4 py-2 rounded-full text-sm shadow border border-cyan-700">
              Tip: Click any season record tile to view the full list of player champions for that season!
            </span>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/60 via-gray-900/60 to-black/60 backdrop-blur-sm border border-yellow-500/20 rounded-xl p-6 max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(seasonRecords).map(([season, record]) => {
                // Extract season number from "Season X" format
                const seasonNumber = parseInt(season.replace('Season ', ''));
                return (
                  <div 
                    key={season}
                    className="bg-gradient-to-br from-gray-700/40 to-gray-800/40 rounded-lg p-4 border border-gray-600/30 hover:border-yellow-400/40 transition-all duration-300 cursor-pointer"
                    onClick={() => setModalSeason(seasonNumber)}
                  >
                  <h3 className="text-lg font-bold text-yellow-400 mb-3 text-center border-b border-gray-600/50 pb-2">
                    {season}
                  </h3>
                  
                  <div className="space-y-2 text-sm">
                    {/* Gold */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Trophy className="text-yellow-400" size={16} />
                        <span className="text-yellow-400 font-semibold">Gold:</span>
                      </div>
                      <span className="text-gray-200 flex-1">{record.goldenFlag}</span>
                    </div>
                    
                    {/* Silver */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Trophy className="text-gray-400" size={16} />
                        <span className="text-gray-400 font-semibold">Silver:</span>
                      </div>
                      <span className="text-gray-200 flex-1">{record.silverFlag}</span>
                    </div>
                    
                    {/* Bronze */}
                    {record.bronzeFlag && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Trophy className="text-amber-600" size={16} />
                          <span className="text-amber-600 font-semibold">Bronze:</span>
                        </div>
                        <span className="text-gray-200 flex-1">{record.bronzeFlag}</span>
                      </div>
                    )}
                    
                    {/* Date */}
                    {record.date && (
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-600/30">
                        <span className="text-gray-500 text-xs">Date:</span>
                        <span className="text-gray-400 text-xs">{record.date}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
      <SeasonWinnersModal
        open={!!modalSeason}
        onClose={() => setModalSeason(null)}
        season={modalSeason}
        winners={
          modalSeason && seasonWinners[modalSeason]
            ? [...seasonWinners[modalSeason]].sort((a, b) => a.localeCompare(b))
            : []
        }
      />
    </div>
  );
};

export default ChampionArchives; 