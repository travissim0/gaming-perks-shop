'use client';

import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

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

interface GamePlayer {
  alias: string;
  team: 'Titan' | 'Collective';
  class: string;
  isOffense: boolean;
  weapon?: string;
}

interface GameData {
  arenaName: string | null;
  gameType: string | null;
  baseUsed: string | null;
  players: GamePlayer[];
  lastUpdated: string | null;
}

interface OnlineUser {
  id: string;
  in_game_alias: string;
  last_seen: string;
  squad_name?: string;
  squad_tag?: string;
  role?: string;
}

interface Squad {
  id: string;
  name: string;
  tag: string;
  member_count: number;
  captain_alias: string;
}

interface Match {
  id: string;
  title: string;
  scheduled_at: string;
  squad_a_name?: string;
  squad_b_name?: string;
  status: string;
  match_type: string;
}

export default function Home() {
  const { user, loading } = useAuth();
  const [recentPatchNotes, setRecentPatchNotes] = useState<string>('');
  const [latestUpdateDate, setLatestUpdateDate] = useState<string>('');
  const [serverData, setServerData] = useState<ServerData>({
    zones: [],
    stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
    lastUpdated: ''
  });
  const [gameData, setGameData] = useState<GameData>({
    arenaName: null,
    gameType: null,
    baseUsed: null,
    players: [],
    lastUpdated: null
  });
  const [recentDonations, setRecentDonations] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [topSquads, setTopSquads] = useState<Squad[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  
  // Carousel and animation states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  
  // Banner slides data
  const bannerSlides = [
    {
      title: "FREE INFANTRY",
      subtitle: "Capture the Flag: Player's League",
      description: "🎮 Competitive Gaming Platform",
      highlight: "Join the Battle",
      color: "cyan"
    },
    {
      title: "ACTIVE SQUADS",
      subtitle: "Form Elite Teams",
      description: "🛡️ Create or Join Competitive Squads",
      highlight: "Build Your Team",
      color: "purple"
    },
    {
      title: "LIVE MATCHES",
      subtitle: "Compete in Real-Time",
      description: "⚔️ Schedule and Play Competitive Matches",
      highlight: "Enter the Arena",
      color: "green"
    },
    {
      title: "SUPPORT THE GAME",
      subtitle: "Keep Infantry Online Running",
      description: "💰 Donate to Support Development",
      highlight: "Make a Difference",
      color: "yellow"
    }
  ];

  useEffect(() => {
    if (user) {
      // Fetch recent patch notes for logged-in users
      const fetchRecentPatchNotes = async () => {
        try {
          const response = await fetch('/api/patch-notes');
          if (response.ok) {
            const data = await response.json();
            const content = data.content || '';
            
            // Extract the most recent update (first few lines)
            const lines = content.split('\n');
            let recentContent = '';
            let foundFirstDate = false;
            let dateFound = '';
            
            for (let i = 0; i < lines.length && i < 15; i++) {
              const line = lines[i];
              // Look for date patterns
              if (line.includes('~6') || /\w{3} \d{1,2}, \d{4}/.test(line)) {
                if (!foundFirstDate) {
                  foundFirstDate = true;
                  dateFound = line.replace(/~6/g, '').trim();
                  recentContent += line + '\n';
                } else {
                  break; // Stop at second date
                }
              } else if (foundFirstDate) {
                recentContent += line + '\n';
                if (recentContent.split('\n').length > 8) break; // Limit to ~8 lines
              } else {
                recentContent += line + '\n';
              }
            }
            
            setRecentPatchNotes(recentContent.trim());
            setLatestUpdateDate(dateFound);
          }
        } catch (error) {
          console.error('Error fetching patch notes:', error);
        }
      };
      
      fetchRecentPatchNotes();
    }
    
    // Scroll effect handler
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    // Carousel auto-advance
    const carouselInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 5000); // Change slide every 5 seconds
    
    window.addEventListener('scroll', handleScroll);
    
    // Fetch server data for all users
    const fetchServerData = async () => {
      try {
        const response = await fetch('/api/server-status');
        if (response.ok) {
          const data = await response.json();
          setServerData(data);
        }
      } catch (error) {
        console.error('Error fetching server data:', error);
      }
    };
    
    // Fetch game data
    const fetchGameData = async () => {
      try {
        const response = await fetch('/api/game-data');
        if (response.ok) {
          const data = await response.json();
          setGameData(data);
        }
      } catch (error) {
        console.error('Error fetching game data:', error);
      }
    };

    // Fetch recent donations
    const fetchRecentDonations = async () => {
      try {
        const response = await fetch('/api/recent-donations');
        if (response.ok) {
          const data = await response.json();
          setRecentDonations(data.donations || []);
        }
      } catch (error) {
        console.error('Error fetching recent donations:', error);
      }
    };

    // Fetch online users
    const fetchOnlineUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            id,
            in_game_alias,
            updated_at,
            squad_members(
              role,
              squads(name, tag)
            )
          `)
          .eq('registration_status', 'completed')
          .not('in_game_alias', 'is', null)
          .neq('in_game_alias', '')
          .gte('updated_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()) // Last 15 minutes
          .order('updated_at', { ascending: false })
          .limit(15);

        if (!error && data) {
          const users: OnlineUser[] = data.map((user: any) => ({
            id: user.id,
            in_game_alias: user.in_game_alias,
            last_seen: user.updated_at,
            squad_name: user.squad_members?.[0]?.squads?.name || null,
            squad_tag: user.squad_members?.[0]?.squads?.tag || null,
            role: user.squad_members?.[0]?.role || null,
          }));
          
          setOnlineUsers(users);
        }
      } catch (error) {
        console.error('Error fetching online users:', error);
      }
    };

    // Fetch top squads
    const fetchTopSquads = async () => {
      try {
        const { data, error } = await supabase
          .from('squads')
          .select(`
            id,
            name,
            tag,
            profiles!squads_captain_id_fkey(in_game_alias),
            squad_members!inner(id)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!error && data) {
          const squads: Squad[] = data.map((squad: any) => ({
            id: squad.id,
            name: squad.name,
            tag: squad.tag,
            member_count: squad.squad_members?.length || 0,
            captain_alias: squad.profiles?.in_game_alias || 'Unknown'
          }));
          setTopSquads(squads);
        }
      } catch (error) {
        console.error('Error fetching squads:', error);
      }
    };

    // Fetch upcoming matches
    const fetchUpcomingMatches = async () => {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select(`
            id,
            title,
            scheduled_at,
            status,
            match_type,
            squad_a:squads!matches_squad_a_id_fkey(name),
            squad_b:squads!matches_squad_b_id_fkey(name)
          `)
          .gte('scheduled_at', new Date().toISOString())
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true })
          .limit(5);

        if (!error && data) {
          const matches: Match[] = data.map((match: any) => ({
            id: match.id,
            title: match.title,
            scheduled_at: match.scheduled_at,
            squad_a_name: match.squad_a?.name,
            squad_b_name: match.squad_b?.name,
            status: match.status,
            match_type: match.match_type
          }));
          setUpcomingMatches(matches);
        }
      } catch (error) {
        console.error('Error fetching matches:', error);
      }
    };

    // Fetch user's squad status
    const fetchUserSquad = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('squad_members')
          .select(`
            squads!inner(id, name, tag)
          `)
          .eq('player_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!error && data) {
          setUserSquad({
            id: (data.squads as any).id,
            name: (data.squads as any).name,
            tag: (data.squads as any).tag,
            member_count: 0,
            captain_alias: ''
          });
        } else {
          setUserSquad(null);
        }
      } catch (error) {
        console.error('Error fetching user squad:', error);
      }
    };
    
    fetchServerData();
    fetchGameData();
    fetchRecentDonations();
    fetchOnlineUsers();
    fetchTopSquads();
    fetchUpcomingMatches();
    fetchUserSquad();
    
    // Set up intervals to refresh data
    const serverInterval = setInterval(fetchServerData, 60000);
    const gameInterval = setInterval(fetchGameData, 5000);
    const donationsInterval = setInterval(fetchRecentDonations, 30000);
    const usersInterval = setInterval(fetchOnlineUsers, 15000); // Refresh every 15 seconds
    const squadsInterval = setInterval(fetchTopSquads, 60000);
    const matchesInterval = setInterval(fetchUpcomingMatches, 30000);
    
    return () => {
      clearInterval(serverInterval);
      clearInterval(gameInterval);
      clearInterval(donationsInterval);
      clearInterval(usersInterval);
      clearInterval(squadsInterval);
      clearInterval(matchesInterval);
      clearInterval(carouselInterval);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [user]);

  // Helper function to get class color
  const getClassColor = (className: string) => {
    switch (className.toLowerCase()) {
      case 'infantry': return 'text-red-400';
      case 'heavy weapons': return 'text-blue-400';
      case 'jump trooper': return 'text-gray-400';
      case 'infiltrator': return 'text-purple-400';
      case 'squad leader': return 'text-green-500';
      case 'field medic': return 'text-yellow-400';
      case 'combat engineer': return 'text-amber-600';
      default: return 'text-gray-300';
    }
  };

  // Helper function to get weapon emoji
  const getWeaponEmoji = (weapon: string) => {
    switch (weapon?.toLowerCase()) {
      case 'caw': return ' 🪚';
      case 'sg': return ' 💥';
      default: return '';
    }
  };

  // Helper function to get role color
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'captain': return 'text-yellow-400';
      case 'co_captain': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  // Helper function to get role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'captain': return '👑';
      case 'co_captain': return '⭐';
      default: return '';
    }
  };

  // Parse patch notes with Infantry Online colors (simplified for feed)
  const parsePatchNotesFeed = (content: string) => {
    const lines = content.split('\n');
    
    return lines.map((line, index) => {
      let className = 'text-green-400';
      let processedLine = line;

      if (line.includes('~6') || /\w{3} \d{1,2}, \d{4}/.test(line)) {
        processedLine = line.replace(/~6/g, '');
        className = 'text-cyan-400 font-bold';
      } else if (line.includes('~5') || /^\s*\w+:/.test(line.trim())) {
        processedLine = line.replace(/~5/g, '');
        className = 'text-purple-400 font-bold';
      } else if (line.includes('~4') || line.includes('~1') || line.includes('~3') || line.includes('~7') || line.trim().startsWith('-')) {
        processedLine = line.replace(/~[1-7]/g, '');
        className = 'text-yellow-300';
      } else {
        processedLine = line.replace(/~[0-9]/g, '');
        className = 'text-gray-300';
      }

      return (
        <div key={index} className={className}>
          {processedLine}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Interactive Carousel Banner */}
        <div 
          ref={bannerRef}
          className="relative mb-8 overflow-hidden rounded-xl h-64 lg:h-80"
          style={{
            transform: `translateY(${scrollY * 0.5}px)`,
            opacity: Math.max(0.3, 1 - scrollY / 400)
          }}
        >
          {/* Video Background */}
          <video 
            autoPlay 
            loop 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/CTFPL-Website-Header-1.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Dynamic Overlay Gradient */}
          <div 
            className={`absolute inset-0 transition-all duration-1000 ${
              bannerSlides[currentSlide].color === 'cyan' ? 'bg-gradient-to-r from-gray-900/80 via-cyan-900/40 to-gray-900/80' :
              bannerSlides[currentSlide].color === 'purple' ? 'bg-gradient-to-r from-gray-900/80 via-purple-900/40 to-gray-900/80' :
              bannerSlides[currentSlide].color === 'green' ? 'bg-gradient-to-r from-gray-900/80 via-green-900/40 to-gray-900/80' :
              'bg-gradient-to-r from-gray-900/80 via-yellow-900/40 to-gray-900/80'
            }`}
          ></div>
          
          {/* Slide Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div 
              className="text-center px-4 transition-all duration-1000 transform"
              style={{
                transform: `translateY(${scrollY * 0.2}px) scale(${Math.max(0.8, 1 - scrollY / 1000)})`,
                filter: `brightness(${Math.max(0.7, 1 + scrollY / 500)})`
              }}
            >
              <h1 
                className={`text-4xl lg:text-6xl font-bold mb-4 tracking-wider drop-shadow-2xl transition-all duration-1000 ${
                  bannerSlides[currentSlide].color === 'cyan' ? 'text-cyan-400' :
                  bannerSlides[currentSlide].color === 'purple' ? 'text-purple-400' :
                  bannerSlides[currentSlide].color === 'green' ? 'text-green-400' :
                  'text-yellow-400'
                }`}
              >
                {bannerSlides[currentSlide].title}
              </h1>
              <p className="text-lg lg:text-2xl text-gray-200 mb-2 drop-shadow-lg transition-all duration-1000">
                {bannerSlides[currentSlide].subtitle}
              </p>
              <div className="text-gray-300 font-mono text-sm lg:text-base drop-shadow-lg mb-4 transition-all duration-1000">
                {bannerSlides[currentSlide].description}
              </div>
              
              {/* Call to Action Button */}
              <button 
                className={`px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 ${
                  bannerSlides[currentSlide].color === 'cyan' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white hover:shadow-cyan-500/25' :
                  bannerSlides[currentSlide].color === 'purple' ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white hover:shadow-purple-500/25' :
                  bannerSlides[currentSlide].color === 'green' ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white hover:shadow-green-500/25' :
                  'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white hover:shadow-yellow-500/25'
                }`}
                onClick={() => {
                  if (currentSlide === 1) window.location.href = '/squads';
                  else if (currentSlide === 2) window.location.href = '/matches';
                  else if (currentSlide === 3) window.location.href = '/donate';
                  else window.location.href = '/dashboard';
                }}
              >
                {bannerSlides[currentSlide].highlight}
              </button>
            </div>
          </div>
          
          {/* Navigation Arrows */}
          <button 
            onClick={() => setCurrentSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length)}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all duration-300 hover:scale-110"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <button 
            onClick={() => setCurrentSlide((prev) => (prev + 1) % bannerSlides.length)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all duration-300 hover:scale-110"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          {/* Slide Indicators */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
            {bannerSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentSlide 
                    ? `${bannerSlides[currentSlide].color === 'cyan' ? 'bg-cyan-400' :
                        bannerSlides[currentSlide].color === 'purple' ? 'bg-purple-400' :
                        bannerSlides[currentSlide].color === 'green' ? 'bg-green-400' :
                        'bg-yellow-400'} scale-125` 
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Main Grid Layout with Enhanced Animations */}
        <div 
          className="grid grid-cols-1 lg:grid-cols-4 gap-6"
          style={{
            transform: `translateY(${Math.max(0, scrollY - 200) * -0.1}px)`,
            opacity: Math.min(1, Math.max(0.5, 1 - (scrollY - 200) / 800))
          }}
        >
          {/* Left Sidebar - Server Status & Game Data */}
          <div className="lg:col-span-1 space-y-6">
            {/* Server Status */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-green-500/20 hover:border-green-500/50">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-green-500/30">
                <h3 className="text-green-400 font-bold text-sm tracking-wider">🌐 SERVER STATUS</h3>
                <p className="text-gray-400 text-xs mt-1 font-mono">Live Game Data</p>
              </div>
              
              <div className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Status</span>
                    <span className={`text-sm font-bold ${
                      serverData.stats.serverStatus === 'online' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {serverData.stats.serverStatus === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Players</span>
                    <span className="text-cyan-400 font-bold text-sm">{serverData.stats.totalPlayers}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Active Games</span>
                    <span className="text-yellow-400 font-bold text-sm">{serverData.stats.activeGames}</span>
                  </div>
                </div>

                {serverData.zones.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <h4 className="text-green-400 font-bold text-xs mb-2">ACTIVE ZONES</h4>
                    <div className="space-y-1">
                      {serverData.zones.map((zone, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300">{zone.title}</span>
                          <span className="text-cyan-400 font-mono">{zone.playerCount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {serverData.lastUpdated && (
                  <p className="text-xs text-gray-500 mt-3 text-center font-mono">
                    Updated: {new Date(serverData.lastUpdated).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </section>

            {/* Live Game Data */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg shadow-2xl overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-blue-500/20 hover:border-blue-500/50">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-blue-500/30">
                <h3 className="text-blue-400 font-bold text-sm tracking-wider">🎮 LIVE GAME</h3>
                <p className="text-gray-400 text-xs mt-1 font-mono">
                  {gameData.arenaName || 'No Active Game'}
                </p>
              </div>
              
              <div className="p-3 bg-gray-900">
                {gameData.players.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-cyan-400 font-bold text-sm">{gameData.gameType}</div>
                      {gameData.baseUsed && (
                        <div className="text-gray-400 text-xs">{gameData.baseUsed}</div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Offense Team */}
                      <div className="bg-gray-800/50 border border-green-500/30 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-green-400 font-bold text-xs">
                            🟢 Offense
                          </h4>
                          <span className="text-green-300 text-xs font-mono">
                            {gameData.players.filter(p => p.isOffense).length}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          {gameData.players
                            .filter(p => p.isOffense)
                            .map((player, index) => (
                              <div key={index} className="text-xs">
                                <span className={`font-mono font-bold ${getClassColor(player.class)}`}>
                                  {player.alias}{getWeaponEmoji(player.weapon || '')}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Defense Team */}
                      <div className="bg-gray-800/50 border border-red-500/30 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-red-400 font-bold text-xs">
                            🔴 Defense
                          </h4>
                          <span className="text-red-300 text-xs font-mono">
                            {gameData.players.filter(p => !p.isOffense).length}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          {gameData.players
                            .filter(p => !p.isOffense)
                            .map((player, index) => (
                              <div key={index} className="text-xs">
                                <span className={`font-mono font-bold ${getClassColor(player.class)}`}>
                                  {player.alias}{getWeaponEmoji(player.weapon || '')}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500 text-lg">No active players detected</div>
                    <div className="text-gray-600 text-sm mt-2">Waiting for game data...</div>
                  </div>
                )}
                
                {gameData.lastUpdated && (
                  <p className="text-xs text-gray-500 mt-3 text-center font-mono">
                    Last Update: {new Date(gameData.lastUpdated).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </section>

            {/* Recent Patch Notes for logged in users */}
            {user && recentPatchNotes && (
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-purple-500/30">
                  <h3 className="text-purple-400 font-bold text-sm tracking-wider">📋 RECENT UPDATES</h3>
                  <p className="text-gray-400 text-xs mt-1 font-mono">{latestUpdateDate}</p>
                </div>
                
                <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                  <div className="text-xs font-mono leading-relaxed space-y-1">
                    {parsePatchNotesFeed(recentPatchNotes)}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Main Content - Matches */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl transform transition-all duration-300 hover:scale-[1.02] hover:shadow-cyan-500/20 hover:border-cyan-500/50">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-3xl font-bold text-cyan-400 tracking-wider">UPCOMING MATCHES</h3>
                {user && (
                  <Link 
                    href="/matches" 
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 text-sm"
                  >
                    + CREATE MATCH
                  </Link>
                )}
              </div>
              
              <div className="space-y-4 text-gray-300 leading-relaxed">
                {upcomingMatches.length > 0 ? (
                  upcomingMatches.map((match) => (
                    <Link key={match.id} href={`/matches/${match.id}`}>
                      <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-cyan-400 font-bold hover:text-cyan-300">{match.title}</h4>
                          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                            {match.match_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-yellow-400 font-bold text-sm">
                            🕘 {new Date(match.scheduled_at).toLocaleDateString()} at {new Date(match.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        {match.squad_a_name && match.squad_b_name && (
                          <div className="flex items-center space-x-3">
                            <span className="text-cyan-400 font-medium">{match.squad_a_name}</span>
                            <span className="text-gray-400">vs</span>
                            <span className="text-green-400 font-medium">{match.squad_b_name}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500 text-lg">No upcoming matches scheduled</div>
                    <div className="text-gray-600 text-sm mt-2">
                      {user ? 'Be the first to create a match!' : 'Login to create matches'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top Squads Section */}
            <div className="mt-6 bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-6 shadow-2xl transform transition-all duration-300 hover:scale-[1.02] hover:shadow-purple-500/20 hover:border-purple-500/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-purple-400 tracking-wider">🛡️ ACTIVE SQUADS</h3>
                {user && !userSquad && (
                  <Link 
                    href="/squads" 
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 text-sm"
                  >
                    + CREATE SQUAD
                  </Link>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topSquads.length > 0 ? (
                  topSquads.map((squad) => (
                    <Link key={squad.id} href={`/squads/${squad.id}`}>
                      <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 hover:border-purple-500/50 transition-all duration-300 cursor-pointer">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-purple-400 font-bold">[{squad.tag}]</span>
                            <span className="text-gray-300 font-medium hover:text-purple-300">{squad.name}</span>
                          </div>
                          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                            {squad.member_count} members
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          Captain: <span className="text-yellow-400">{squad.captain_alias}</span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-6">
                    <div className="text-gray-500">No active squads</div>
                    <div className="text-gray-600 text-sm mt-1">
                      {user ? 'Create the first squad!' : 'Login to create squads'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Online Users & Donations */}
          <div className="lg:col-span-1 space-y-6">
            {/* Online Users Section */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-green-500/30">
                <h3 className="text-green-400 font-bold text-sm tracking-wider flex items-center justify-between">
                  👥 ONLINE USERS
                  <span className="text-green-300 text-xs font-mono">
                    {onlineUsers.length}
                  </span>
                </h3>
                <p className="text-gray-400 text-xs mt-1 font-mono">Recently Active</p>
              </div>
              
              <div className="p-3 bg-gray-900 max-h-96 overflow-y-auto">
                {onlineUsers.length > 0 ? (
                  <div className="space-y-2">
                    {onlineUsers.map((user) => (
                      <div key={user.id} className="bg-gray-800/50 border border-green-500/20 rounded-lg p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {user.role && (
                              <span className="text-xs">{getRoleIcon(user.role)}</span>
                            )}
                            <span className="text-green-400 font-mono text-sm font-bold">
                              {user.in_game_alias}
                            </span>
                          </div>
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        </div>
                        
                        {user.squad_name && (
                          <div className="text-xs text-gray-400 mt-1">
                            <span className="text-purple-400">[{user.squad_tag}]</span> {user.squad_name}
                            {user.role && (
                              <span className={`ml-1 ${getRoleColor(user.role)}`}>
                                ({user.role.replace('_', ' ')})
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(user.last_seen).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-gray-500 text-sm">No users online</div>
                    <div className="text-gray-600 text-xs mt-1">Be the first to log in!</div>
                  </div>
                )}
              </div>
            </section>

            {/* Recent Donations Section */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                <h3 className="text-yellow-400 font-bold text-sm tracking-wider flex items-center justify-between">
                  💰 RECENT SUPPORT
                  <Link 
                    href="/donate" 
                    className="text-yellow-400 hover:text-yellow-300 text-xs font-normal border border-yellow-500/50 hover:border-yellow-400 px-2 py-1 rounded transition-all duration-300"
                  >
                    DONATE
                  </Link>
                </h3>
                <p className="text-gray-400 text-xs mt-1 font-mono">Community Support</p>
              </div>
              
              <div className="p-3 bg-gray-900 max-h-96 overflow-y-auto">
                {recentDonations.length > 0 ? (
                  <div className="space-y-2">
                    {recentDonations.slice(0, 8).map((donation, index) => (
                      <div key={index} className="bg-gray-800/50 border border-yellow-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-yellow-400 font-bold text-sm">
                            ${donation.amount.toFixed(2)}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {new Date(donation.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-cyan-400 font-mono text-xs mb-1">
                          {donation.customerName}
                        </div>
                        {donation.message && (
                          <div className="text-gray-300 text-xs italic truncate" title={donation.message}>
                            "{donation.message}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-gray-500 text-sm">No recent donations</div>
                    <div className="text-gray-600 text-xs mt-1">Be the first to support!</div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
