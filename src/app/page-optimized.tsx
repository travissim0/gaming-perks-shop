'use client';

import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import { toast } from 'react-hot-toast';
import { ProgressiveSection, useProgressiveData } from '@/components/ProgressiveSection';
import { 
  VideoSkeleton, 
  UserListSkeleton, 
  SquadCardSkeleton, 
  MatchCardSkeleton,
  CardSkeleton 
} from '@/components/LoadingSkeleton';

// Immediate render: Banner and layout structure
export default function Home() {
  const { user, loading } = useAuth();
  
  // Immediate UI state (no loading)
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

  // Banner slides data - available immediately
  const bannerSlides = [
    {
      title: "FREE INFANTRY",
      subtitle: "Capture the Flag: Player's League",
      description: "🎮 Competitive Gaming Platform",
      highlight: "Join the Battle",
      color: "cyan",
      showWhen: user ? "never" : "always"
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
  ].filter(slide => slide.showWhen === "always");

  // Progressive data loading with delays
  const serverData = useProgressiveData(
    () => fetch('/api/server-status').then(res => res.json()),
    { zones: [], stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' }, lastUpdated: '' },
    500, // Load after 500ms
    'server-status'
  );

  const gameData = useProgressiveData(
    () => fetch('/api/game-data').then(res => res.json()),
    { arenaName: null, gameType: null, baseUsed: null, players: [], lastUpdated: null },
    800,
    'game-data'
  );

  const featuredVideos = useProgressiveData(
    () => fetch('/api/featured-videos?limit=6').then(res => res.json()).then(data => data.videos || []),
    [],
    1000,
    'featured-videos'
  );

  const recentDonations = useProgressiveData(
    () => fetch('/api/recent-donations').then(res => res.json()).then(data => data.donations || data),
    [],
    1200,
    'recent-donations'
  );

  const onlineUsers = useProgressiveData(
    () => fetch('/api/online-users').then(res => res.ok ? res.json() : []),
    [],
    1400,
    'online-users'
  );

  const topSquads = useProgressiveData(
    () => fetch('/api/squads?limit=6').then(res => res.ok ? res.json() : []),
    [],
    1600,
    'top-squads'
  );

  // Immediate effects for UI only
  useEffect(() => {
    // Scroll effect handler
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    
    // Carousel auto-advance
    const carouselInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 5000);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearInterval(carouselInterval);
    };
  }, [bannerSlides.length]);

  // User profile update (non-blocking, background)
  useEffect(() => {
    if (!user) return;
    
    // Run in background without blocking UI
    const updateProfile = async () => {
      try {
        await fetch('/api/user/update-activity', { method: 'POST' });
      } catch (error) {
        console.warn('Profile update failed:', error);
      }
    };
    
    updateProfile();
  }, [user]);

  // Helper functions
  const getYouTubeVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const getBestYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  const openVideoEmbed = (video: any) => {
    const videoId = getYouTubeVideoId(video.youtube_url || '');
    if (videoId) {
      setEmbedModal({
        isOpen: true,
        videoId,
        title: video.title
      });
    }
  };

  const closeEmbedModal = () => {
    setEmbedModal({
      isOpen: false,
      videoId: null,
      title: ''
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar />
      
      {/* HERO BANNER - Loads Immediately */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div 
          ref={bannerRef}
          className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 to-purple-600/20"
          style={{
            transform: `translateY(${scrollY * 0.5}px)`,
          }}
        />
        
        <div className="relative z-10 text-center max-w-4xl mx-auto px-4">
          {bannerSlides.map((slide, index) => (
            <div
              key={index}
              className={`transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0 absolute inset-0'
              }`}
            >
              <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 tracking-wider">
                {slide.title}
              </h1>
              <p className="text-xl md:text-2xl text-cyan-300 mb-4">
                {slide.subtitle}
              </p>
              <p className="text-lg text-gray-300 mb-8">
                {slide.description}
              </p>
              <Link href="/auth">
                <button className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105">
                  {slide.highlight}
                </button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CONTENT SECTIONS - Load Progressively */}
      <div className="container mx-auto px-4 py-12 space-y-12">
        
        {/* Server Status - High Priority (500ms delay) */}
        <ProgressiveSection
          delay={500}
          priority="high"
          name="server-status"
          fallback={<CardSkeleton className="h-32" />}
        >
          <div className="bg-white/10 backdrop-blur rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">🖥️ Server Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">
                  {serverData.data.stats?.totalPlayers || 0}
                </div>
                <div className="text-gray-300">Players Online</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">
                  {serverData.data.stats?.activeGames || 0}
                </div>
                <div className="text-gray-300">Active Games</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${
                  serverData.data.stats?.serverStatus === 'online' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {serverData.data.stats?.serverStatus?.toUpperCase() || 'CHECKING'}
                </div>
                <div className="text-gray-300">Server Status</div>
              </div>
            </div>
          </div>
        </ProgressiveSection>

        {/* Featured Videos - Medium Priority (1000ms delay) */}
        <ProgressiveSection
          delay={1000}
          priority="medium"
          name="featured-videos"
          fallback={
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">🎬 Featured Videos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <VideoSkeleton key={i} />
                ))}
              </div>
            </div>
          }
        >
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">🎬 Featured Videos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredVideos.data.map((video: any) => (
                <div
                  key={video.id}
                  className="bg-white/10 backdrop-blur rounded-lg overflow-hidden cursor-pointer hover:bg-white/20 transition-colors"
                  onClick={() => openVideoEmbed(video)}
                >
                  <div className="aspect-video bg-gray-800 relative">
                    {video.youtube_url && (
                      <img
                        src={getBestYouTubeThumbnail(video.youtube_url) || ''}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder-video.jpg';
                        }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8 5v10l8-5z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white mb-2">{video.title}</h3>
                    <p className="text-sm text-gray-300">{video.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ProgressiveSection>

        {/* Side by Side: Online Users & Recent Donations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Online Users - Medium Priority (1400ms delay) */}
          <ProgressiveSection
            delay={1400}
            priority="medium"
            name="online-users"
            fallback={
              <div className="bg-white/10 backdrop-blur rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4">👥 Online Players</h3>
                <UserListSkeleton count={8} />
              </div>
            }
          >
            <div className="bg-white/10 backdrop-blur rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">👥 Online Players</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {onlineUsers.data.slice(0, 10).map((user: any) => (
                  <div key={user.id} className="flex items-center space-x-3 p-2 rounded hover:bg-white/10">
                    <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {user.in_game_alias?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-white">{user.in_game_alias}</span>
                  </div>
                ))}
              </div>
            </div>
          </ProgressiveSection>

          {/* Recent Donations - Low Priority (1200ms delay) */}
          <ProgressiveSection
            delay={1200}
            priority="low"
            name="recent-donations"
            fallback={
              <div className="bg-white/10 backdrop-blur rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4">💰 Recent Supporters</h3>
                <UserListSkeleton count={5} />
              </div>
            }
          >
            <div className="bg-white/10 backdrop-blur rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">💰 Recent Supporters</h3>
              <div className="space-y-3">
                {recentDonations.data.slice(0, 5).map((donation: any, index: number) => (
                  <div key={index} className="bg-white/5 rounded p-3">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-white">
                        {donation.donor_name || 'Anonymous'}
                      </span>
                      <span className="text-green-400 font-bold">
                        ${(donation.amount / 100).toFixed(2)}
                      </span>
                    </div>
                    {donation.message && (
                      <p className="text-sm text-gray-300 mt-1">{donation.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ProgressiveSection>
        </div>

        {/* Top Squads - Low Priority (1600ms delay) */}
        <ProgressiveSection
          delay={1600}
          priority="low"
          name="top-squads"
          fallback={
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">🛡️ Active Squads</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SquadCardSkeleton key={i} />
                ))}
              </div>
            </div>
          }
        >
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">🛡️ Active Squads</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topSquads.data.slice(0, 6).map((squad: any) => (
                <Link key={squad.id} href={`/squads/${squad.id}`}>
                  <div className="bg-white/10 backdrop-blur rounded-lg p-6 hover:bg-white/20 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                        {squad.tag || squad.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{squad.name}</h3>
                        <p className="text-sm text-gray-300">{squad.member_count || 0} members</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300">
                      {squad.description || 'An active squad in the CTF league'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </ProgressiveSection>
      </div>

      {/* YouTube Embed Modal */}
      {embedModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">{embedModal.title}</h2>
              <button
                onClick={closeEmbedModal}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${embedModal.videoId}?autoplay=1`}
                title={embedModal.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 