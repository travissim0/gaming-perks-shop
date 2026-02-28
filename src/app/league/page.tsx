'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import TopSupportersWidget from '@/components/TopSupportersWidget';
import NewsSection from '@/components/NewsSection';
import { useDonationMode } from '@/hooks/useDonationMode';
import { supabase } from '@/lib/supabase';
import { VIDEO_THUMBNAIL_PLACEHOLDER } from '@/lib/constants';
import { getClassColor } from '@/utils/classColors';
import { getEloTier } from '@/utils/eloTiers';

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
  team: string;
  teamType?: 'Titan' | 'Collective';
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

interface RecordedGamePlayer {
  player_name: string;
  main_class: string;
  side: string;
  team: string;
  kills: number;
  deaths: number;
  flag_captures?: number;
  carrier_kills?: number;
}

interface RecordedGame {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  duration: number;
  totalPlayers: number;
  players: RecordedGamePlayer[];
  videoInfo: {
    has_video: boolean;
    youtube_url?: string;
    vod_url?: string;
    video_title?: string;
    thumbnail_url?: string;
  };
  winningInfo?: {
    type: string;
    side: string;
    winner: string;
  };
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

interface RecentGamePlayer {
  name?: string;
  player_name?: string;
  alias?: string;
}

interface RecentGame {
  gameId: string;
  gameMode: string;
  mapName: string;
  gameDate: string;
  playerDetails?: RecentGamePlayer[];
  players?: RecentGamePlayer[];
}

interface SupabaseProfileRow {
  id: string;
  in_game_alias: string;
  last_seen: string;
  avatar_url: string | null;
}

interface SupabaseSquadRow {
  id: string;
  name: string;
  tag: string;
  banner_url?: string;
  captain_id: string;
  profiles: { in_game_alias: string } | null;
}

interface SupabaseMatchRow {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  match_type: string;
  squad_a: { name: string } | null;
  squad_b: { name: string } | null;
}

interface EloLeaderEntry {
  player_name: string;
  elo_rating: string;
  weighted_elo: string;
  total_games: number;
  win_rate: string;
  elo_tier: { name: string; color: string; min: number; max: number };
}

interface SeasonStanding {
  squad_name: string;
  squad_tag: string;
  squad_id: string;
  rank: number;
  wins: number;
  losses: number;
  points: number;
  win_percentage: number;
}

interface ActiveSeason {
  id: string;
  season_number: number;
  season_name: string | null;
  status: string;
  league_name?: string;
}

// ── Banner slide color helpers ──────────────────────────────────────────
const SLIDE_COLORS: Record<string, {
  overlay: string;
  text: string;
  button: string;
  dot: string;
}> = {
  cyan:   { overlay: 'bg-gradient-to-r from-gray-900/90 via-cyan-900/60 to-gray-900/90',   text: 'text-cyan-400',   button: 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 hover:shadow-cyan-500/25',     dot: 'bg-cyan-400' },
  purple: { overlay: 'bg-gradient-to-r from-gray-900/90 via-purple-900/60 to-gray-900/90', text: 'text-purple-400', button: 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 hover:shadow-purple-500/25', dot: 'bg-purple-400' },
  pink:   { overlay: 'bg-gradient-to-r from-gray-900/90 via-pink-900/60 to-gray-900/90',   text: 'text-pink-400',   button: 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 hover:shadow-pink-500/25',     dot: 'bg-pink-400' },
  green:  { overlay: 'bg-gradient-to-r from-gray-900/90 via-green-900/60 to-gray-900/90',  text: 'text-green-400',  button: 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-green-500/25',   dot: 'bg-green-400' },
  blue:   { overlay: 'bg-gradient-to-r from-gray-900/90 via-blue-900/60 to-gray-900/90',   text: 'text-blue-400',   button: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 hover:shadow-blue-500/25',     dot: 'bg-blue-400' },
  orange: { overlay: 'bg-gradient-to-r from-gray-900/90 via-orange-900/60 to-gray-900/90', text: 'text-orange-400', button: 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 hover:shadow-orange-500/25',   dot: 'bg-orange-400' },
  indigo: { overlay: 'bg-gradient-to-r from-gray-900/90 via-indigo-900/60 to-gray-900/90', text: 'text-indigo-400', button: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/25', dot: 'bg-indigo-400' },
  teal:   { overlay: 'bg-gradient-to-r from-gray-900/90 via-teal-900/60 to-gray-900/90',   text: 'text-teal-400',   button: 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 hover:shadow-teal-500/25',     dot: 'bg-teal-400' },
  red:    { overlay: 'bg-gradient-to-r from-red-900/90 via-red-900/60 to-gray-900/90',     text: 'text-red-400',    button: 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 hover:shadow-red-500/25',       dot: 'bg-red-400' },
  yellow: { overlay: 'bg-gradient-to-r from-yellow-900/60 to-gray-900/90',                 text: 'text-yellow-400', button: 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 hover:shadow-yellow-500/25', dot: 'bg-yellow-400' },
};

const getSlideColor = (color: string) => SLIDE_COLORS[color] || SLIDE_COLORS.cyan;

// ── Banner slides data ──────────────────────────────────────────────────
const ALL_BANNER_SLIDES = [
  { title: "FREE INFANTRY", subtitle: "Capture the Flag: Player's League", description: "🎮 Competitive Gaming Platform", highlight: "Join the Battle", color: "cyan", href: "/dashboard", showWhen: "guest" as const },
  { title: "ACTIVE SQUADS", subtitle: "Form Elite Teams", description: "🛡️ Create or Join Competitive Squads", highlight: "Build Your Team", color: "purple", href: "/squads", showWhen: "always" as const },
  { title: "FREE AGENTS", subtitle: "Find Your Perfect Squad", description: "🎯 Connect Players with Teams", highlight: "Join the Pool", color: "pink", href: "/free-agents", showWhen: "always" as const },
  { title: "LIVE MATCHES", subtitle: "Compete in Real-Time", description: "⚔️ Schedule and Play Competitive Matches", highlight: "Enter the Arena", color: "green", href: "/matches", showWhen: "always" as const },
  { title: "PLAYER STATS", subtitle: "Track Your Performance", description: "📊 Advanced Statistics & ELO Rankings", highlight: "View Stats", color: "blue", href: "/stats", showWhen: "always" as const },
  { title: "DUELING SYSTEM", subtitle: "1v1 Competitive Matches", description: "⚡ Face Off in Skill-Based Duels", highlight: "Challenge Players", color: "orange", href: "/dueling", showWhen: "always" as const },
  { title: "COMMUNITY FORUM", subtitle: "Connect with Players", description: "💬 Discuss Strategies & Share Content", highlight: "Join Discussion", color: "indigo", href: "/forum", showWhen: "always" as const },
  { title: "NEWS & UPDATES", subtitle: "Stay Informed", description: "📰 Latest Patch Notes & Announcements", highlight: "Read Latest", color: "teal", href: "/news", showWhen: "always" as const },
  { title: "GAMING PERKS", subtitle: "Enhance Your Experience", description: "🛍️ Exclusive In-Game Perks & Items", highlight: "Browse Shop", color: "red", href: "/perks", showWhen: "always" as const },
  { title: "SUPPORT THE GAME", subtitle: "Keep Free Infantry Running", description: "💰 Donate to Support Development", highlight: "Make a Difference", color: "yellow", href: "/donate", showWhen: "always" as const },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [userProfile, setUserProfile] = useState<Record<string, unknown> | null>(null);
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
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);

  // Recorded games state
  const [recordedGames, setRecordedGames] = useState<RecordedGame[]>([]);
  const [showRecordedGamesTheater, setShowRecordedGamesTheater] = useState(false);
  const [showVideoEmbed, setShowVideoEmbed] = useState(false);

  // Carousel and animation states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  // YouTube embed modal state
  const [embedModal, setEmbedModal] = useState<{
    isOpen: boolean;
    videoId: string | null;
    title: string;
  }>({ isOpen: false, videoId: null, title: '' });

  // New widgets state
  const [eloLeaders, setEloLeaders] = useState<EloLeaderEntry[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<SeasonStanding[]>([]);
  const [activeSeason, setActiveSeason] = useState<ActiveSeason | null>(null);

  // Filter slides based on user authentication
  const bannerSlides = ALL_BANNER_SLIDES.filter(slide =>
    slide.showWhen === "always" ||
    (slide.showWhen === "guest" && !user) ||
    (slide.showWhen === "user" && user)
  );

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        try {
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
        }
      }
    };

    const quickProfileCheck = async () => {
      if (!user) return;

      try {
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
          await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              in_game_alias: null,
              last_seen: new Date().toISOString()
            }]);
        }
      } catch (error) {
        console.error('Quick profile check error:', error);
      }
    };

    const updateUserActivity = async () => {
      if (!user) return;

      const lastUpdate = localStorage.getItem('lastActivityUpdate');
      const now = Date.now();
      if (lastUpdate && (now - parseInt(lastUpdate)) < 60000) {
        return;
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
      }
    };

    if (user) {
      fetchUserProfile();
      updateUserActivity();
      quickProfileCheck();
    }

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    const carouselInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 5000);

    window.addEventListener('scroll', handleScroll);

    // ── Data fetch functions ──────────────────────────────────────────

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

    const fetchFeaturedVideos = async () => {
      try {
        const response = await fetch('/api/featured-videos?limit=6');

        if (!response.ok) return;

        const data = await response.json();

        if (data.videos && Array.isArray(data.videos)) {
          const videosWithThumbnails = data.videos.map((video: FeaturedVideo) => {
            const autoThumbnail = video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null;
            return {
              ...video,
              thumbnail_url: video.thumbnail_url || autoThumbnail
            };
          });

          setFeaturedVideos(videosWithThumbnails);
        }
      } catch (error) {
        console.error('Error fetching featured videos:', error);

        // Fallback: try direct RPC call
        try {
          const { data, error: rpcError } = await supabase.rpc('get_featured_videos', { limit_count: 6 });

          if (rpcError) return;

          if (data) {
            const videosWithThumbnails = data.map((video: FeaturedVideo) => {
              const autoThumbnail = video.youtube_url ? getBestYouTubeThumbnail(video.youtube_url) : null;
              return {
                ...video,
                thumbnail_url: video.thumbnail_url || autoThumbnail
              };
            });

            setFeaturedVideos(videosWithThumbnails);
          }
        } catch (rpcError) {
          console.error('RPC fallback also failed:', rpcError);
        }
      }
    };

    const fetchOnlineUsers = async () => {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data: onlineData, error } = await supabase
          .from('profiles')
          .select('id, in_game_alias, email, last_seen, avatar_url')
          .gte('last_seen', fiveMinutesAgo)
          .order('last_seen', { ascending: false })
          .limit(20);

        if (error) return;

        if (onlineData) {
          const formattedUsers = onlineData
            .filter(user => user.in_game_alias)
            .map((user: SupabaseProfileRow) => ({
              id: user.id,
              in_game_alias: user.in_game_alias,
              last_seen: user.last_seen,
              squad_name: undefined,
              squad_tag: undefined,
              role: undefined,
              avatar_url: user.avatar_url,
            }));

          setOnlineUsers(formattedUsers);
        }
      } catch (error) {
        console.error('Error fetching online users:', error);
      }
    };

    const fetchRecentGames = async () => {
      try {
        const response = await fetch('/api/player-stats/recent-games');
        if (response.ok) {
          const data = await response.json();
          setRecentGames(data.games || []);
        }
      } catch (error) {
        console.error('Error fetching recent games:', error);
      }
    };

    const fetchRecordedGames = async () => {
      try {
        const response = await fetch('/api/player-stats/recent-games?with_recordings=true&limit=10');

        if (response.ok) {
          const data = await response.json();

          if (!data || typeof data !== 'object') {
            setRecordedGames([]);
            setShowRecordedGamesTheater(false);
            return;
          }

          const games = Array.isArray(data.games) ? data.games : [];

          const gamesWithRecordings = games.filter((game: RecordedGame) => {
            try {
              return game &&
                     typeof game === 'object' &&
                     game.videoInfo &&
                     typeof game.videoInfo === 'object' &&
                     game.videoInfo.has_video === true &&
                     (game.videoInfo.youtube_url || game.videoInfo.vod_url);
            } catch {
              return false;
            }
          }) || [];

          const validatedGames = gamesWithRecordings.map((game: RecordedGame) => {
            try {
              return {
                ...game,
                players: Array.isArray(game.players) ? game.players : [],
                videoInfo: game.videoInfo || { has_video: false },
                winningInfo: game.winningInfo || null
              };
            } catch {
              return null;
            }
          }).filter(Boolean);

          setRecordedGames(validatedGames);
          setShowRecordedGamesTheater(validatedGames.length > 0);

          if (validatedGames.length === 0) {
            fetch('/api/player-stats/recent-games?limit=3')
              .then(res => res.json())
              .then(data => {
                if (data.games && data.games.length > 0) {
                  setRecordedGames(data.games.slice(0, 1));
                  setShowRecordedGamesTheater(true);
                }
              })
              .catch(() => {});
          }
        } else {
          setRecordedGames([]);
          setShowRecordedGamesTheater(false);
        }
      } catch (error) {
        console.error('Error fetching recorded games:', error);
        setRecordedGames([]);
        setShowRecordedGamesTheater(false);
      }
    };

    const fetchTopSquads = async () => {
      try {
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
          const squadIds = data.map(squad => squad.id);
          const { data: memberCounts } = await supabase
            .from('squad_members')
            .select('squad_id')
            .in('squad_id', squadIds)
            .eq('status', 'active');

          const squads: Squad[] = (data as unknown as SupabaseSquadRow[]).map((squad) => ({
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
          const matches: Match[] = (data as unknown as SupabaseMatchRow[]).map((match) => ({
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

    // ── New widget fetchers ─────────────────────────────────────────

    const fetchEloLeaders = async () => {
      try {
        const response = await fetch('/api/player-stats/elo-leaderboard?limit=10&minGames=3&sortBy=weighted_elo');
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            setEloLeaders(data.data.slice(0, 10));
          }
        }
      } catch (error) {
        console.error('Error fetching ELO leaders:', error);
      }
    };

    const fetchActiveSeasonStandings = async () => {
      try {
        // Check for active CTFPL season first
        const { data: ctfplSeason, error: ctfplError } = await supabase
          .from('ctfpl_seasons')
          .select('*')
          .eq('status', 'active')
          .maybeSingle();

        if (!ctfplError && ctfplSeason) {
          setActiveSeason({
            id: ctfplSeason.id,
            season_number: ctfplSeason.season_number,
            season_name: ctfplSeason.season_name,
            status: ctfplSeason.status,
            league_name: 'CTFPL'
          });

          const { data: standings, error: standingsError } = await supabase
            .from('ctfpl_standings_with_rankings')
            .select('squad_name, squad_tag, squad_id, rank, wins, losses, points, win_percentage')
            .eq('season_number', ctfplSeason.season_number)
            .order('rank', { ascending: true })
            .limit(8);

          if (!standingsError && standings) {
            setSeasonStandings(standings);
          }
          return;
        }

        // Fallback: check for any active league season
        const { data: leagueSeason, error: leagueError } = await supabase
          .from('league_seasons')
          .select('*, leagues(name, slug)')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (!leagueError && leagueSeason) {
          setActiveSeason({
            id: leagueSeason.id,
            season_number: leagueSeason.season_number,
            season_name: leagueSeason.season_name,
            status: leagueSeason.status,
            league_name: (leagueSeason.leagues as any)?.name || 'League'
          });

          const { data: standings, error: standingsError } = await supabase
            .from('league_standings_with_rankings')
            .select('squad_name, squad_tag, squad_id, rank, wins, losses, points, win_percentage')
            .eq('league_season_id', leagueSeason.id)
            .order('rank', { ascending: true })
            .limit(8);

          if (!standingsError && standings) {
            setSeasonStandings(standings);
          }
        }
      } catch (error) {
        console.error('Error fetching season standings:', error);
      }
    };

    // ── Execute all fetches ─────────────────────────────────────────

    fetchServerData();
    fetchGameData();
    fetchFeaturedVideos();
    fetchOnlineUsers();
    fetchRecentGames();
    fetchRecordedGames();
    fetchTopSquads();
    fetchUpcomingMatches();
    fetchUserSquad();
    fetchEloLeaders();
    fetchActiveSeasonStandings();

    // Set up polling intervals
    const serverInterval = setInterval(fetchServerData, 300000);
    const gameInterval = setInterval(fetchGameData, 5000);
    const videosInterval = setInterval(fetchFeaturedVideos, 300000);
    const usersInterval = setInterval(fetchOnlineUsers, 10000);
    const recentGamesInterval = setInterval(fetchRecentGames, 30000);
    const squadsInterval = setInterval(fetchTopSquads, 60000);
    const matchesInterval = setInterval(fetchUpcomingMatches, 30000);
    const activityInterval = setInterval(updateUserActivity, 600000);

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
    if (currentSlide >= bannerSlides.length) {
      setCurrentSlide(0);
    }
  }, [user, bannerSlides.length, currentSlide]);

  // ── Helper functions ────────────────────────────────────────────────

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

  const getWeaponEmoji = (weapon: string) => {
    switch (weapon?.toLowerCase()) {
      case 'caw': return ' 🪚';
      case 'sg': return ' 💥';
      default: return '';
    }
  };

  const getYouTubeVideoId = (url: string) => {
    if (!url) return null;

    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
      /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
      /(?:youtube\.com\/v\/)([^&\n?#]+)/,
      /(?:youtu\.be\/)([^&\n?#]+)/,
      /(?:youtube\.com\/\S*[?&]v=)([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  const getYouTubeThumbnail = (url: string, quality = 'hqdefault') => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
  };

  const getBestYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  };

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

  const openVideoEmbed = (video: FeaturedVideo) => {
    if (video.youtube_url) {
      const videoId = getYouTubeVideoId(video.youtube_url);
      if (videoId) {
        setEmbedModal({ isOpen: true, videoId, title: video.title });
        recordVideoView(video.id);
      }
    }
  };

  const closeEmbedModal = () => {
    setEmbedModal({ isOpen: false, videoId: null, title: '' });
  };

  // ── Recorded games theater helpers ──────────────────────────────────

  const getDefenseClassOrder = (className: string): number => {
    const order: Record<string, number> = {
      'Engineer': 1, 'Medic': 2, 'Rifleman': 3, 'Grenadier': 4,
      'Rocket': 5, 'Mortar': 6, 'Sniper': 7, 'Pilot': 8
    };
    return order[className] || 99;
  };

  const getOffenseClassOrder = (className: string): number => {
    const order: Record<string, number> = {
      'Pilot': 1, 'Rifleman': 2, 'Grenadier': 3, 'Rocket': 4,
      'Mortar': 5, 'Sniper': 6, 'Engineer': 7, 'Medic': 8
    };
    return order[className] || 99;
  };

  const getTeamColor = (teamName: string): string => {
    if (teamName.includes('TI') || teamName.includes('Titan')) return '#3B82F6';
    if (teamName.includes('CO') || teamName.includes('Collective')) return '#EF4444';
    return '#6B7280';
  };

  const getPlayerWinStatus = (player: RecordedGamePlayer, game: RecordedGame): 'win' | 'loss' | 'unknown' => {
    if (!game.winningInfo) return 'unknown';

    const playerTeam = player.team;
    const winnerTeam = game.winningInfo.winner;

    if (playerTeam === winnerTeam) return 'win';
    if (playerTeam && winnerTeam && playerTeam !== winnerTeam) return 'loss';
    return 'unknown';
  };

  const getGroupedGamePlayers = (game: RecordedGame) => {
    if (!game?.players) return {};

    const teamGroups = game.players.reduce((acc, player) => {
      const team = player.team || 'Unknown';
      if (!acc[team]) {
        acc[team] = { defense: [], offense: [] };
      }

      const side = player.side || 'N/A';
      if (side === 'defense') {
        acc[team].defense.push(player);
      } else if (side === 'offense') {
        acc[team].offense.push(player);
      }

      return acc;
    }, {} as Record<string, { defense: RecordedGamePlayer[], offense: RecordedGamePlayer[] }>);

    Object.keys(teamGroups).forEach(team => {
      teamGroups[team].defense.sort((a, b) => {
        const orderA = getDefenseClassOrder(a.main_class || '');
        const orderB = getDefenseClassOrder(b.main_class || '');
        if (orderA !== orderB) return orderA - orderB;
        return b.kills - a.kills;
      });

      teamGroups[team].offense.sort((a, b) => {
        const orderA = getOffenseClassOrder(a.main_class || '');
        const orderB = getOffenseClassOrder(b.main_class || '');
        if (orderA !== orderB) return orderA - orderB;
        return b.kills - a.kills;
      });
    });

    return teamGroups;
  };

  const formatGameDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatGameDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  // ── Loading state ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  // ── Current slide helpers ───────────────────────────────────────────
  const slide = bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)];
  const slideColor = slide ? getSlideColor(slide.color) : getSlideColor('cyan');

  // ── Live game helpers ───────────────────────────────────────────────
  const activePlayers = gameData.players.filter(p => p.class !== 'Spectator' && p.class !== 'Not Playing');
  const hasLiveGame = gameData.arenaName && activePlayers.length > 0;

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
          <div className={`absolute inset-0 transition-all duration-1000 ${slideColor.overlay}`}></div>

          {/* Slide Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            {slide && (
              <div
                className="text-center px-4 transition-all duration-1000 transform"
                style={{
                  transform: `translateY(${scrollY * 0.2}px) scale(${Math.max(0.8, 1 - scrollY / 1000)})`,
                  filter: `brightness(${Math.max(0.7, 1 + scrollY / 500)})`
                }}
              >
                <h1 className={`text-4xl lg:text-6xl font-bold mb-4 tracking-wider drop-shadow-2xl transition-all duration-1000 ${slideColor.text}`}>
                  {slide.title}
                </h1>
                <p className="text-lg lg:text-2xl text-gray-200 mb-2 drop-shadow-lg transition-all duration-1000">
                  {slide.subtitle}
                </p>
                <div className="text-gray-300 font-mono text-sm lg:text-base drop-shadow-lg mb-4 transition-all duration-1000">
                  {slide.description}
                </div>

                <button
                  className={`px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 text-white ${slideColor.button}`}
                  onClick={() => { window.location.href = slide.href; }}
                >
                  {slide.highlight}
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
                    ? `${slideColor.dot} scale-125`
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* CLEAN 3-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* LEFT SIDEBAR (3 columns) */}
          <div className="xl:col-span-3">
            <div className="space-y-3">

              {/* Online Users */}
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

              {/* Live Game */}
              {hasLiveGame && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                    <h3 className="text-yellow-400 font-bold text-sm tracking-wider flex items-center justify-between">
                      ⚔️ LIVE GAME
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    </h3>
                  </div>
                  <div className="p-3 bg-gray-900">
                    <div className="text-center mb-2">
                      <div className="text-yellow-400 font-bold text-sm">{gameData.arenaName}</div>
                      {gameData.gameType && (
                        <div className="text-gray-400 text-xs">{gameData.gameType}</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {(() => {
                        const teams = activePlayers.reduce((acc, p) => {
                          const team = p.team || 'Unknown';
                          if (!acc[team]) acc[team] = [];
                          acc[team].push(p);
                          return acc;
                        }, {} as Record<string, GamePlayer[]>);

                        return Object.entries(teams).map(([team, players]) => (
                          <div key={team} className="bg-gray-800/50 rounded p-2">
                            <div className="text-xs font-bold mb-1" style={{ color: getTeamColor(team) }}>
                              {team} ({players.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {players.slice(0, 8).map((p, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-mono"
                                  style={{ color: getClassColor(p.class) }}
                                  title={`${p.class}${getWeaponEmoji(p.weapon || '')}`}
                                >
                                  {p.alias}{i < Math.min(7, players.length - 1) ? ',' : ''}
                                </span>
                              ))}
                              {players.length > 8 && (
                                <span className="text-xs text-gray-500">+{players.length - 8}</span>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="text-center mt-2">
                      <span className="text-gray-500 text-xs">{activePlayers.length} players</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Server Status */}
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
                              {(game.playerDetails || game.players || []).slice(0, 4).map((player: RecentGamePlayer, pIndex: number) => (
                                <span key={pIndex} className="text-xs text-gray-300">
                                  {player.name || player.player_name || player.alias}{pIndex < Math.min(3, (game.playerDetails || game.players || []).length - 1) ? ',' : ''}
                                </span>
                              ))}
                              {(game.playerDetails || game.players || []).length > 4 && (
                                <span className="text-xs text-gray-500">+{(game.playerDetails || game.players || []).length - 4} more</span>
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

              {/* Scheduled Matches */}
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

          {/* CENTER CONTENT (6 columns) */}
          <div className="xl:col-span-6">
            <div className="space-y-3">

              {/* News Section */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-2 border-b border-blue-500/30">
                  <h3 className="text-lg font-bold text-blue-400 tracking-wider">News & Updates</h3>
                </div>
                <div className="p-4">
                  <NewsSection limit={1} showReadState={true} heroLayout={false} allowCollapse={true} />
                </div>
              </section>

              {/* Recent Recorded Games Theater */}
              {showRecordedGamesTheater && recordedGames.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-xl overflow-hidden mb-6">
                  <div className="bg-gray-700/50 px-4 py-2 border-b border-cyan-500/30">
                    <h3 className="text-lg font-bold text-cyan-400 tracking-wider">🎬 Most Recent Recorded Games</h3>
                    <p className="text-gray-300 text-sm">Latest competitive gameplay recordings</p>
                  </div>
                  <div className="p-4">
                    {/* Featured Main Game */}
                    {recordedGames[0] && recordedGames[0].videoInfo && (
                      <div className="mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Main Video - 2/3 width */}
                          <div className="md:col-span-2">
                            <div className="bg-white/10 backdrop-blur-lg rounded-lg overflow-hidden border border-white/20">
                              <div className="p-3 bg-white/20 border-b border-white/20 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-cyan-400 font-bold">🎮 {recordedGames[0]?.mapName || 'Unknown Map'}</span>
                                  <span className="text-gray-300">• {recordedGames[0]?.gameMode || 'Unknown Mode'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {recordedGames[0]?.videoInfo?.youtube_url && (
                                    <a
                                      href={recordedGames[0].videoInfo.youtube_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs transition-colors"
                                    >
                                      📺 YouTube
                                    </a>
                                  )}
                                  {recordedGames[0]?.gameId && (
                                    <Link
                                      href={`/stats/game/${encodeURIComponent(recordedGames[0].gameId)}`}
                                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors"
                                    >
                                      📊 Stats
                                    </Link>
                                  )}
                                </div>
                              </div>
                              <div className="p-3">
                                {recordedGames[0]?.videoInfo?.youtube_url && !showVideoEmbed ? (
                                  <div
                                    className="relative cursor-pointer group"
                                    onClick={() => setShowVideoEmbed(true)}
                                  >
                                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                                      <img
                                        src={getYouTubeThumbnail(recordedGames[0].videoInfo.youtube_url, 'hqdefault') || VIDEO_THUMBNAIL_PLACEHOLDER}
                                        alt={recordedGames[0]?.videoInfo?.video_title || 'Match Recording'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        onError={(e) => {
                                          try {
                                            const target = e.target as HTMLImageElement;
                                            target.src = VIDEO_THUMBNAIL_PLACEHOLDER;
                                          } catch {}
                                        }}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-all duration-300">
                                        <div className="bg-red-600 rounded-full p-4 group-hover:bg-red-500 group-hover:scale-110 transition-all duration-300">
                                          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-2 text-center">
                                      <p className="text-gray-300 text-sm">🎮 Click to watch full recording</p>
                                      <p className="text-gray-400 text-xs">
                                        Duration: {recordedGames[0]?.duration ? formatGameDuration(recordedGames[0].duration) : 'Unknown'} • {recordedGames[0]?.totalPlayers || 0} players
                                      </p>
                                    </div>
                                  </div>
                                ) : recordedGames[0]?.videoInfo?.youtube_url && showVideoEmbed ? (
                                  <div className="space-y-3">
                                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                                      <iframe
                                        src={`https://www.youtube.com/embed/${getYouTubeVideoId(recordedGames[0].videoInfo.youtube_url)}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&hd=1`}
                                        title={recordedGames[0]?.videoInfo?.video_title || 'Match Recording'}
                                        className="w-full h-full border-0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                        loading="eager"
                                      />
                                    </div>
                                    <div className="text-center">
                                      <button
                                        onClick={() => setShowVideoEmbed(false)}
                                        className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                                      >
                                        🔙 Back to Thumbnail
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center py-4">
                                    <p className="text-gray-400 text-sm">Video content not available</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Team Stats Sidebar - 1/3 width */}
                          <div className="md:col-span-1">
                            <div className="space-y-2">
                              {(() => {
                                try {
                                  if (!recordedGames[0] || !recordedGames[0].players) {
                                    return (
                                      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
                                        <p className="text-gray-400 text-center text-sm">Player data not available</p>
                                      </div>
                                    );
                                  }

                                  const groupedPlayers = getGroupedGamePlayers(recordedGames[0]);
                                  if (!groupedPlayers || Object.keys(groupedPlayers).length === 0) {
                                    return (
                                      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
                                        <p className="text-gray-400 text-center text-sm">No team data available</p>
                                      </div>
                                    );
                                  }

                                  return Object.entries(groupedPlayers).map(([team, { defense, offense }]) => {
                                    try {
                                      const winStatus = defense?.length > 0 ? getPlayerWinStatus(defense[0], recordedGames[0]) :
                                                       offense?.length > 0 ? getPlayerWinStatus(offense[0], recordedGames[0]) : 'unknown';

                                      return (
                                        <div key={team} className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-300 font-medium text-sm">{team}</span>
                                            {winStatus !== 'unknown' && (
                                              <div className={`px-3 py-1.5 rounded-md text-xs font-bold border-2 ${
                                                winStatus === 'win'
                                                  ? 'bg-green-600/80 text-green-50 border-green-400 shadow-green-500/25 shadow-md'
                                                  : 'bg-red-600/80 text-red-50 border-red-400 shadow-red-500/25 shadow-md'
                                              }`}>
                                                {winStatus === 'win' ? '🏆 WIN' : '💀 LOSS'}
                                              </div>
                                            )}
                                          </div>

                                          {defense && defense.length > 0 && (
                                            <div className="mb-2">
                                              <div className="text-blue-200 text-xs font-medium mb-1">🛡️ Defense</div>
                                              <div className="space-y-1">
                                                {defense.map((player, idx) => {
                                                  if (!player) return null;
                                                  return (
                                                    <div key={idx} className="bg-blue-500/10 rounded p-1.5">
                                                      <div className="flex items-center justify-between">
                                                        <span
                                                          className="font-medium text-xs truncate"
                                                          style={{ color: getClassColor(player.main_class || '') }}
                                                          title={`${player.player_name || 'Unknown'} (${player.main_class || 'Unknown'})`}
                                                        >
                                                          {player.player_name || 'Unknown Player'}
                                                        </span>
                                                        <span className="text-gray-300 text-xs ml-1">
                                                          {player.kills || 0}K/{player.deaths || 0}D
                                                        </span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}

                                          {offense && offense.length > 0 && (
                                            <div>
                                              <div className="text-red-200 text-xs font-medium mb-1">⚔️ Offense</div>
                                              <div className="space-y-1">
                                                {offense.map((player, idx) => {
                                                  if (!player) return null;
                                                  return (
                                                    <div key={idx} className="bg-red-500/10 rounded p-1.5">
                                                      <div className="flex items-center justify-between">
                                                        <span
                                                          className="font-medium text-xs truncate"
                                                          style={{ color: getClassColor(player.main_class || '') }}
                                                          title={`${player.player_name || 'Unknown'} (${player.main_class || 'Unknown'})`}
                                                        >
                                                          {player.player_name || 'Unknown Player'}
                                                        </span>
                                                        <span className="text-gray-300 text-xs ml-1">
                                                          {player.kills || 0}K/{player.deaths || 0}D
                                                        </span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    } catch (teamError) {
                                      return (
                                        <div key={team} className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
                                          <p className="text-gray-400 text-center text-sm">Error loading team data</p>
                                        </div>
                                      );
                                    }
                                  });
                                } catch {
                                  return (
                                    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
                                      <p className="text-gray-400 text-center text-sm">Unable to load player stats</p>
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Additional Recent Games */}
                    {recordedGames.length > 1 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-3">📹 More Recent Recordings</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {recordedGames.slice(1, 9).map((game) => (
                            <Link key={game.gameId} href={`/stats/game/${encodeURIComponent(game.gameId)}`}>
                              <div className="group cursor-pointer bg-gray-700/30 border border-gray-600 rounded-lg overflow-hidden hover:border-cyan-500/50 transition-all duration-300">
                                <div className="relative aspect-video overflow-hidden">
                                  {game.videoInfo.youtube_url ? (
                                    <img
                                      src={getYouTubeThumbnail(game.videoInfo.youtube_url, 'hqdefault') || VIDEO_THUMBNAIL_PLACEHOLDER}
                                      alt={`${game.mapName} - ${game.gameMode}`}
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                      onError={(e) => {
                                        e.currentTarget.src = VIDEO_THUMBNAIL_PLACEHOLDER;
                                      }}
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                      <div className="text-gray-400 text-center">
                                        <div className="text-lg mb-1">🎮</div>
                                        <div className="text-xs">Recording</div>
                                      </div>
                                    </div>
                                  )}

                                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                                    <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg">
                                      <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z"/>
                                      </svg>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-2">
                                  <h5 className="font-medium text-xs text-white group-hover:text-cyan-300 transition-colors truncate">
                                    {game.mapName} • {game.gameMode}
                                  </h5>
                                  <div className="text-xs text-gray-400 mt-1">
                                    {formatGameDate(game.gameDate)} • {formatGameDuration(game.duration)}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Featured Videos */}
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
                                    e.currentTarget.src = VIDEO_THUMBNAIL_PLACEHOLDER;
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
                        Check back soon for the latest Free Infantry content!
                      </div>
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>

          {/* RIGHT SIDEBAR (3 columns) */}
          <div className="xl:col-span-3">
            <div className="space-y-3">

              {/* ELO Leaderboard Widget */}
              {eloLeaders.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-3 py-2 border-b border-cyan-500/30">
                    <h3 className="text-cyan-400 font-bold text-sm tracking-wider flex items-center justify-between">
                      🏅 TOP PLAYERS
                      <Link href="/stats/elo" className="text-xs text-gray-400 hover:text-cyan-300 transition-colors">
                        View All →
                      </Link>
                    </h3>
                  </div>
                  <div className="p-2 bg-gray-900">
                    <div className="space-y-1">
                      {eloLeaders.map((player, index) => {
                        const tier = getEloTier(parseInt(player.weighted_elo || player.elo_rating || '0'));
                        return (
                          <Link key={player.player_name} href={`/stats/player/${encodeURIComponent(player.player_name)}`}>
                            <div className="flex items-center gap-2 p-1.5 bg-gray-800/30 rounded hover:bg-gray-700/30 transition-colors cursor-pointer">
                              <span className="text-xs font-bold w-5 text-center" style={{ color: tier.color }}>
                                {index + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="text-white text-xs font-medium truncate block">
                                  {player.player_name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono font-bold" style={{ color: tier.color }}>
                                  {parseInt(player.weighted_elo || player.elo_rating || '0')}
                                </span>
                                <span className="text-[10px] px-1 py-0.5 rounded font-bold" style={{ color: tier.color, backgroundColor: `${tier.color}20` }}>
                                  {tier.name}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* Season Standings Widget */}
              {activeSeason && seasonStandings.length > 0 && (
                <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-3 py-2 border-b border-purple-500/30">
                    <h3 className="text-purple-400 font-bold text-sm tracking-wider flex items-center justify-between">
                      🏆 {activeSeason.league_name} S{activeSeason.season_number}
                      <Link href="/league/standings" className="text-xs text-gray-400 hover:text-purple-300 transition-colors">
                        Full Standings →
                      </Link>
                    </h3>
                  </div>
                  <div className="p-2 bg-gray-900">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-1 px-1">#</th>
                          <th className="text-left py-1">Team</th>
                          <th className="text-center py-1">W</th>
                          <th className="text-center py-1">L</th>
                          <th className="text-right py-1 px-1">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seasonStandings.map((standing) => (
                          <tr key={standing.squad_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="py-1 px-1 text-gray-400 font-bold">{standing.rank}</td>
                            <td className="py-1">
                              <Link href={`/squads/${standing.squad_id}`} className="hover:text-purple-300 transition-colors">
                                <span className="text-purple-400 font-bold">[{standing.squad_tag}]</span>
                                <span className="text-gray-300 ml-1 truncate">{standing.squad_name}</span>
                              </Link>
                            </td>
                            <td className="text-center py-1 text-green-400">{standing.wins}</td>
                            <td className="text-center py-1 text-red-400">{standing.losses}</td>
                            <td className="text-right py-1 px-1 text-yellow-400 font-bold">{standing.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Recent Donations */}
              <section className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-xl overflow-hidden">
                <div className="bg-gray-700/50 px-3 py-1.5 border-b border-yellow-500/30">
                  <h3 className="text-sm font-bold text-yellow-400 tracking-wider">💝 Recent Donations</h3>
                </div>
                <div className="p-2">
                  {recentDonations.length > 0 ? (
                    <div className="space-y-1">
                      {recentDonations.slice(0, 6).map((donation, index) => (
                        <div key={donation.id || index} className="flex items-center gap-2 p-1.5 bg-gray-700/30 rounded border border-gray-600/50 hover:border-yellow-500/50 transition-colors">
                          <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[10px]">
                            💝
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-white text-xs truncate">
                                {donation.customerName || 'Anonymous'}
                              </div>
                              <div className="font-bold text-yellow-400 text-xs whitespace-nowrap">
                                ${donation.amount}
                              </div>
                            </div>
                            {donation.message && (
                              <div className="text-gray-400 text-[10px] truncate leading-tight">
                                &ldquo;{donation.message}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-2xl mb-1">💝</div>
                      <div className="text-gray-500 text-xs">No recent donations</div>
                    </div>
                  )}
                </div>
              </section>

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
