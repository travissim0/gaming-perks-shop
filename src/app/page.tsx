'use client';

import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import TopSupportersWidget from '@/components/TopSupportersWidget';
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
      title: "LIVE MATCHES",
      subtitle: "Compete in Real-Time",
      description: "⚔️ Schedule and Play Competitive Matches",
      highlight: "Enter the Arena",
      color: "green",
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

    // Simple user activity update with timeout
    const updateUserActivity = async () => {
      if (user) {
        try {
          const now = new Date().toISOString();
          
          await Promise.race([
            supabase
              .from('profiles')
              .update({ last_seen: now })
              .eq('id', user.id),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Activity update timeout')), 3000)
            )
          ]);
        } catch (error) {
          console.error('Error updating user activity:', error);
          // Don't throw - just log and continue
        }
      }
    };

    // Run the simplified checks
    fetchUserProfile();
    updateUserActivity();
    quickProfileCheck();

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
            .filter(user => user.in_game_alias || user.email) // Include if they have either alias or email
            .map((user: any) => ({
              id: user.id,
              in_game_alias: user.in_game_alias || user.email?.split('@')[0] || 'Unknown User',
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

    // Fetch top squads - Only active squads
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
            profiles!squads_captain_id_fkey(in_game_alias),
            squad_members!inner(id)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(6);

        if (!error && data) {
          const squads: Squad[] = data.map((squad: any) => ({
            id: squad.id,
            name: squad.name,
            tag: squad.tag,
            member_count: squad.squad_members?.length || 0,
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
    fetchTopSquads();
    fetchUpcomingMatches();
    fetchUserSquad();
    
    // Set up intervals to refresh data
    const serverInterval = setInterval(fetchServerData, 300000); // Poll every 5 minutes instead of 1 minute
    const gameInterval = setInterval(fetchGameData, 5000);
    const videosInterval = setInterval(fetchFeaturedVideos, 300000); // Refresh every 5 minutes
    const usersInterval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds
    const squadsInterval = setInterval(fetchTopSquads, 60000);
    const matchesInterval = setInterval(fetchUpcomingMatches, 30000);
    const activityInterval = setInterval(updateUserActivity, 300000); // Update activity every 5 minutes (was 30 seconds)
    
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
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'green' ? 'bg-gradient-to-r from-gray-900/90 via-green-900/60 to-gray-900/90' :
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
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'text-green-400' :
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
                    bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white hover:shadow-green-500/25' :
                    'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white hover:shadow-yellow-500/25'
                  }`}
                  onClick={() => {
                    const currentBannerSlide = bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)];
                    if (currentBannerSlide) {
                      // Use slide content instead of indices to determine navigation
                      if (currentBannerSlide.highlight === "Build Your Team") {
                        window.location.href = '/squads';
                      } else if (currentBannerSlide.highlight === "Enter the Arena") {
                        window.location.href = '/matches';
                      } else if (currentBannerSlide.highlight === "Make a Difference") {
                        window.location.href = '/donate';
                      } else if (currentBannerSlide.highlight === "Join the Battle") {
                        window.location.href = '/dashboard';
                      } else {
                        // Fallback for any other slides
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
                        bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)]?.color === 'green' ? 'bg-green-400' :
                        'bg-yellow-400'} scale-125` 
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* NEW Layout: Videos Front and Center */}
        <div 
          className="grid grid-cols-1 xl:grid-cols-12 gap-6"
          style={{
            // Limit transform effect to top 300px of scroll
            transform: scrollY < 300 ? `translateY(${Math.max(0, scrollY - 200) * -0.05}px)` : 'none',
            // Limit opacity effect to first 400px and make it fade out quickly
            opacity: scrollY < 400 ? Math.max(0.85, 1 - (scrollY - 200) / 300) : 1
          }}
        >
          {/* Left Sidebar - Online Users and Server Status */}
          <div className="xl:col-span-2 space-y-6">
            {/* Online Users (moved from right sidebar) */}
            {/* Online Users & Server Status - Mobile responsive side by side */}
            <div className="space-y-4 md:space-y-4 portrait:space-y-0 portrait:grid portrait:grid-cols-2 portrait:gap-4">
              {/* Online Users - Condensed */}
              {onlineUsers.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden">
                  <div className="bg-gray-700/50 px-3 py-2 border-b border-green-500/30">
                    <h3 className="text-green-400 font-bold text-xs tracking-wider flex items-center justify-between">
                      👥 ONLINE
                      <span className="text-green-300 text-xs font-mono bg-green-900/30 px-1 py-0.5 rounded">
                        {onlineUsers.length}
                      </span>
                    </h3>
                  </div>
                  
                  <div className="p-2 bg-gray-900 max-h-64 overflow-y-auto">
                    <div className="space-y-1">
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
                              <div className="flex items-center justify-between">
                                <span className="text-green-400 font-mono text-xs font-bold truncate">
                                  {user.in_game_alias}
                                </span>
                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {onlineUsers.length > 8 && (
                      <div className="text-center mt-2">
                        <span className="text-gray-500 text-xs">
                          +{onlineUsers.length - 8} more
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Server Status - Condensed */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="bg-gray-700/50 px-3 py-2 border-b border-green-500/30">
                  <h3 className="text-green-400 font-bold text-xs tracking-wider">🌐 SERVER</h3>
                  <p className="text-gray-400 text-xs font-mono">
                    {serverData.stats.serverStatus === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </p>
                </div>
                
                <div className="p-3">
                  <div className="text-center mb-3">
                    <div className="text-xl font-bold text-cyan-400 mb-1">
                      {serverData.stats.totalPlayers}
                    </div>
                    <div className="text-xs text-gray-400">PLAYERS</div>
                  </div>

                  {serverData.zones.length > 0 && (
                    <div className="space-y-1">
                      {serverData.zones.slice(0, 3).map((zone, index) => (
                        <div key={index} className="flex items-center justify-between text-xs bg-gray-800/30 rounded px-2 py-1">
                          <span className="text-gray-300 truncate text-xs">{zone.title}</span>
                          <span className="text-cyan-400 font-mono font-bold">{zone.playerCount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Recent Patch Notes (if available and user logged in) */}
            {user && recentPatchNotes && (
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-purple-500/30">
                  <h3 className="text-purple-400 font-bold text-sm tracking-wider">📋 UPDATES</h3>
                  <p className="text-gray-400 text-xs mt-1 font-mono">{latestUpdateDate}</p>
                </div>
                
                <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                  <div className="text-xs font-mono leading-relaxed space-y-1">
                    {parsePatchNotesFeed(recentPatchNotes)}
                  </div>
                </div>
              </section>
            )}

            {/* Live Game Data (only show if there are active players) */}
            {gameData.players.length > 0 && (
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg shadow-2xl overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-blue-500/20 hover:border-blue-500/50">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-blue-500/30">
                  <div className="flex items-center justify-between">
                    <h3 className="text-blue-400 font-bold text-sm tracking-wider">
                      {gameData.arenaName || 'Active Match'}
                    </h3>
                    <div className="text-gray-400 text-xs font-mono">
                      {gameData.gameType && (
                        <span>{gameData.gameType}</span>
                      )}
                      {gameData.baseUsed && gameData.baseUsed !== "Unknown Base" && gameData.baseUsed !== "InfServer.ConfigSetting" && (
                        <span className="ml-2">({gameData.baseUsed})</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-3 bg-gray-900">
                  <div className="space-y-3">
                    {(() => {
                      // Separate players into duelers, main teams, and spectators
                      const mainTeams: { [key: string]: GamePlayer[] } = {};
                      const duelers: GamePlayer[] = [];
                      const npSpectators: GamePlayer[] = [];
                      const specSpectators: GamePlayer[] = [];
                      
                      gameData.players.forEach(player => {
                        const teamName = player.team;
                        
                        // Check if player is a dueler first
                        if (player.class === 'Dueler') {
                          duelers.push(player);
                          return;
                        }
                        
                        // Check if spectator
                        const isNpSpec = teamName.toLowerCase().includes('np');
                        const isSpec = teamName.toLowerCase().includes('spec') || 
                                      teamName.toLowerCase() === 'spectator';
                        
                        if (isNpSpec) {
                          npSpectators.push(player);
                        } else if (isSpec) {
                          specSpectators.push(player);
                        } else {
                          // Main team player
                          if (!mainTeams[teamName]) {
                            mainTeams[teamName] = [];
                          }
                          mainTeams[teamName].push(player);
                        }
                      });

                      // Check if we should use two-team format (more than 8 players total for compact view)
                      const totalMainPlayers = Object.values(mainTeams).reduce((sum, team) => sum + team.length, 0);
                      const useTwoTeamFormat = totalMainPlayers > 8;

                      // Helper function to get team color based on team name
                      const getTeamColor = (teamName: string) => {
                        if (teamName.includes(' T')) return 'green'; // Titan teams
                        if (teamName.includes(' C')) return 'red';   // Collective teams
                        return 'gray'; // Unknown teams
                      };

                      // Helper function to get CSS classes for team color
                      const getTeamClasses = (teamName: string, type: 'border' | 'text' | 'count') => {
                        const color = getTeamColor(teamName);
                        if (type === 'border') {
                          return color === 'green' ? 'border-green-500/30' : 
                                 color === 'red' ? 'border-red-500/30' : 'border-gray-500/30';
                        }
                        if (type === 'text') {
                          return color === 'green' ? 'text-green-400' : 
                                 color === 'red' ? 'text-red-400' : 'text-gray-400';
                        }
                        if (type === 'count') {
                          return color === 'green' ? 'text-green-300' : 
                                 color === 'red' ? 'text-red-300' : 'text-gray-300';
                        }
                        return '';
                      };

                      // Helper function to get role indicator color (different from team color)
                      const getRoleClasses = (isOffenseTeam: boolean, type: 'icon' | 'text') => {
                        if (type === 'icon') {
                          return isOffenseTeam ? '🗡️' : '🛡️'; // Sword for offense, shield for defense
                        }
                        if (type === 'text') {
                          return isOffenseTeam ? 'text-orange-400' : 'text-blue-400'; // Orange for offense, blue for defense
                        }
                        return '';
                      };

                      // Organize main teams for display
                      let displayTeams = mainTeams;
                      
                      if (useTwoTeamFormat && Object.keys(mainTeams).length > 2) {
                        // Consolidate into two main teams: Collective and Titan
                        const titanPlayers: GamePlayer[] = [];
                        const collectivePlayers: GamePlayer[] = [];
                        
                        Object.entries(mainTeams).forEach(([teamName, players]) => {
                          if (teamName.includes(' T')) {
                            titanPlayers.push(...players);
                          } else if (teamName.includes(' C')) {
                            collectivePlayers.push(...players);
                          } else {
                            // Put unknown teams in the smaller group
                            if (titanPlayers.length <= collectivePlayers.length) {
                              titanPlayers.push(...players);
                            } else {
                              collectivePlayers.push(...players);
                            }
                          }
                        });
                        
                        displayTeams = {};
                        if (titanPlayers.length > 0) displayTeams['Titan Forces'] = titanPlayers;
                        if (collectivePlayers.length > 0) displayTeams['Collective Forces'] = collectivePlayers;
                      }

                      return (
                        <div className="space-y-2">
                          {/* Duelers Section - Special styling for 1v1 dueling */}
                          {duelers.length > 0 && (
                            <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-500/40 rounded-lg p-3 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-bold text-sm text-yellow-400 flex items-center gap-2">
                                  ⚔️ <span className="text-yellow-300">DUELING ARENA</span>
                                </h4>
                                <span className="text-xs font-mono font-bold text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded">
                                  {duelers.length} Fighter{duelers.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                {duelers.map((player, index) => (
                                  <div key={index} className="bg-yellow-900/20 border border-yellow-600/30 rounded p-2 text-center">
                                    <span className="text-yellow-200 font-mono font-bold text-sm">
                                      {player.alias}
                                    </span>
                                    <div className="text-xs text-yellow-400 mt-1">
                                      {getWeaponEmoji(player.weapon || '')} Dueler
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Main Teams - Show all players, ordered by class priority */}
                          <div className="space-y-2">
                            {Object.entries(displayTeams).map(([teamName, players]) => {
                              // Determine if this team is offense or defense based on majority
                              const offensePlayers = players.filter(p => p.isOffense);
                              const defensePlayers = players.filter(p => !p.isOffense);
                              const isOffenseTeam = offensePlayers.length > defensePlayers.length;
                              
                              // Sort players by class priority
                              const sortedPlayers = [...players].sort((a, b) => 
                                getClassPriority(a.class) - getClassPriority(b.class)
                              );
                              
                              return (
                                <div key={teamName} className={`bg-gray-800/50 border ${getTeamClasses(teamName, 'border')} rounded-lg p-2`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <h4 className={`font-bold text-xs ${getTeamClasses(teamName, 'text')} flex items-center gap-1`}>
                                      <span className={getRoleClasses(isOffenseTeam, 'text')}>{getRoleClasses(isOffenseTeam, 'icon')}</span>
                                      <span className="truncate">{teamName}</span>
                                    </h4>
                                    <span className={`text-xs font-mono font-bold ${getTeamClasses(teamName, 'count')}`}>
                                      {players.length}
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 gap-1">
                                    {sortedPlayers.map((player, index) => (
                                      <div key={index} className="text-xs">
                                        <span className={`font-mono ${getClassColor(player.class)}`}>
                                          {player.alias}{getWeaponEmoji(player.weapon || '')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Spectators Section - Separated by type with collapsible functionality */}
                          {(npSpectators.length > 0 || specSpectators.length > 0) && (
                            <div className="border-t border-gray-700/30 pt-2">
                              {specSpectators.length > 0 && (
                                <div className="bg-gray-800/15 border border-gray-600/15 rounded p-2 mb-2">
                                  <div 
                                    className="flex items-center justify-between text-xs mb-2 cursor-pointer hover:bg-gray-700/20 rounded p-1 transition-colors"
                                    onClick={() => setIsSpectatorsCollapsed(!isSpectatorsCollapsed)}
                                  >
                                    <span className="text-gray-500 flex items-center gap-2">
                                      <span className="transition-transform duration-200" style={{ transform: isSpectatorsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                        ▼
                                      </span>
                                      👁️ Spectators
                                    </span>
                                    <span className="text-gray-500 font-mono bg-gray-700/25 px-1 rounded">
                                      {specSpectators.length}
                                    </span>
                                  </div>
                                  
                                  {!isSpectatorsCollapsed && (
                                    <div className="grid grid-cols-1 gap-1">
                                      {specSpectators.map((player, index) => (
                                        <span key={index} className="text-xs text-gray-500 font-mono bg-gray-700/15 px-1 rounded truncate">
                                          {player.alias}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {npSpectators.length > 0 && (
                                <div className="bg-gray-800/20 border border-gray-600/20 rounded p-2">
                                  <div 
                                    className="flex items-center justify-between text-xs mb-2 cursor-pointer hover:bg-gray-700/20 rounded p-1 transition-colors"
                                    onClick={() => setIsNotPlayingCollapsed(!isNotPlayingCollapsed)}
                                  >
                                    <span className="text-gray-500 flex items-center gap-2">
                                      <span className="transition-transform duration-200" style={{ transform: isNotPlayingCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                        ▼
                                      </span>
                                      👁️ Not Playing
                                    </span>
                                    <span className="text-gray-500 font-mono bg-gray-700/30 px-1 rounded">
                                      {npSpectators.length}
                                    </span>
                                  </div>
                                  
                                  {!isNotPlayingCollapsed && (
                                    <div className="grid grid-cols-1 gap-1">
                                      {npSpectators.map((player, index) => (
                                        <span key={index} className="text-xs text-gray-500 font-mono bg-gray-700/20 px-1 rounded truncate">
                                          {player.alias}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {gameData.lastUpdated && (
                    <p className="text-xs text-gray-500 mt-2 text-center font-mono">
                      {new Date(gameData.lastUpdated).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Center Content - Featured Videos */}
          <div className="xl:col-span-7 space-y-6">
            {/* Featured Videos Section - Simplified */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-red-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-2 border-b border-red-500/30">
                <h3 className="text-lg font-bold text-red-400 tracking-wider">Videos</h3>
              </div>
              
              <div className="p-4">
                {featuredVideos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {featuredVideos.map((video, index) => {
                      const thumbnailUrl = video.thumbnail_url || 
                        (video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null);
                      
                      return (
                        <div key={video.id} className="group cursor-pointer bg-gray-700/30 border border-gray-600 rounded-lg overflow-hidden hover:border-red-500/50 transition-all duration-300"
                        onClick={() => {
                          // Default click action - prefer YouTube embed, fallback to external links
                          if (video.youtube_url) {
                            openVideoEmbed(video);
                          } else if (video.vod_url) {
                            recordVideoView(video.id);
                            window.open(video.vod_url, '_blank');
                          }
                        }}>
                          {/* Video Thumbnail - Mobile Optimized */}
                          <div className="relative aspect-video overflow-hidden">
                            {thumbnailUrl ? (
                              <>
                                <img 
                                  src={thumbnailUrl}
                                  alt={video.title}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  onLoad={() => console.log('✅ Thumbnail loaded:', thumbnailUrl)}
                                  onError={(e) => {
                                    console.warn('❌ Thumbnail failed to load:', thumbnailUrl);
                                    
                                    // Try fallback thumbnails for YouTube videos
                                    if (video.youtube_url && thumbnailUrl.includes('hqdefault')) {
                                      console.log('🔄 Trying mqdefault fallback...');
                                      const videoId = getYouTubeVideoId(video.youtube_url);
                                      e.currentTarget.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                                    } else if (video.youtube_url && thumbnailUrl.includes('mqdefault')) {
                                      console.log('🔄 Trying default fallback...');
                                      const videoId = getYouTubeVideoId(video.youtube_url);
                                      e.currentTarget.src = `https://i.ytimg.com/vi/${videoId}/default.jpg`;
                                    } else {
                                      // Use placeholder
                                      e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIyNSIgdmlld0JveD0iMCAwIDQwMCAyMjUiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMjI1IiBmaWxsPSIjMzc0MTUxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VmlkZW8gVGh1bWJuYWlsPC90ZXh0Pgo8L3N2Zz4K';
                                    }
                                  }}
                                />
                              </>
                            ) : (
                              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                <div className="text-gray-400 text-center">
                                  <div className="text-lg">📹</div>
                                </div>
                              </div>
                            )}
                            
                            {/* Simple Play Button Overlay */}
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                              <div className="w-8 h-8 md:w-12 md:h-12 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                <svg className="w-3 h-3 md:w-4 md:h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                          </div>
                          
                          {/* Simple Video Title */}
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

          {/* Right Sidebar - Matches, Squads, Top Supporters */}
          <div className="xl:col-span-3 space-y-6">
            {/* Top Supporters Widget - Moved to top */}
            <TopSupportersWidget 
              showAdminControls={true}
              maxSupporters={8}
              className="transform transition-all duration-300 hover:scale-105"
            />

            {/* Upcoming Matches */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-cyan-500/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-cyan-400 font-bold text-sm tracking-wider">🎯 UPCOMING MATCHES</h3>
                  {user && (
                    <Link 
                      href="/matches" 
                      className="text-cyan-400 hover:text-cyan-300 text-xs border border-cyan-500/50 hover:border-cyan-400 px-2 py-1 rounded transition-all duration-300"
                    >
                      CREATE
                    </Link>
                  )}
                </div>
              </div>
              
              <div className="p-3 bg-gray-900 max-h-80 overflow-y-auto">
                {upcomingMatches.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingMatches.slice(0, 4).map((match) => (
                      <Link key={match.id} href={`/matches/${match.id}`}>
                        <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-3 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer">
                          <h4 className="text-cyan-400 font-bold text-sm hover:text-cyan-300 mb-2 truncate">
                            {match.title}
                          </h4>
                          
                          <div className="text-xs text-gray-400 mb-2">
                            🕘 {new Date(match.scheduled_at).toLocaleDateString()} at {new Date(match.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          
                          {match.squad_a_name && match.squad_b_name && (
                            <div className="text-xs">
                              <span className="text-cyan-400">{match.squad_a_name}</span>
                              <span className="text-gray-400 mx-1">vs</span>
                              <span className="text-green-400">{match.squad_b_name}</span>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 mt-1">
                            {match.match_type.replace('_', ' ').toUpperCase()}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-gray-500 text-sm">No upcoming matches</div>
                    <div className="text-gray-600 text-xs mt-1">
                      {user ? 'Create the first match!' : 'Login to create matches'}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Top Squads */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-purple-500/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-purple-400 font-bold text-sm tracking-wider">🛡️ ACTIVE SQUADS</h3>
                  {user && !userSquad && (
                    <Link 
                      href="/squads" 
                      className="text-purple-400 hover:text-purple-300 text-xs border border-purple-500/50 hover:border-purple-400 px-2 py-1 rounded transition-all duration-300"
                    >
                      CREATE
                    </Link>
                  )}
                </div>
              </div>
              
              <div className="p-3 bg-gray-900 max-h-80 overflow-y-auto">
                {topSquads.length > 0 ? (
                  <div className="space-y-2">
                    {topSquads.slice(0, 6).map((squad) => (
                      <Link key={squad.id} href={`/squads/${squad.id}`}>
                        <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-3 hover:border-purple-500/50 transition-all duration-300 cursor-pointer">
                          <div className="flex items-center space-x-3">
                            {squad.banner_url && (
                              <div className="w-8 h-8 flex-shrink-0">
                                <img 
                                  src={squad.banner_url} 
                                  alt={`${squad.name} banner`}
                                  className="w-full h-full object-cover rounded"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-purple-400 font-bold text-xs">[{squad.tag}]</span>
                                <span className="text-gray-300 font-medium text-sm truncate">{squad.name}</span>
                              </div>
                              <div className="text-xs text-gray-400">
                                {squad.member_count} members • {squad.captain_alias}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-gray-500 text-sm">No active squads</div>
                    <div className="text-gray-600 text-xs mt-1">
                      {user ? 'Create the first squad!' : 'Login to create squads'}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      
      {/* YouTube Embed Modal */}
      {embedModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            // Close modal if clicking on backdrop
            if (e.target === e.currentTarget) {
              closeEmbedModal();
            }
          }}
        >
          <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
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
            
            {/* Video Container */}
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
            
            {/* Modal Footer */}
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
