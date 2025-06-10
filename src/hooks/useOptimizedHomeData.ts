import { useState, useEffect, useCallback } from 'react';
import { batchQueries, queries, cacheUtils } from '@/utils/dataFetching';
import { useAuth } from '@/lib/AuthContext';

interface HomePageData {
  recentDonations: any[];
  onlineUsers: any[];
  topSquads: any[];
  upcomingMatches: any[];
  userSquad: any | null;
  featuredVideos: any[];
  serverData: any;
  gameData: any;
}

interface UseOptimizedHomeDataReturn {
  data: HomePageData;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useOptimizedHomeData(): UseOptimizedHomeDataReturn {
  const { user } = useAuth();
  const [data, setData] = useState<HomePageData>({
    recentDonations: [],
    onlineUsers: [],
    topSquads: [],
    upcomingMatches: [],
    userSquad: null,
    featuredVideos: [],
    serverData: { zones: [], stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' }, lastUpdated: '' },
    gameData: { arenaName: null, gameType: null, baseUsed: null, players: [], lastUpdated: null }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Batch fetch static data that doesn't depend on user
      const staticQueries = [
        {
          key: 'recentDonations',
          query: () => queries.getRecentDonations(10) as any
        },
        {
          key: 'onlineUsers',
          query: () => queries.getOnlineUsers(20) as any
        },
        {
          key: 'topSquads',
          query: () => queries.getTopSquads(10) as any
        },
        {
          key: 'upcomingMatches',
          query: () => queries.getUpcomingMatches(5) as any
        }
      ];

      // Add user-specific query if user is authenticated
      if (user) {
        staticQueries.push({
          key: 'userSquad',
          query: () => queries.getUserSquad(user.id) as any
        });
      }

      // Batch execute all database queries
      const queryResults = await batchQueries<any>(staticQueries);

      // Fetch API data in parallel (these typically can't be cached in DB)
      const [serverResponse, gameResponse, videosResponse] = await Promise.allSettled([
        fetch('/api/server-status', { 
          headers: { 'Cache-Control': 'max-age=60' } // 1 minute cache
        }).then(res => res.ok ? res.json() : null),
        
        fetch('/api/game-data', { 
          headers: { 'Cache-Control': 'max-age=30' } // 30 second cache
        }).then(res => res.ok ? res.json() : null),
        
        fetch('/api/featured-videos?limit=6', { 
          headers: { 'Cache-Control': 'max-age=300' } // 5 minute cache
        }).then(res => res.ok ? res.json() : null)
      ]);

      // Process results
      const newData: HomePageData = {
        recentDonations: queryResults.recentDonations?.data || [],
        onlineUsers: queryResults.onlineUsers?.data || [],
        topSquads: queryResults.topSquads?.data || [],
        upcomingMatches: queryResults.upcomingMatches?.data || [],
        userSquad: queryResults.userSquad?.data || null,
        featuredVideos: videosResponse.status === 'fulfilled' && videosResponse.value?.videos 
          ? videosResponse.value.videos.map((video: any) => ({
              ...video,
              thumbnail_url: video.thumbnail_url || getBestYouTubeThumbnail(video.youtube_url)
            }))
          : [],
        serverData: serverResponse.status === 'fulfilled' && serverResponse.value 
          ? serverResponse.value 
          : data.serverData,
        gameData: gameResponse.status === 'fulfilled' && gameResponse.value 
          ? gameResponse.value 
          : data.gameData
      };

      setData(newData);

    } catch (err) {
      console.error('Error fetching home page data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, data.serverData, data.gameData]);

  // Helper function for YouTube thumbnails
  const getBestYouTubeThumbnail = (url?: string) => {
    if (!url) return null;
    
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    
    // Return highest quality thumbnail available
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  const getYouTubeVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Initial data fetch
  useEffect(() => {
    fetchData();
    
    // Set up refresh intervals for dynamic data
    const serverDataInterval = setInterval(() => {
      // Only fetch server/game data, not user data to avoid unnecessary re-renders
      Promise.allSettled([
        fetch('/api/server-status').then(res => res.ok ? res.json() : null),
        fetch('/api/game-data').then(res => res.ok ? res.json() : null)
      ]).then(([serverResult, gameResult]) => {
        setData(prev => ({
          ...prev,
          serverData: serverResult.status === 'fulfilled' && serverResult.value 
            ? serverResult.value 
            : prev.serverData,
          gameData: gameResult.status === 'fulfilled' && gameResult.value 
            ? gameResult.value 
            : prev.gameData
        }));
      });
    }, 30000); // Update every 30 seconds

    // Clear cache periodically to prevent memory bloat
    const cacheCleanupInterval = setInterval(() => {
      cacheUtils.clear();
    }, 600000); // Clear cache every 10 minutes

    return () => {
      clearInterval(serverDataInterval);
      clearInterval(cacheCleanupInterval);
    };
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
} 