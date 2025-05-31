'use client';

import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
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
  const [recentDonations, setRecentDonations] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [topSquads, setTopSquads] = useState<Squad[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  const [featuredVideos, setFeaturedVideos] = useState<FeaturedVideo[]>([]);
  
  // Carousel and animation states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  
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
          console.log('Current authenticated user:', {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          });
          
          // Debug: Check current user's profile
          const { data: currentProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
          if (profileError) {
            console.error('Error fetching user profile:', {
              message: profileError.message,
              details: profileError.details,
              hint: profileError.hint,
              code: profileError.code,
              full_error: profileError
            });
          } else {
            console.log('Current user profile:', currentProfile);
          }
          
          const { data } = await supabase
            .from('profiles')
            .select('is_admin, ctf_role')
            .eq('id', user.id)
            .single();
        
          if (data) {
            setUserProfile(data);
          }
        } catch (error) {
          console.error('Error in fetchUserProfile (catch):', {
            error,
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        console.log('No authenticated user found');
      }
    };

    // Comprehensive diagnostic function
    const runDiagnostics = async () => {
      console.log('🔍 Running comprehensive diagnostics...');
      
      // Test 1: Basic Supabase connection
      try {
        console.log('1️⃣ Testing basic Supabase connection...');
        const { data: testData, error: testError } = await supabase
          .from('profiles')
          .select('count')
          .limit(1);
        
        if (testError) {
          console.error('❌ Basic connection failed:', testError);
        } else {
          console.log('✅ Basic Supabase connection working');
        }
      } catch (error) {
        console.error('❌ Connection test failed:', error);
      }

      // Test 2: Check if user profile exists
      if (user) {
        try {
          console.log('2️⃣ Checking if user profile exists...');
          const { data: profileExists, error: existsError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id);
          
          if (existsError) {
            console.error('❌ Profile check failed:', existsError);
          } else if (profileExists && profileExists.length > 0) {
            console.log('✅ User profile exists');
          } else {
            console.log('⚠️ User profile does NOT exist - this might be the issue!');
            
            // Try to create profile
            console.log('3️⃣ Attempting to create missing profile...');
            const { error: createError } = await supabase
              .from('profiles')
              .insert([{
                id: user.id,
                email: user.email,
                in_game_alias: user.email?.split('@')[0] || 'User',
                last_seen: new Date().toISOString()
              }]);
            
            if (createError) {
              console.error('❌ Failed to create profile:', createError);
            } else {
              console.log('✅ Profile created successfully!');
            }
          }
        } catch (error) {
          console.error('❌ Profile existence check failed:', error);
        }
      }

      // Test 3: Test last_seen column exists
      try {
        console.log('4️⃣ Testing last_seen column...');
        const { data: columnTest, error: columnError } = await supabase
          .from('profiles')
          .select('last_seen')
          .limit(1);
        
        if (columnError) {
          console.error('❌ last_seen column test failed:', columnError);
        } else {
          console.log('✅ last_seen column exists and accessible');
        }
      } catch (error) {
        console.error('❌ Column test failed:', error);
      }

      // Test 4: Simple update test
      if (user) {
        try {
          console.log('5️⃣ Testing profile update...');
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id);
          
          if (updateError) {
            console.error('❌ Profile update failed:', updateError);
          } else {
            console.log('✅ Profile update successful');
          }
        } catch (error) {
          console.error('❌ Update test failed:', error);
        }
      }

      console.log('🔍 Diagnostics complete!');
    };

    // Quick profile check (simplified, no timeout issues)
    const quickProfileCheck = async () => {
      if (!user) return;
      
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();
          
        if (error && error.code === 'PGRST116') {
          // Profile doesn't exist, create it
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
      }
    };

    // Update user's last_seen timestamp when they're active
    const updateUserActivity = async () => {
      if (user) {
        try {
          const now = new Date().toISOString();
          console.log('Updating user activity for:', user.id, 'at', now);
          
          const { error } = await supabase
            .from('profiles')
            .update({ last_seen: now })
            .eq('id', user.id);
            
          if (error) {
            console.error('Error updating user activity:', {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
              full_error: error
            });
          } else {
            console.log('User activity updated successfully');
          }
        } catch (error) {
          console.error('Error updating user activity (catch):', {
            error,
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }
    };

    fetchUserProfile();
    updateUserActivity();
    quickProfileCheck(); // Quick profile check without timeout issues

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

    // Fetch recent donations
    const fetchRecentDonations = async () => {
      try {
        const response = await fetch('/api/recent-donations');
        if (response.ok) {
          const data = await response.json();
          setRecentDonations(data);
        }
      } catch (error) {
        console.error('Error fetching recent donations:', error);
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

    // Fetch top squads
    const fetchTopSquads = async () => {
      try {
        // Use the optimized function instead of individual queries
        const { data, error } = await supabase.rpc('get_all_squads_optimized');

        if (!error && data) {
          const squads: Squad[] = data.slice(0, 6).map((squad: any) => ({
            id: squad.squad_id,
            name: squad.squad_name,
            tag: squad.squad_tag,
            member_count: Number(squad.member_count),
            captain_alias: squad.captain_alias,
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
    fetchRecentDonations();
    fetchFeaturedVideos();
    fetchOnlineUsers();
    fetchTopSquads();
    fetchUpcomingMatches();
    fetchUserSquad();
    
    // Set up intervals to refresh data
    const serverInterval = setInterval(fetchServerData, 60000);
    const gameInterval = setInterval(fetchGameData, 5000);
    const donationsInterval = setInterval(fetchRecentDonations, 30000);
    const videosInterval = setInterval(fetchFeaturedVideos, 300000); // Refresh every 5 minutes
    const usersInterval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds
    const squadsInterval = setInterval(fetchTopSquads, 60000);
    const matchesInterval = setInterval(fetchUpcomingMatches, 30000);
    const activityInterval = setInterval(updateUserActivity, 30000); // Update activity every 30 seconds
    
    return () => {
      clearInterval(serverInterval);
      clearInterval(gameInterval);
      clearInterval(donationsInterval);
      clearInterval(videosInterval);
      clearInterval(usersInterval);
      clearInterval(squadsInterval);
      clearInterval(matchesInterval);
      clearInterval(activityInterval);
      clearInterval(carouselInterval);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [user]);

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
            <source src="/CTFPL-Website-Header-1.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Dynamic Overlay Gradient */}
          <div 
            className={`absolute inset-0 transition-all duration-1000 ${
              bannerSlides.length > 0 && bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)] ? (
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'cyan' ? 'bg-gradient-to-r from-gray-900/80 via-cyan-900/40 to-gray-900/80' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'purple' ? 'bg-gradient-to-r from-gray-900/80 via-purple-900/40 to-gray-900/80' :
                bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)].color === 'green' ? 'bg-gradient-to-r from-gray-900/80 via-green-900/40 to-gray-900/80' :
                'bg-gradient-to-r from-gray-900/80 via-yellow-900/40 to-gray-900/80'
              ) : 'bg-gradient-to-r from-gray-900/80 via-cyan-900/40 to-gray-900/80'
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
                      if (currentSlide === 1 || currentBannerSlide.highlight === "Build Your Team") window.location.href = '/squads';
                      else if (currentSlide === 2 || currentBannerSlide.highlight === "Enter the Arena") window.location.href = '/matches';
                      else if (currentSlide === 3 || currentBannerSlide.highlight === "Make a Difference") window.location.href = '/donate';
                      else window.location.href = '/dashboard';
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
          {/* Left Sidebar - Simplified Server Status */}
          <div className="xl:col-span-2 space-y-6">
            {/* Simplified Server Status */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-green-500/20 hover:border-green-500/50">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-green-500/30">
                <h3 className="text-green-400 font-bold text-sm tracking-wider">🌐 SERVER STATUS</h3>
                <p className="text-gray-400 text-xs mt-1 font-mono">
                  {serverData.stats.serverStatus === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                </p>
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
                  <h3 className="text-blue-400 font-bold text-sm tracking-wider">🎮 LIVE GAME</h3>
                  <p className="text-gray-400 text-xs mt-1 font-mono">
                    {gameData.arenaName || 'Active Match'}
                  </p>
                </div>
                
                <div className="p-3 bg-gray-900">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-cyan-400 font-bold text-sm">{gameData.gameType}</div>
                      {gameData.baseUsed && gameData.baseUsed !== "Unknown Base" && gameData.baseUsed !== "InfServer.ConfigSetting" && (
                        <div className="text-gray-400 text-xs">{gameData.baseUsed}</div>
                      )}
                    </div>

                    {(() => {
                      // Separate teams into main teams and spectators
                      const mainTeams: { [key: string]: GamePlayer[] } = {};
                      const allSpectators: GamePlayer[] = [];
                      
                      gameData.players.forEach(player => {
                        const teamName = player.team;
                        const isSpectator = teamName.toLowerCase().includes('spec') || 
                                          teamName.toLowerCase().includes('np') ||
                                          teamName.toLowerCase() === 'spectator';
                        
                        if (isSpectator) {
                          allSpectators.push(player);
                        } else {
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
                          {/* Main Teams - Compact view */}
                          <div className="space-y-2">
                            {Object.entries(displayTeams).map(([teamName, players]) => {
                              // Determine if this team is offense or defense based on majority
                              const offensePlayers = players.filter(p => p.isOffense);
                              const defensePlayers = players.filter(p => !p.isOffense);
                              const isOffenseTeam = offensePlayers.length > defensePlayers.length;
                              
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
                                    {players.slice(0, 4).map((player, index) => (
                                      <div key={index} className="text-xs flex items-center justify-between">
                                        <span className={`font-mono truncate ${getClassColor(player.class)}`}>
                                          {player.alias}{getWeaponEmoji(player.weapon || '')}
                                        </span>
                                        <span className="text-gray-500 text-xs">{player.class}</span>
                                      </div>
                                    ))}
                                    {players.length > 4 && (
                                      <div className="text-xs text-gray-500 text-center">
                                        +{players.length - 4} more
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Spectators Section - Compact */}
                          {allSpectators.length > 0 && (
                            <div className="border-t border-gray-700/30 pt-2">
                              <details className="group">
                                <summary className="cursor-pointer bg-gray-800/20 border border-gray-600/20 rounded p-2 hover:bg-gray-800/30 transition-colors">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 flex items-center gap-1">
                                      👁️ Spectators
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 font-mono bg-gray-700/30 px-1 rounded">
                                        {allSpectators.length}
                                      </span>
                                      <span className="text-gray-600 text-xs group-open:rotate-90 transition-transform">
                                        ▶
                                      </span>
                                    </div>
                                  </div>
                                </summary>
                                
                                <div className="mt-2 bg-gray-800/10 border border-gray-600/10 rounded p-2">
                                  <div className="grid grid-cols-1 gap-1">
                                    {allSpectators.map((player, index) => (
                                      <span key={index} className="text-xs text-gray-500 font-mono bg-gray-700/20 px-1 rounded truncate">
                                        {player.alias}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </details>
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
            {/* Featured Videos Section */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-red-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-6 py-4 border-b border-red-500/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-bold text-red-400 tracking-wider">🎥 FEATURED VIDEOS</h3>
                  <span className="text-red-300 text-sm font-mono">
                    Infantry Online Content
                  </span>
                </div>
                <p className="text-gray-400 text-sm mt-2">
                  Watch the latest matches, tutorials, and highlights from the Infantry community
                </p>
              </div>
              
              <div className="p-6">
                {featuredVideos.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {featuredVideos.map((video, index) => {
                      const thumbnailUrl = video.thumbnail_url || 
                        (video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null);
                      
                      return (
                        <div key={video.id} className={`
                          ${index === 0 ? 'lg:col-span-2' : ''} 
                          group cursor-pointer bg-gray-700/30 border border-gray-600 rounded-lg overflow-hidden 
                          hover:border-red-500/50 transition-all duration-300 transform hover:scale-[1.02]
                        `}
                        onClick={() => {
                          // Default click action - play the video
                          if (video.youtube_url) {
                            recordVideoView(video.id);
                            window.open(video.youtube_url, '_blank');
                          } else if (video.vod_url) {
                            recordVideoView(video.id);
                            window.open(video.vod_url, '_blank');
                          }
                        }}>
                          {/* Video Thumbnail */}
                          <div className={`relative ${index === 0 ? 'aspect-video' : 'aspect-video'} overflow-hidden`}>
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
                                {/* Debug info overlay for thumbnails */}
                                <div className="absolute top-1 right-1 bg-black/50 text-white text-xs px-1 rounded">
                                  📸
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                <div className="text-gray-400 text-center">
                                  <div className="text-4xl mb-2">🎬</div>
                                  <div className="text-sm">Video Thumbnail</div>
                                  {video.youtube_url && (
                                    <div className="text-xs mt-1 text-red-400">
                                      Missing thumbnail for: {getYouTubeVideoId(video.youtube_url) || 'Invalid URL'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Play Button Overlay */}
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Video Type Badge */}
                            <div className="absolute top-3 left-3">
                              <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                                {getVideoTypeIcon(video.video_type)} {video.video_type.toUpperCase()}
                              </span>
                            </div>
                            
                            {/* View Count */}
                            <div className="absolute bottom-3 right-3">
                              <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                                👁️ {video.view_count}
                              </span>
                            </div>
                          </div>
                          
                          {/* Video Info */}
                          <div className="p-4">
                            <h4 className={`font-bold mb-2 group-hover:text-red-300 transition-colors ${
                              index === 0 ? 'text-lg' : 'text-base'
                            }`}>
                              {video.title}
                            </h4>
                            
                            <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                              {video.description}
                            </p>
                            
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>
                                {new Date(video.published_at).toLocaleDateString()}
                              </span>
                              {video.match_title && (
                                <span className="text-blue-400">
                                  🎮 {video.match_title}
                                </span>
                              )}
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2 mt-3">
                              {video.youtube_url && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    recordVideoView(video.id);
                                    window.open(video.youtube_url, '_blank');
                                  }}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 px-3 rounded transition-colors"
                                >
                                  ▶ Watch on YouTube
                                </button>
                              )}
                              {video.vod_url && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    recordVideoView(video.id);
                                    window.open(video.vod_url, '_blank');
                                  }}
                                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 px-3 rounded transition-colors"
                                >
                                  📺 Watch VOD
                                </button>
                              )}
                              {video.match_id && (
                                <Link 
                                  href={`/matches/${video.match_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-3 rounded transition-colors text-center"
                                >
                                  🎯 View Match
                                </Link>
                              )}
                            </div>

                            {/* Debug Info */}
                            <div className="mt-2 text-xs text-gray-600 font-mono">
                              {video.youtube_url && (
                                <div>🔗 YouTube: {getYouTubeVideoId(video.youtube_url) || 'Invalid'}</div>
                              )}
                              {thumbnailUrl && (
                                <div>🖼️ Thumb: {thumbnailUrl.substring(0, 50)}...</div>
                              )}
                            </div>
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

          {/* Right Sidebar - Matches, Squads, Online Users (Dynamic) */}
          <div className="xl:col-span-3 space-y-6">
            {/* Dynamic content based on data availability - prioritize most important */}
            
            {/* Online Users (always show if there are users) */}
            {onlineUsers.length > 0 && (
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-green-500/30">
                  <h3 className="text-green-400 font-bold text-sm tracking-wider flex items-center justify-between">
                    👥 ONLINE NOW
                    <span className="text-green-300 text-xs font-mono bg-green-900/30 px-2 py-1 rounded">
                      {onlineUsers.length}
                    </span>
                  </h3>
                </div>
                
                <div className="p-3 bg-gray-900 max-h-72 overflow-y-auto">
                  <div className="space-y-2">
                    {onlineUsers.slice(0, 8).map((user) => (
                      <div key={user.id} className="bg-gray-800/50 border border-green-500/20 rounded-lg p-2">
                        <div className="flex items-center space-x-3">
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
                              <span className="text-green-400 font-mono text-sm font-bold truncate">
                                {user.in_game_alias}
                              </span>
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(user.last_seen).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {onlineUsers.length > 8 && (
                    <div className="text-center mt-3">
                      <span className="text-gray-500 text-xs">
                        +{onlineUsers.length - 8} more online
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}

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

            {/* Recent Donations */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-yellow-400 font-bold text-sm tracking-wider">💰 SUPPORT</h3>
                  <Link 
                    href="/donate" 
                    className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-500/50 hover:border-yellow-400 px-2 py-1 rounded transition-all duration-300"
                  >
                    DONATE
                  </Link>
                </div>
              </div>
              
              <div className="p-3 bg-gray-900 max-h-64 overflow-y-auto">
                {recentDonations.length > 0 ? (
                  <div className="space-y-2">
                    {recentDonations.slice(0, 5).map((donation, index) => (
                      <div key={index} className="bg-gray-800/50 border border-yellow-500/20 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-yellow-400 font-bold text-sm">
                            ${donation.amount.toFixed(2)}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {new Date(donation.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-cyan-400 font-mono text-xs truncate">
                          {donation.customerName}
                        </div>
                        {donation.message && (
                          <div className="text-gray-300 text-xs italic truncate mt-1" title={donation.message}>
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
