'use client';

import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import TopSupportersWidget from '@/components/TopSupportersWidget';
import NewsSection from '@/components/NewsSection';
import { useDonationMode } from '@/hooks/useDonationMode';
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
  team: string; // Actual team name like "WC C" or "PT T"
  teamType?: 'Titan' | 'Collective'; // For logic purposes
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

interface FeaturedVideo {
  id: string;
  title: string;
  description: string;
  youtube_url?: string;
  vod_url?: string;
  thumbnail_url?: string;
  video_type: string;
  match_id?: string;
  match_title?: string;
  match_date?: string;
  view_count: number;
  published_at: string;
}

interface OnlineUser {
  id: string;
  in_game_alias: string;
  last_seen: string;
  squad_name?: string;
  squad_tag?: string;
  role?: string;
  avatar_url?: string | null;
}

interface Squad {
  id: string;
  name: string;
  tag: string;
  member_count: number;
  captain_alias: string;
  banner_url?: string;
  is_active?: boolean;
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
  const [userProfile, setUserProfile] = useState<any>(null);
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
  const { donations: recentDonations } = useDonationMode('recent-donations', 5);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [topSquads, setTopSquads] = useState<Squad[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  const [featuredVideos, setFeaturedVideos] = useState<FeaturedVideo[]>([]);
  const [recentGames, setRecentGames] = useState<any[]>([]);
  
  // Collapsible states for player lists
  const [isSpectatorsCollapsed, setIsSpectatorsCollapsed] = useState(false);
  const [isNotPlayingCollapsed, setIsNotPlayingCollapsed] = useState(false);
  
  // Carousel and animation states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  
  // YouTube embed modal state
  const [embedModal, setEmbedModal] = useState<{
    isOpen: boolean;
    videoId: string | null;
    title: string;
  }>({
    isOpen: false,
    videoId: null,
    title: ''
  });
  
  // Banner slides data - filtered based on user status
  const getAllBannerSlides = () => [
    {
      title: "FREE INFANTRY",
      subtitle: "Capture the Flag: Player's League",
      description: "🎮 Competitive Gaming Platform",
      highlight: "Join the Battle",
      color: "cyan",
      showWhen: "guest" // Only show to non-authenticated users
    },
    {
      title: "ACTIVE SQUADS",
      subtitle: "Form Elite Teams",
      description: "🛡️ Create or Join Competitive Squads",
      highlight: "Build Your Team",
      color: "purple",
      showWhen: "always"
    },
    {
      title: "FREE AGENTS",
      subtitle: "Find Your Perfect Squad",
      description: "🎯 Connect Players with Teams",
      highlight: "Join the Pool",
      color: "pink",
      showWhen: "always"
    },
    {
      title: "LIVE MATCHES",
      subtitle: "Compete in Real-Time",
      description: "⚔️ Schedule and Play Competitive Matches",
      highlight: "Enter the Arena",
      color: "green",
      showWhen: "always"
    },
    {
      title: "PLAYER STATS",
      subtitle: "Track Your Performance",
      description: "📊 Advanced Statistics & ELO Rankings",
      highlight: "View Stats",
      color: "blue",
      showWhen: "always"
    },
    {
      title: "DUELING SYSTEM",
      subtitle: "1v1 Competitive Matches",
      description: "⚡ Face Off in Skill-Based Duels",
      highlight: "Challenge Players",
      color: "orange",
      showWhen: "always"
    },
    {
      title: "COMMUNITY FORUM",
      subtitle: "Connect with Players",
      description: "💬 Discuss Strategies & Share Content",
      highlight: "Join Discussion",
      color: "indigo",
      showWhen: "always"
    },
    {
      title: "NEWS & UPDATES",
      subtitle: "Stay Informed",
      description: "📰 Latest Patch Notes & Announcements",
      highlight: "Read Latest",
      color: "teal",
      showWhen: "always"
    },
    {
      title: "GAMING PERKS",
      subtitle: "Enhance Your Experience",
      description: "🛍️ Exclusive In-Game Perks & Items",
      highlight: "Browse Shop",
      color: "red",
      showWhen: "always"
    },
    {
      title: "SUPPORT THE GAME",
      subtitle: "Keep Infantry Online Running",
      description: "💰 Donate to Support Development",
      highlight: "Make a Difference",
      color: "yellow",
      showWhen: "always"
    }
  ];

  // Filter slides based on user authentication
  const bannerSlides = getAllBannerSlides().filter(slide => 
    slide.showWhen === "always" || 
    (slide.showWhen === "guest" && !user) ||
    (slide.showWhen === "user" && user)
  );

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        try {
          // Simple profile fetch with timeout
          const result = await Promise.race([
            supabase
              .from('profiles')
              .select('is_admin, ctf_role')
              .eq('id', user.id)
              .single(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
            )
          ]);
        
          const { data } = result as any;
          if (data) {
            setUserProfile(data);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          // Don't throw - just log and continue
        }
      }
    };

    // Simple profile check without complex diagnostics
    const quickProfileCheck = async () => {
      if (!user) return;
      
      try {
        // Quick check with timeout
        const result = await Promise.race([
          supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile check timeout')), 3000)
          )
        ]);
        
        const { data: profile, error } = result as any;
          
        if (error && error.code === 'PGRST116') {
          // Profile doesn't exist, create it quickly
          await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              in_game_alias: user.email?.split('@')[0] || 'User',
              last_seen: new Date().toISOString()
            }]);
        }
      } catch (error) {
        console.error('Quick profile check error:', error);
        // Don't throw - just log and continue
      }
    };

    // Simple user activity update with timeout and throttling
    const updateUserActivity = async () => {
      if (!user) return;
      
      // Throttle activity updates to once per minute
      const lastUpdate = localStorage.getItem('lastActivityUpdate');
      const now = Date.now();
      if (lastUpdate && (now - parseInt(lastUpdate)) < 60000) {
        return; // Skip if updated less than 1 minute ago
      }
      
      try {
        const timestamp = new Date().toISOString();
        
        await Promise.race([
          supabase
            .from('profiles')
            .update({ last_seen: timestamp })
            .eq('id', user.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity update timeout')), 3000)
          )
        ]);
        
        localStorage.setItem('lastActivityUpdate', now.toString());
      } catch (error) {
        console.error('Error updating user activity:', error);
        // Don't throw - just log and continue
      }
    };

    // Run the simplified checks only when user changes
    if (user) {
      fetchUserProfile();
      updateUserActivity();
      quickProfileCheck();
    }

    // Scroll effect handler
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    // Carousel auto-advance with dynamic slide count
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

    // Fetch featured videos for homepage center
    const fetchFeaturedVideos = async () => {
      try {
        console.log('🎬 Fetching featured videos...');
        
        // Use API endpoint instead of direct RPC
        const response = await fetch('/api/featured-videos?limit=6');
        
        if (!response.ok) {
          console.error('Featured videos API error:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error response:', errorText);
          return;
        }
        
        const data = await response.json();
        console.log('📊 Featured videos API response:', data);
        
        if (data.videos && Array.isArray(data.videos)) {
          // Auto-generate YouTube thumbnails if missing
          const videosWithThumbnails = data.videos.map((video: any) => {
            const autoThumbnail = video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null;
            const finalThumbnail = video.thumbnail_url || autoThumbnail;
            
            console.log(`🎬 Video: "${video.title}"`);
            console.log(`  📺 YouTube URL: ${video.youtube_url || 'None'}`);
            console.log(`  🏷️ Stored Thumbnail: ${video.thumbnail_url || 'None'}`);
            console.log(`  🔧 Auto-Generated: ${autoThumbnail || 'None'}`);
            console.log(`  ✅ Final Thumbnail: ${finalThumbnail || 'None'}`);
            
            return {
              ...video,
              thumbnail_url: finalThumbnail
            };
          });
          
          setFeaturedVideos(videosWithThumbnails);
          console.log('✅ Featured videos loaded:', videosWithThumbnails.length);
        } else {
          console.error('Invalid API response format:', data);
        }
      } catch (error) {
        console.error('Error fetching featured videos (catch):', error);
        
        // Fallback: try direct RPC call
        try {
          console.log('🔄 Trying direct RPC fallback...');
          const { data, error: rpcError } = await supabase.rpc('get_featured_videos', { limit_count: 6 });
          
          if (rpcError) {
            console.error('RPC error:', rpcError);
            return;
          }
          
          if (data) {
            const videosWithThumbnails = data.map((video: any) => {
              const autoThumbnail = video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null;
              const finalThumbnail = video.thumbnail_url || autoThumbnail;
              
              return {
                ...video,
                thumbnail_url: finalThumbnail
              };
            });
            
            setFeaturedVideos(videosWithThumbnails);
            console.log('✅ Featured videos loaded via RPC:', videosWithThumbnails.length);
          }
        } catch (rpcError) {
          console.error('RPC fallback also failed:', rpcError);
        }
      }
    };

    // Fetch online users - improved to show truly active users
    const fetchOnlineUsers = async () => {
      try {
        // Consider users online if they've been active in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        console.log('Fetching online users since:', fiveMinutesAgo);
        
        // Simple query for online users based on profiles table only
        const { data: onlineData, error } = await supabase
          .from('profiles')
          .select('id, in_game_alias, email, last_seen, avatar_url')
          .gte('last_seen', fiveMinutesAgo)
          .order('last_seen', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error fetching online users:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            full_error: error
          });
          return;
        }

        console.log('Raw online users data:', onlineData);

        if (onlineData) {
          // Filter and format users, prioritizing those with in_game_alias but including others
          const formattedUsers = onlineData
            .filter(user => user.in_game_alias) // Only include users with proper aliases
            .map((user: any) => ({
              id: user.id,
              in_game_alias: user.in_game_alias,
              last_seen: user.last_seen,
              squad_name: undefined, // We'll add squad info back later as an enhancement
              squad_tag: undefined,
              role: undefined,
              avatar_url: user.avatar_url,
            }));
          
          setOnlineUsers(formattedUsers);
          
          // Debug log for troubleshooting
          console.log(`Found ${formattedUsers.length} online users:`, formattedUsers.map(u => u.in_game_alias));
        }
      } catch (error) {
        console.error('Error fetching online users (catch):', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    };

    // Fetch recent games
    const fetchRecentGames = async () => {
      try {
        const response = await fetch('/api/player-stats/recent-games?limit=5');
        if (response.ok) {
          const data = await response.json();
          setRecentGames(data.games || []);
        }
      } catch (error) {
        console.error('Error fetching recent games:', error);
        setRecentGames([]);
      }
    };

    // Fetch top squads - Only active squads (removed inner join to get all active squads)
    const fetchTopSquads = async () => {
      try {
        // Use direct query to ensure we filter by is_active
        const { data, error } = await supabase
          .from('squads')
          .select(`
            id,
            name,
            tag,
            banner_url,
            captain_id,
            profiles!squads_captain_id_fkey(in_game_alias)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Get member counts separately to avoid inner join limitations
          const squadIds = data.map(squad => squad.id);
          const { data: memberCounts } = await supabase
            .from('squad_members')
            .select('squad_id')
            .in('squad_id', squadIds)
            .eq('status', 'active');
          
          const squads: Squad[] = data.map((squad: any) => ({
            id: squad.id,
            name: squad.name,
            tag: squad.tag,
            member_count: memberCounts?.filter(m => m.squad_id === squad.id).length || 0,
            captain_alias: squad.profiles?.in_game_alias || 'Unknown',
            banner_url: squad.banner_url
          }));
          
          setTopSquads(squads);
        }
      } catch (error) {
        console.error('Error fetching top squads:', error);
        setTopSquads([]);
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
          .eq('user_id', user.id)
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
    fetchFeaturedVideos();
    fetchOnlineUsers();
    fetchRecentGames();
    fetchTopSquads();
    fetchUpcomingMatches();
    fetchUserSquad();
    
    // Set up intervals to refresh data
    const serverInterval = setInterval(fetchServerData, 300000); // Poll every 5 minutes instead of 1 minute
    const gameInterval = setInterval(fetchGameData, 5000);
    const videosInterval = setInterval(fetchFeaturedVideos, 300000); // Refresh every 5 minutes
    const usersInterval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds
    const recentGamesInterval = setInterval(fetchRecentGames, 30000); // Refresh every 30 seconds
    const squadsInterval = setInterval(fetchTopSquads, 60000);
    const matchesInterval = setInterval(fetchUpcomingMatches, 30000);
    const activityInterval = setInterval(updateUserActivity, 600000); // Update activity every 10 minutes
    
    // Keyboard event listener for modal
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && embedModal.isOpen) {
        closeEmbedModal();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      clearInterval(serverInterval);
      clearInterval(gameInterval);
      clearInterval(videosInterval);
      clearInterval(usersInterval);
      clearInterval(recentGamesInterval);
      clearInterval(squadsInterval);
      clearInterval(matchesInterval);
      clearInterval(activityInterval);
      clearInterval(carouselInterval);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [user, embedModal.isOpen]);

  useEffect(() => {
    // Reset current slide if it's out of bounds after filtering
    if (currentSlide >= bannerSlides.length) {
      setCurrentSlide(0);
    }
  }, [user, bannerSlides.length, currentSlide]);

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

  // Helper function to get class priority order
  const getClassPriority = (className: string): number => {
    switch (className.toLowerCase()) {
      case 'field medic': return 1;
      case 'combat engineer': return 2;
      case 'squad leader': return 3;
      case 'heavy weapons': return 4;
      case 'infantry': return 5;
      case 'jump trooper': return 6;
      case 'infiltrator': return 7;
      default: return 8;
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

  // Helper function to get YouTube video ID from URL
  const getYouTubeVideoId = (url: string) => {
    if (!url) return null;
    
    // Handle different YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,           // youtube.com/watch?v=
      /(?:youtube\.com\/embed\/)([^&\n?#]+)/,             // youtube.com/embed/
      /(?:youtube\.com\/v\/)([^&\n?#]+)/,                 // youtube.com/v/
      /(?:youtu\.be\/)([^&\n?#]+)/,                       // youtu.be/
      /(?:youtube\.com\/\S*[?&]v=)([^&\n?#]+)/           // any youtube.com with v= parameter
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log(`🔍 YouTube ID extracted: ${match[1]} from ${url}`);
        return match[1];
      }
    }
    
    console.warn(`⚠️ Could not extract YouTube ID from: ${url}`);
    return null;
  };

  // Helper function to get YouTube thumbnail URL with fallback
  const getYouTubeThumbnail = (url: string, quality = 'hqdefault') => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    
    // YouTube thumbnail qualities in order of preference:
    // maxresdefault (1920x1080) - not always available
    // hqdefault (480x360) - most reliable
    // mqdefault (320x180) - fallback
    // default (120x90) - always available
    
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
    console.log(`🖼️ Generated thumbnail URL: ${thumbnailUrl}`);
    return thumbnailUrl;
  };

  // Helper function to get the best available YouTube thumbnail
  const getBestYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    
    // Try hqdefault first (most reliable high quality)
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  };

  // Helper function to get video type icon
  const getVideoTypeIcon = (type: string) => {
    switch (type) {
      case 'match': return '🎮';
      case 'highlight': return '⭐';
      case 'tutorial': return '🎓';
      case 'tournament': return '🏆';
      default: return '📹';
    }
  };

  // Helper function to record video view
  const recordVideoView = async (videoId?: string, matchId?: string) => {
    try {
      await supabase.rpc('record_video_view', {
        p_video_id: videoId || null,
        p_match_id: matchId || null,
        p_session_id: `session_${Date.now()}`
      });
    } catch (error) {
      console.error('Error recording video view:', error);
    }
  };

  // Function to open YouTube embed modal
  const openVideoEmbed = (video: FeaturedVideo) => {
    if (video.youtube_url) {
      const videoId = getYouTubeVideoId(video.youtube_url);
      if (videoId) {
        setEmbedModal({
          isOpen: true,
          videoId: videoId,
          title: video.title
        });
        recordVideoView(video.id);
      }
    }
  };

  // Function to close embed modal
  const closeEmbedModal = () => {
    setEmbedModal({
      isOpen: false,
      videoId: null,
      title: ''
    });
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black relative overflow-hidden">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-8 relative z-10">
        {/* Interactive Carousel Banner */}
        <div 
          ref={bannerRef}
          className="relative mb-8 overflow-hidden rounded-2xl shadow-2xl"
          style={{
            height: '400px',
            transform: `translateY(${Math.max(0, scrollY - 100) * -0.15}px)`,
            opacity: Math.max(0.3, 1 - scrollY / 600)
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
            <source src="/CTFPL-Website-Header-1.webm" type="video/webm" />
            <source src="/CTFPL-Website-Header-1.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Dynamic Overlay Gradient */}
          <div 
            className={`absolute inset-0 transition-all duration-1000 ${
              bannerSlides.length > 0 && bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)] ? (
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'cyan' ? 'bg-gradient-to-r from-gray-900/90 via-cyan-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'purple' ? 'bg-gradient-to-r from-gray-900/90 via-purple-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'pink' ? 'bg-gradient-to-r from-gray-900/90 via-pink-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'green' ? 'bg-gradient-to-r from-gray-900/90 via-green-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'blue' ? 'bg-gradient-to-r from-gray-900/90 via-blue-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'orange' ? 'bg-gradient-to-r from-gray-900/90 via-orange-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'indigo' ? 'bg-gradient-to-r from-gray-900/90 via-indigo-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'teal' ? 'bg-gradient-to-r from-gray-900/90 via-teal-900/60 to-gray-900/90' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'red' ? 'bg-gradient-to-r from-gray-900/90 via-red-900/60 to-gray-900/90' :
                'bg-gradient-to-r from-gray-900/90 via-yellow-900/60 to-gray-900/90'
              ) : 'bg-gradient-to-r from-gray-900/90 via-cyan-900/60 to-gray-900/90'
            }`}
          ></div>
          
          {/* Slide Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            {bannerSlides.length > 0 && bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)] && (
              <div 
                className="text-center px-4 transition-all duration-1000 transform"
                style={{
                  transform: `translateY(${scrollY * 0.2}px) scale(${Math.max(0.8, 1 - scrollY / 1000)})`,
                  filter: `brightness(${Math.max(0.7, 1 + scrollY / 500)})`
                }}
              >
                <h1 
                  className={`text-4xl lg:text-6xl font-bold mb-4 tracking-wider drop-shadow-2xl transition-all duration-1000 ${
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'cyan' ? 'text-cyan-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'purple' ? 'text-purple-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'pink' ? 'text-pink-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'text-green-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'blue' ? 'text-blue-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'orange' ? 'text-orange-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'indigo' ? 'text-indigo-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'teal' ? 'text-teal-400' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'red' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}
                >
                  {bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.title}
                </h1>
                <p className="text-lg lg:text-2xl text-gray-200 mb-2 drop-shadow-lg transition-all duration-1000">
                  {bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.subtitle}
                </p>
                <div className="text-gray-300 font-mono text-sm lg:text-base drop-shadow-lg mb-4 transition-all duration-1000">
                  {bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.description}
                </div>
                
                {/* Call to Action Button */}
                <button 
                  className={`px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 ${
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'cyan' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white hover:shadow-cyan-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'purple' ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white hover:shadow-purple-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'pink' ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white hover:shadow-pink-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white hover:shadow-green-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'blue' ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white hover:shadow-blue-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'orange' ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white hover:shadow-orange-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'indigo' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white hover:shadow-indigo-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'teal' ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white hover:shadow-teal-500/25' :
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'red' ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white hover:shadow-red-500/25' :
                    'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white hover:shadow-yellow-500/25'
                  }`}
                  onClick={() => {
                    const currentBannerSlide = bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)];
                    if (currentBannerSlide) {
                      if (currentBannerSlide.highlight === "Build Your Team") {
                        window.location.href = '/squads';
                      } else if (currentBannerSlide.highlight === "Join the Pool") {
                        window.location.href = '/free-agents';
                      } else if (currentBannerSlide.highlight === "Enter the Arena") {
                        window.location.href = '/matches';
                      } else if (currentBannerSlide.highlight === "View Stats") {
                        window.location.href = '/stats';
                      } else if (currentBannerSlide.highlight === "Challenge Players") {
                        window.location.href = '/dueling';
                      } else if (currentBannerSlide.highlight === "Join Discussion") {
                        window.location.href = '/forum';
                      } else if (currentBannerSlide.highlight === "Read Latest") {
                        window.location.href = '/news';
                      } else if (currentBannerSlide.highlight === "Browse Shop") {
                        window.location.href = '/perks';
                      } else if (currentBannerSlide.highlight === "Make a Difference") {
                        window.location.href = '/donate';
                      } else if (currentBannerSlide.highlight === "Join the Battle") {
                        window.location.href = '/dashboard';
                      } else {
                        window.location.href = '/dashboard';
                      }
                    }
                  }}
                >
                  {bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.highlight}
                </button>
              </div>
            )}
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
                    ? `${bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'cyan' ? 'bg-cyan-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'purple' ? 'bg-purple-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'pink' ? 'bg-pink-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'bg-green-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'blue' ? 'bg-blue-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'orange' ? 'bg-orange-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'indigo' ? 'bg-indigo-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'teal' ? 'bg-teal-400' :
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'red' ? 'bg-red-400' :
                        'bg-yellow-400'} scale-125` 
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* CLEAN 3-COLUMN LAYOUT - Videos and News in same container */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          
          {/* LEFT SIDEBAR (3 columns) - Proper breathing room */}
          <div className="xl:col-span-3">
            <div className="space-y-3">
              
              {/* Online Users - Better spacing */}
              {onlineUsers.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-4 py-3 border-b border-green-500/30">
                    <h3 className="text-green-400 font-bold text-sm tracking-wider flex items-center justify-between">
                      👥 ONLINE USERS
                      <span className="text-green-300 text-xs font-mono bg-green-900/30 px-2 py-1 rounded">
                        {onlineUsers.length}
                      </span>
                    </h3>
                  </div>
                  <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {onlineUsers.slice(0, 8).map((user) => (
                        <div key={user.id} className="bg-gray-800/30 border border-green-500/10 rounded p-1.5">
                          <div className="flex items-center space-x-2">
                            <UserAvatar 
                              user={{
                                avatar_url: user.avatar_url,
                                in_game_alias: user.in_game_alias,
                                email: null
                              }} 
                              size="sm" 
                            />
                                                          <div className="flex-1 min-w-0">
                                <div className="text-green-400 text-sm font-mono truncate">
                                  {user.in_game_alias}
                                </div>
                                {user.squad_tag && (
                                  <div className="text-gray-500 text-xs truncate">
                                    [{user.squad_tag}] {user.squad_name}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Server Status - Detailed with zones */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-blue-500/30">
                  <h3 className="text-blue-400 font-bold text-sm tracking-wider">📡 SERVER STATUS</h3>
                </div>
                <div className="p-4">
                  <div className="text-center mb-4">
                    <div className="text-2xl font-bold text-cyan-400 mb-1">
                      {serverData.stats.totalPlayers}
                    </div>
                    <div className="text-xs text-gray-400">TOTAL PLAYERS</div>
                  </div>

                  {serverData.zones.length > 0 && (
                    <div className="space-y-2">
                      {serverData.zones.map((zone, index) => (
                        <div key={index} className="flex items-center justify-between text-xs bg-gray-800/30 rounded px-2 py-1">
                          <span className="text-gray-300 truncate">{zone.title}</span>
                          <span className="text-cyan-400 font-mono font-bold">{zone.playerCount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {serverData.lastUpdated && (
                    <p className="text-xs text-gray-500 mt-3 text-center font-mono">
                      {new Date(serverData.lastUpdated).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </section>

              {/* Recent Games */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-3 py-2 border-b border-green-500/30">
                  <h3 className="text-green-400 font-bold text-sm tracking-wider">🎮 RECENT GAMES</h3>
                </div>
                <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                  {recentGames.length > 0 ? (
                    <div className="space-y-2">
                      {recentGames.slice(0, 3).map((game, index) => (
                        <Link key={index} href={`/stats/game/${encodeURIComponent(game.gameId)}`}>
                          <div className="bg-gray-700/30 border border-gray-600 rounded p-2 hover:border-green-500/50 transition-all duration-300 cursor-pointer">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-green-400 font-bold text-xs">{game.gameMode}</span>
                              <span className="text-gray-400 text-xs">{game.mapName}</span>
                            </div>
                            <div className="text-xs text-gray-400 mb-1">
                              {new Date(game.gameDate).toLocaleDateString()}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {game.playerDetails.slice(0, 4).map((player: any, pIndex: number) => (
                                <span key={pIndex} className="text-xs text-gray-300">
                                  {player.name}{pIndex < Math.min(3, game.playerDetails.length - 1) ? ',' : ''}
                                </span>
                              ))}
                              {game.playerDetails.length > 4 && (
                                <span className="text-xs text-gray-500">+{game.playerDetails.length - 4} more</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-gray-500 text-sm">No recent games</div>
                    </div>
                  )}
                </div>
              </section>

              {/* Scheduled Matches - Only show if there are matches */}
              {upcomingMatches.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-3 py-2 border-b border-cyan-500/30">
                    <h3 className="text-cyan-400 font-bold text-sm tracking-wider">🎯 SCHEDULED MATCHES</h3>
                  </div>
                  <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {upcomingMatches.slice(0, 3).map((match) => (
                        <Link key={match.id} href={`/matches/${match.id}`}>
                          <div className="bg-gray-700/30 border border-gray-600 rounded p-2 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer">
                            <h4 className="text-cyan-400 font-bold text-xs mb-1 truncate">
                              {match.title}
                            </h4>
                            <div className="text-xs text-gray-400">
                              {new Date(match.scheduled_at).toLocaleDateString()}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Active Squads */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-3 py-2 border-b border-purple-500/30">
                  <h3 className="text-purple-400 font-bold text-sm tracking-wider">🛡️ SQUADS</h3>
                </div>
                <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                  {topSquads.length > 0 ? (
                    <div className="space-y-2">
                      {topSquads.map((squad) => (
                        <Link key={squad.id} href={`/squads/${squad.id}`}>
                          <div className="bg-gray-700/30 border border-gray-600 rounded p-2 hover:border-purple-500/50 transition-all duration-300 cursor-pointer">
                            <div className="flex items-center space-x-2">
                              <span className="text-purple-400 font-bold text-xs">[{squad.tag}]</span>
                              <span className="text-gray-300 text-xs truncate flex-1">{squad.name}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {squad.member_count} members
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-gray-500 text-sm">No active squads</div>
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>

          {/* CENTER CONTENT (6 columns) - News and Videos stacked */}
          <div className="xl:col-span-6">
            <div className="space-y-3">
              
              {/* News Section at the top */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-2 border-b border-blue-500/30">
                  <h3 className="text-lg font-bold text-blue-400 tracking-wider">News & Updates</h3>
                </div>
                <div className="p-4">
                  <NewsSection limit={4} showReadState={true} heroLayout={false} allowCollapse={true} />
                </div>
              </section>

              {/* Featured Videos below news */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-red-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-2 border-b border-red-500/30">
                  <h3 className="text-lg font-bold text-red-400 tracking-wider">Videos</h3>
                </div>
                <div className="p-4">
                  {featuredVideos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {featuredVideos.map((video) => {
                        const thumbnailUrl = video.thumbnail_url || 
                          (video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null);
                        
                        return (
                          <div key={video.id} className="group cursor-pointer bg-gray-700/30 border border-gray-600 rounded-lg overflow-hidden hover:border-red-500/50 transition-all duration-300"
                          onClick={() => {
                            if (video.youtube_url) {
                              openVideoEmbed(video);
                            } else if (video.vod_url) {
                              recordVideoView(video.id);
                              window.open(video.vod_url, '_blank');
                            }
                          }}>
                            <div className="relative aspect-video overflow-hidden">
                              {thumbnailUrl ? (
                                <img 
                                  src={thumbnailUrl}
                                  alt={video.title}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  onError={(e) => {
                                    e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIyNSIgdmlld0JveD0iMCAwIDQwMCAyMjUiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMjI1IiBmaWxsPSIjMzc0MTUxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VmlkZW8gVGh1bWJuYWlsPC90ZXh0Pgo8L3N2Zz4K';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                  <div className="text-gray-400 text-center">
                                    <div className="text-lg">📹</div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                                <div className="w-8 h-8 md:w-12 md:h-12 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                  <svg className="w-3 h-3 md:w-4 md:h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z"/>
                                  </svg>
                                </div>
                              </div>
                            </div>
                            
                            <div className="p-2">
                              <h4 className="font-medium text-sm text-white group-hover:text-red-300 transition-colors truncate">
                                {video.title}
                              </h4>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">🎬</div>
                      <div className="text-gray-500 text-lg mb-2">No featured videos yet</div>
                      <div className="text-gray-600 text-sm">
                        Check back soon for the latest Infantry Online content!
                      </div>
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>

          {/* RIGHT SIDEBAR (3 columns) - Top supporters only */}
          <div className="xl:col-span-3">
            <div className="space-y-3">
              
              {/* Top Supporters */}
              <TopSupportersWidget 
                showAdminControls={false}
                maxSupporters={10}
                className=""
              />

            </div>
          </div>
          
        </div>
      </main>
      
      {/* YouTube Embed Modal */}
      {embedModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeEmbedModal();
            }
          }}
        >
          <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white truncate pr-4">
                {embedModal.title}
              </h3>
              <button
                onClick={closeEmbedModal}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
              {embedModal.videoId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${embedModal.videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`}
                  title={embedModal.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="eager"
                ></iframe>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <div>Unable to load video</div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-800 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                🎬 Playing from YouTube
              </div>
              <button
                onClick={() => {
                  if (embedModal.videoId) {
                    window.open(`https://www.youtube.com/watch?v=${embedModal.videoId}`, '_blank');
                  }
                }}
                className="text-red-400 hover:text-red-300 text-sm border border-red-500/50 hover:border-red-400 px-3 py-1 rounded transition-colors"
              >
                🔗 Open in YouTube
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
