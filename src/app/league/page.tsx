'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Play, Radio } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import SeasonHero from '@/components/ctf/SeasonHero';
import CtfNewsFeed from '@/components/ctf/CtfNewsFeed';
import LeagueStatusSection, { type LeagueStatusData, type LeagueStatusEntry } from '@/components/ctf/LeagueStatusSection';
import { supabase } from '@/lib/supabase';
import { VIDEO_THUMBNAIL_PLACEHOLDER } from '@/lib/constants';
import { getPlayerDisplayStyle, isNonPlayingTeam } from '@/utils/classColors';
import {
  getLeagues,
  pickFeatured,
  getSeasonStatus,
  getStandings,
  getRecentChampions,
  seasonPhase,
  formatDateOnly,
  leagueStandingsHref,
  type StandingRow,
  type SeasonChampions,
  type SeasonPhase,
} from '@/lib/leagues';
import { displayFont, bodyFont } from '@/lib/fonts';
import './ctf-theme.css';

// ── Types ───────────────────────────────────────────────────────────────

interface ActiveZone { title: string; playerCount: number }
interface ServerData {
  zones: ActiveZone[];
  stats: { totalPlayers: number; activeGames: number; serverStatus: string };
  lastUpdated: string;
}

interface GamePlayer { alias: string; team: string; class: string; isOffense: boolean; weapon?: string }
interface GameData { arenaName: string | null; gameType: string | null; players: GamePlayer[]; lastUpdated: string | null }

interface FeaturedVideo {
  id: string;
  title: string;
  youtube_url?: string;
  vod_url?: string;
  thumbnail_url?: string;
  published_at: string;
}

interface RecordedGame {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  videoInfo: { has_video: boolean; youtube_url?: string; vod_url?: string; video_title?: string; thumbnail_url?: string };
}

interface OnlineUser { id: string; in_game_alias: string; last_seen: string; avatar_url?: string | null }

interface RecentGamePlayer { name?: string; player_name?: string; alias?: string }
interface RecentGame {
  gameId: string;
  gameMode: string;
  mapName: string;
  gameDate: string;
  playerDetails?: RecentGamePlayer[];
  players?: RecentGamePlayer[];
}

interface UpcomingMatch {
  id: string;
  title: string;
  scheduled_at: string;
  squad_a_name?: string;
  squad_b_name?: string;
  match_type: string;
}

interface LeagueResult {
  id: string;
  squad_a_name: string;
  squad_b_name: string;
  squad_a_score: number | null;
  squad_b_score: number | null;
  played_at: string | null;
  team_a_result?: string | null;
  team_b_result?: string | null;
  status?: string;
}

interface Team {
  id: string;
  name: string;
  tag: string | null;
  captain_alias: string;
  member_count: number;
}

interface StaffMember { id: string; in_game_alias: string; avatar_url?: string | null }

interface LeagueView {
  status: LeagueStatusData;
  phase: SeasonPhase;
  standings: StandingRow[];
  draft: { status: 'setup' | 'live' | 'paused' | 'complete' } | null;
  registered: number | null;
  teams: Team[];
  results: LeagueResult[];
  champions: SeasonChampions[];
}

// ── Small helpers ───────────────────────────────────────────────────────

const getYouTubeVideoId = (url: string) => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:youtube\.com\/v\/)([^&\n?#]+)/,
    /(?:youtu\.be\/)([^&\n?#]+)/,
    /(?:youtube\.com\/\S*[?&]v=)([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
};
const youTubeThumb = (url?: string) => {
  const id = url ? getYouTubeVideoId(url) : null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
};

const relTime = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
};

const teamColor = (team: string) => {
  if (/TI|Titan/i.test(team)) return '#3B82F6';
  if (/CO|Collective/i.test(team)) return '#EF4444';
  return '#8B98B0';
};

const isCtfZone = (title: string) => /\bctf\b/i.test(title);

/** Flat themed card. The `.ctf-theme` stylesheet styles `section` + its first child as the header bar. */
function Card({
  title,
  action,
  children,
  className = '',
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl overflow-hidden bg-[#131A2B] ${className}`}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-[#E6EDF7]">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

const MoreLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
    {children} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
  </Link>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="px-1 py-3 text-sm text-[#8B98B0]">{children}</div>
);

// ── Page ────────────────────────────────────────────────────────────────

export default function LeagueHome() {
  const { user, loading } = useAuth();

  const [serverData, setServerData] = useState<ServerData>({
    zones: [],
    stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
    lastUpdated: '',
  });
  const [gameData, setGameData] = useState<GameData>({ arenaName: null, gameType: null, players: [], lastUpdated: null });
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [recordedGames, setRecordedGames] = useState<RecordedGame[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<FeaturedVideo[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [leagueLoaded, setLeagueLoaded] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [viewerRegistered, setViewerRegistered] = useState(false);
  const [embed, setEmbed] = useState<{ videoId: string; title: string } | null>(null);

  // ── Presence: keep last_seen fresh so "Online" works (unchanged behaviour) ──
  useEffect(() => {
    if (!user) return;
    const touch = async () => {
      const last = localStorage.getItem('lastActivityUpdate');
      const now = Date.now();
      if (last && now - parseInt(last) < 60000) return;
      try {
        await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
        localStorage.setItem('lastActivityUpdate', String(now));
      } catch (e) {
        console.error('Error updating user activity:', e);
      }
    };
    touch();
    const t = setInterval(touch, 600000);
    return () => clearInterval(t);
  }, [user]);

  // ── Viewer registration (hero button state) ──
  useEffect(() => {
    if (!user) { setViewerRegistered(false); return; }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/league/register', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return;
        const json = await res.json();
        setViewerRegistered(!!json.registration && json.registration.is_active !== false);
      } catch { /* ignore */ }
    })();
  }, [user]);

  // ── League bundle: featured league, phase, standings, teams, results, champions ──
  const fetchLeague = useCallback(async () => {
    try {
      const leagues = await getLeagues();
      if (leagues.length === 0) { setLeagueLoaded(true); return; }

      const entries: LeagueStatusEntry[] = await Promise.all(
        leagues.map(async (l) => {
          const { season, status } = await getSeasonStatus(l);
          return { league: l, status, season };
        }),
      );
      const featuredLeague = pickFeatured(leagues);
      const featured = entries.find((e) => e.league.id === featuredLeague?.id) || entries[0];
      const L = featured.league;
      const S = featured.season;

      const [standings, draftRow, registered, teams, results, champions] = await Promise.all([
        S ? getStandings(L, S, 50) : Promise.resolve([] as StandingRow[]),
        L.format === 'draft' && S
          ? supabase.from('ctfdl_drafts').select('status').eq('league_season_id', S.id).maybeSingle().then((r) => r.data)
          : Promise.resolve(null),
        S
          ? supabase
              .from('free_agents')
              .select('id', { count: 'exact', head: true })
              .eq('is_active', true)
              .eq('league_slug', L.slug)
              .eq('season_number', S.season_number)
              .then((r) => (r.error ? null : r.count))
          : Promise.resolve(null),
        loadTeams(L.slug),
        S && featured.status !== 'off-season' ? loadResults(L.slug, S.season_number) : Promise.resolve([] as LeagueResult[]),
        getRecentChampions(L, 3).catch(() => [] as SeasonChampions[]),
      ]);

      const draft = draftRow ? { status: (draftRow as any).status } : null;
      const phase = seasonPhase(L, S, featured.status, { draftDone: draft?.status === 'complete' });

      setLeague({
        status: { entries, featured, standings: standings.slice(0, 3) },
        phase,
        standings,
        draft,
        registered: typeof registered === 'number' ? registered : null,
        teams,
        results,
        champions,
      });
    } catch (e) {
      console.error('Error loading league:', e);
    } finally {
      setLeagueLoaded(true);
    }
  }, []);

  useEffect(() => {
    const fetchServer = async () => {
      try {
        const r = await fetch('/api/server-status');
        if (r.ok) setServerData(await r.json());
      } catch (e) { console.error('server-status', e); }
    };
    const fetchGame = async () => {
      try {
        const r = await fetch('/api/game-data');
        if (r.ok) setGameData(await r.json());
      } catch (e) { console.error('game-data', e); }
    };
    const fetchVideos = async () => {
      try {
        const r = await fetch('/api/featured-videos?limit=6');
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j.videos)) {
          setFeaturedVideos(j.videos.map((v: FeaturedVideo) => ({ ...v, thumbnail_url: v.thumbnail_url || youTubeThumb(v.youtube_url) || undefined })));
        }
      } catch (e) { console.error('featured-videos', e); }
    };
    const fetchOnline = async () => {
      try {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from('profiles')
          .select('id, in_game_alias, last_seen, avatar_url')
          .gte('last_seen', since)
          .order('last_seen', { ascending: false })
          .limit(20);
        setOnlineUsers(((data || []) as OnlineUser[]).filter((u) => u.in_game_alias));
      } catch (e) { console.error('online users', e); }
    };
    const fetchRecent = async () => {
      try {
        const r = await fetch('/api/player-stats/recent-games');
        if (r.ok) setRecentGames((await r.json()).games || []);
      } catch (e) { console.error('recent-games', e); }
    };
    const fetchRecorded = async () => {
      try {
        const r = await fetch('/api/player-stats/recent-games?with_recordings=true&limit=10');
        if (!r.ok) { setRecordedGames([]); return; }
        const j = await r.json();
        const games: RecordedGame[] = Array.isArray(j?.games) ? j.games : [];
        setRecordedGames(games.filter((g) => g?.videoInfo?.has_video && (g.videoInfo.youtube_url || g.videoInfo.vod_url)).slice(0, 4));
      } catch (e) { console.error('recorded games', e); setRecordedGames([]); }
    };
    const fetchUpcoming = async () => {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('id, title, scheduled_at, status, match_type, squad_a:squads!matches_squad_a_id_fkey(name), squad_b:squads!matches_squad_b_id_fkey(name)')
          .gte('scheduled_at', new Date().toISOString())
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true })
          .limit(6);
        if (!error && data) {
          setUpcoming((data as any[]).map((m) => ({
            id: m.id,
            title: m.title,
            scheduled_at: m.scheduled_at,
            match_type: m.match_type,
            squad_a_name: m.squad_a?.name,
            squad_b_name: m.squad_b?.name,
          })));
        }
      } catch (e) { console.error('matches', e); }
    };
    const fetchStaff = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, in_game_alias, avatar_url')
          .eq('ctf_role', 'ctf_admin')
          .not('in_game_alias', 'is', null)
          .order('in_game_alias')
          .limit(6);
        setStaff((data || []) as StaffMember[]);
      } catch { /* ignore */ }
    };

    fetchServer(); fetchGame(); fetchVideos(); fetchOnline(); fetchRecent(); fetchRecorded(); fetchUpcoming(); fetchStaff();
    fetchLeague();

    const timers = [
      setInterval(fetchServer, 300000),
      setInterval(fetchGame, 5000),
      setInterval(fetchOnline, 10000),
      setInterval(fetchRecent, 30000),
      setInterval(fetchUpcoming, 30000),
      setInterval(fetchLeague, 120000),
    ];
    return () => timers.forEach(clearInterval);
  }, [fetchLeague]);

  useEffect(() => {
    if (!embed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEmbed(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embed]);

  const playVideo = (title: string, youtube?: string, vod?: string) => {
    const id = youtube ? getYouTubeVideoId(youtube) : null;
    if (id) setEmbed({ videoId: id, title });
    else if (vod) window.open(vod, '_blank', 'noopener');
  };

  // ── Derived ──
  const activePlayers = gameData.players.filter((p) => p.class !== 'Spectator' && p.class !== 'Not Playing');
  const hasLiveGame = !!gameData.arenaName && activePlayers.length > 0;
  const ctfZones = serverData.zones.filter((z) => isCtfZone(z.title));
  const otherZones = serverData.zones.filter((z) => !isCtfZone(z.title));
  const ctfPlayers = ctfZones.reduce((n, z) => n + z.playerCount, 0);

  const featured = league?.status.featured || null;
  const L = featured?.league || null;
  const S = featured?.season || null;
  const isDraftLeague = L?.format === 'draft';
  const hasWatch = featuredVideos.length > 0 || recordedGames.length > 0;
  const showThisWeek = upcoming.length > 0 || (league?.results.length || 0) > 0 || featured?.status === 'active';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#22D3EE]" />
      </div>
    );
  }

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* ── Season strip ───────────────────────────────────────────── */}
        {featured && L ? (
          <SeasonHero
            league={L}
            season={S}
            status={featured.status}
            phase={league!.phase}
            registered={league!.registered}
            teams={league!.teams.length}
            draft={league!.draft}
            viewerRegistered={viewerRegistered}
          />
        ) : (
          <section className="rounded-xl bg-[#131A2B] px-6 py-8">
            {leagueLoaded ? (
              <>
                <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
                <h1 className="font-display text-5xl text-[#E6EDF7]">No league configured</h1>
              </>
            ) : (
              <div className="animate-pulse space-y-3">
                <div className="h-3 w-40 rounded bg-white/5" />
                <div className="h-12 w-64 rounded bg-white/5" />
                <div className="h-3 w-80 rounded bg-white/5" />
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* ── LEFT: live ───────────────────────────────────────────── */}
          <div className="xl:col-span-3 space-y-4">
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#34D399]" aria-hidden="true" /> Live now
                </span>
              }
              action={serverData.lastUpdated ? <span className="text-[11px] text-[#8B98B0]">{relTime(serverData.lastUpdated)}</span> : undefined}
            >
              <div className="rounded-lg bg-[#1B2438] px-3 py-3 flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl leading-none text-[#E6EDF7] tabular-nums">{ctfPlayers}</div>
                  <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mt-1">
                    {ctfZones.length === 1 ? `in ${ctfZones[0].title}` : 'in CTF'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl leading-none text-[#8B98B0] tabular-nums">{serverData.stats.totalPlayers}</div>
                  <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mt-1">online in game</div>
                </div>
              </div>
              {(ctfZones.length > 1 || otherZones.length > 0) && (
                <ul className="mt-2 space-y-1">
                  {[...(ctfZones.length > 1 ? ctfZones : []), ...otherZones].map((z) => (
                    <li key={z.title} className="flex items-center justify-between text-xs px-1">
                      <span className={`truncate ${isCtfZone(z.title) ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{z.title}</span>
                      <span className="tabular-nums text-[#E6EDF7]">{z.playerCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {hasLiveGame && (
              <Card
                title="Live game"
                action={
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34D399]" />
                  </span>
                }
              >
                <div className="text-sm text-[#E6EDF7]">{gameData.arenaName}</div>
                {gameData.gameType && <div className="text-xs text-[#8B98B0]">{gameData.gameType}</div>}
                {/* Playing teams first; NP and spec sink to the bottom, greyed (Travis's live-list treatment). */}
                <div className="mt-2 space-y-1.5">
                  {Object.entries(
                    activePlayers.reduce((acc, p) => {
                      (acc[p.team || 'Unknown'] ||= []).push(p);
                      return acc;
                    }, {} as Record<string, GamePlayer[]>),
                  )
                    .sort(([a], [b]) => (isNonPlayingTeam(a) ? 1 : 0) - (isNonPlayingTeam(b) ? 1 : 0) || a.localeCompare(b))
                    .map(([team, players]) => {
                      const color = isNonPlayingTeam(team) ? '#6b7280' : teamColor(team);
                      return (
                        <div key={team}>
                          <div className="flex items-baseline justify-between px-1.5 py-[3px] bg-[#1B2438] border-l-2 rounded-sm" style={{ borderColor: color }}>
                            <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color }}>{team}</span>
                            <span className="text-[9px] font-mono text-[#8B98B0] ml-1.5 shrink-0">{players.length}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 px-1.5 pt-0.5">
                            {players.slice(0, 14).map((p, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-mono leading-[1.4] truncate"
                                style={getPlayerDisplayStyle(p.class, p.team)}
                                title={isNonPlayingTeam(p.team) ? `${p.alias} - not in the game (${p.team})` : p.class}
                              >
                                {p.alias}
                              </span>
                            ))}
                            {players.length > 14 && (
                              <span className="text-[10px] font-mono leading-[1.4] text-[#8B98B0]">+{players.length - 14}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </Card>
            )}

            <Card
              title="Online"
              action={<span className="text-[11px] tabular-nums text-[#8B98B0]">{onlineUsers.length}</span>}
            >
              {onlineUsers.length === 0 ? (
                <Empty>Nobody on the site right now.</Empty>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {onlineUsers.slice(0, 10).map((u) => (
                    <li key={u.id}>
                      <Link href={`/stats/player/${encodeURIComponent(u.in_game_alias)}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5 transition-colors">
                        <UserAvatar user={{ avatar_url: u.avatar_url ?? null, in_game_alias: u.in_game_alias, email: null }} size="sm" />
                        <span className="text-sm text-[#E6EDF7] truncate">{u.in_game_alias}</span>
                        <span className="ml-auto text-[11px] text-[#8B98B0]">{relTime(u.last_seen)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent pub games" action={<MoreLink href="/stats">All stats</MoreLink>}>
              {recentGames.length === 0 ? (
                <Empty>No games recorded recently.</Empty>
              ) : (
                <ul className="space-y-1">
                  {recentGames.slice(0, 4).map((g, i) => {
                    const players = g.playerDetails || g.players || [];
                    return (
                      <li key={`${g.gameId}-${i}`}>
                        <Link href={`/stats/game/${encodeURIComponent(g.gameId)}`} className="block rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#22D3EE] font-medium">{g.gameMode}</span>
                            <span className="text-[#8B98B0]">{relTime(g.gameDate)}</span>
                          </div>
                          <div className="text-[11px] text-[#8B98B0] truncate">
                            {g.mapName}
                            {players.length > 0 && ` · ${players.slice(0, 3).map((p) => p.name || p.player_name || p.alias).join(', ')}${players.length > 3 ? ` +${players.length - 3}` : ''}`}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* ── CENTER: the season ───────────────────────────────────── */}
          <div className="xl:col-span-6 space-y-4">
            {showThisWeek && (
              <Card title="This week" action={<MoreLink href="/matches">All matches</MoreLink>}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1.5 px-1">Upcoming</div>
                    {upcoming.length === 0 ? (
                      <Empty>Nothing scheduled yet.</Empty>
                    ) : (
                      <ul className="space-y-1">
                        {upcoming.slice(0, 5).map((m) => (
                          <li key={m.id}>
                            <Link href={`/matches/${m.id}`} className="block rounded-md bg-[#1B2438] px-3 py-2 hover:bg-[#222d45] transition-colors">
                              <div className="text-sm text-[#E6EDF7] truncate">
                                {m.squad_a_name && m.squad_b_name ? (
                                  <>
                                    {m.squad_a_name} <span className="text-[#8B98B0]">vs</span> {m.squad_b_name}
                                  </>
                                ) : m.title}
                              </div>
                              <div className="text-[11px] text-[#8B98B0]">{whenLabel(m.scheduled_at)}</div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1.5 px-1">Latest results</div>
                    {(league?.results.length || 0) === 0 ? (
                      <Empty>No league matches played yet.</Empty>
                    ) : (
                      <ul className="space-y-1">
                        {league!.results.slice(0, 5).map((r) => {
                          const aWin = (r.team_a_result || '').toLowerCase() === 'win' || (r.squad_a_score ?? 0) > (r.squad_b_score ?? 0);
                          const bWin = (r.team_b_result || '').toLowerCase() === 'win' || (r.squad_b_score ?? 0) > (r.squad_a_score ?? 0);
                          return (
                            <li key={r.id} className="rounded-md bg-[#1B2438] px-3 py-2">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className={`truncate ${aWin ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{r.squad_a_name}</span>
                                <span className="tabular-nums font-medium shrink-0">
                                  <span className={aWin ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{r.squad_a_score ?? '–'}</span>
                                  <span className="text-white/20 mx-1">:</span>
                                  <span className={bWin ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{r.squad_b_score ?? '–'}</span>
                                </span>
                                <span className={`truncate text-right ${bWin ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{r.squad_b_name}</span>
                              </div>
                              {r.played_at && <div className="text-[11px] text-[#8B98B0] mt-0.5">{relTime(r.played_at)}{r.status && r.status !== 'Season' ? ` · ${r.status}` : ''}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>
            )}

            <CtfNewsFeed limit={4} />

            {hasWatch && (
              <Card title="Watch" action={featuredVideos.length > 0 ? <MoreLink href="/videos">All videos</MoreLink> : undefined}>
                {featuredVideos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {featuredVideos.slice(0, 6).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => playVideo(v.title, v.youtube_url, v.vod_url)}
                        className="group text-left rounded-lg overflow-hidden bg-[#1B2438]"
                      >
                        <div className="relative aspect-video overflow-hidden">
                          <img
                            src={v.thumbnail_url || VIDEO_THUMBNAIL_PLACEHOLDER}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => { e.currentTarget.src = VIDEO_THUMBNAIL_PLACEHOLDER; }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors">
                            <span className="w-9 h-9 rounded-full bg-[#22D3EE] text-[#0B0F1A] flex items-center justify-center">
                              <Play className="w-4 h-4 ml-0.5" aria-hidden="true" />
                            </span>
                          </div>
                        </div>
                        <div className="px-2.5 py-2 text-xs text-[#E6EDF7] truncate group-hover:text-[#22D3EE] transition-colors">{v.title}</div>
                      </button>
                    ))}
                  </div>
                )}
                {recordedGames.length > 0 && (
                  <div className={featuredVideos.length > 0 ? 'mt-3' : ''}>
                    <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1.5 px-1">Recorded games</div>
                    <ul className="space-y-1">
                      {recordedGames.map((g) => (
                        <li key={g.gameId} className="flex items-center gap-2 rounded-md bg-[#1B2438] px-2.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => playVideo(g.videoInfo.video_title || `${g.mapName} · ${g.gameMode}`, g.videoInfo.youtube_url, g.videoInfo.vod_url)}
                            className="w-7 h-7 rounded-full bg-[#22D3EE]/15 text-[#22D3EE] hover:bg-[#22D3EE] hover:text-[#0B0F1A] flex items-center justify-center shrink-0 transition-colors"
                            aria-label="Play recording"
                          >
                            <Play className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
                          </button>
                          <Link href={`/stats/game/${encodeURIComponent(g.gameId)}`} className="min-w-0 flex-1 hover:text-[#22D3EE] transition-colors">
                            <div className="text-sm text-[#E6EDF7] truncate">{g.mapName} <span className="text-[#8B98B0]">· {g.gameMode}</span></div>
                          </Link>
                          <span className="text-[11px] text-[#8B98B0] shrink-0">{relTime(g.gameDate)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            <LeagueStatusSection data={league?.status || null} compact />
          </div>

          {/* ── RIGHT: the league ────────────────────────────────────── */}
          <div className="xl:col-span-3 space-y-4">
            {L && (
              <Card
                title={S ? `${L.name} S${S.season_number} standings` : 'Standings'}
                action={<MoreLink href={leagueStandingsHref(L)}>Full table</MoreLink>}
              >
                {league!.standings.length === 0 ? (
                  <Empty>
                    {featured?.status === 'upcoming'
                      ? isDraftLeague
                        ? 'Standings start once the draft is done and play begins.'
                        : 'Standings start when the season begins.'
                      : 'No standings yet.'}
                  </Empty>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#8B98B0]">
                        <th className="text-left font-normal py-1 px-1 w-6">#</th>
                        <th className="text-left font-normal py-1">Team</th>
                        <th className="text-center font-normal py-1 w-8">W</th>
                        <th className="text-center font-normal py-1 w-8">L</th>
                        <th className="text-right font-normal py-1 px-1 w-10">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {league!.standings.map((row) => (
                        <tr key={row.squad_id} className="border-t border-white/[0.06] hover:bg-white/5">
                          <td className="py-1.5 px-1 text-[#8B98B0] tabular-nums">{row.rank}</td>
                          <td className="py-1.5">
                            <Link href={`/squads/${row.squad_id}`} className="flex items-center gap-1.5 hover:text-[#22D3EE] transition-colors">
                              {row.squad_tag && <span className="text-[#22D3EE] font-medium">[{row.squad_tag}]</span>}
                              <span className="text-[#E6EDF7] truncate">{row.squad_name}</span>
                            </Link>
                          </td>
                          <td className="text-center py-1.5 text-[#34D399] tabular-nums">{row.wins}</td>
                          <td className="text-center py-1.5 text-[#F87171] tabular-nums">{row.losses}</td>
                          <td className="text-right py-1.5 px-1 text-[#F59E0B] font-medium tabular-nums">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}

            {L && (
              <Card
                title={isDraftLeague && league!.draft?.status !== 'complete' ? 'Captains' : 'Teams'}
                action={<MoreLink href="/squads">All squads</MoreLink>}
              >
                {league!.teams.length === 0 ? (
                  <Empty>{isDraftLeague ? 'No captains confirmed yet.' : 'No squads entered yet.'}</Empty>
                ) : (
                  <ul className="space-y-1">
                    {league!.teams.map((t) => (
                      <li key={t.id}>
                        <Link href={`/squads/${t.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors">
                          <span className="w-9 h-7 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">
                            {(t.tag || t.name).slice(0, 4).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-[#E6EDF7] truncate">{t.name}</span>
                            <span className="block text-[11px] text-[#8B98B0] truncate">
                              {isDraftLeague ? `Captain ${t.captain_alias}` : `${t.member_count} member${t.member_count === 1 ? '' : 's'} · ${t.captain_alias}`}
                            </span>
                          </span>
                          {!isDraftLeague || league!.draft?.status === 'complete' ? (
                            <span className="text-[11px] tabular-nums text-[#8B98B0]">{t.member_count}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {isDraftLeague && league!.draft?.status !== 'complete' && (
                  <p className="mt-2 px-1 text-[11px] text-[#8B98B0]">
                    Rosters are filled on draft day.{' '}
                    <Link href="/free-agents" className="text-[#22D3EE] hover:text-[#67E8F9]">See who’s in the pool</Link>
                  </p>
                )}
              </Card>
            )}

            {L && league!.champions.length > 0 && (
              <Card title="Past champions" action={<MoreLink href={leagueStandingsHref(L)}>History</MoreLink>}>
                <ul className="space-y-1">
                  {league!.champions.map((c) => (
                    <li key={c.season_id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                      <span className="w-9 shrink-0 text-[11px] text-[#8B98B0] tabular-nums">S{c.season_number}</span>
                      <span className="min-w-0 flex-1">
                        {c.champions.length > 0 ? (
                          c.champions.map((sq, i) => (
                            <React.Fragment key={sq.id}>
                              {i > 0 && <span className="text-[#8B98B0]"> & </span>}
                              <Link href={`/squads/${sq.id}`} className="text-sm text-[#E6EDF7] hover:text-[#F59E0B] transition-colors">
                                {sq.tag ? `[${sq.tag}] ` : ''}{sq.name}
                              </Link>
                            </React.Fragment>
                          ))
                        ) : (
                          <span className="text-sm text-[#8B98B0]">Not recorded</span>
                        )}
                        {c.end_date && <span className="block text-[11px] text-[#8B98B0]">{formatDateOnly(c.end_date)}</span>}
                      </span>
                      <span className="text-[#F59E0B]" aria-hidden="true">🏆</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Community">
              {L?.discord_url ? (
                <a
                  href={L.discord_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md bg-[#5865F2] hover:bg-[#6B76F5] text-white px-3 py-2.5 text-sm font-medium transition-colors"
                >
                  <span>Join the {L.name} Discord</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              ) : (
                <div className="rounded-md bg-[#1B2438] px-3 py-2.5 text-xs text-[#8B98B0]">
                  Announcements, scheduling and captains chat live on Discord. Ask staff for the invite.
                </div>
              )}
              {staff.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1.5 px-1">Staff</div>
                  <ul className="space-y-1">
                    {staff.map((s) => (
                      <li key={s.id}>
                        <Link href={`/stats/player/${encodeURIComponent(s.in_game_alias)}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5 transition-colors">
                          <UserAvatar user={{ avatar_url: s.avatar_url ?? null, in_game_alias: s.in_game_alias, email: null }} size="sm" />
                          <span className="text-sm text-[#E6EDF7] truncate">{s.in_game_alias}</span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-[#22D3EE]">Admin</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
                <Link href="/free-agents" className="text-[#8B98B0] hover:text-[#22D3EE]">Player pool</Link>
                <Link href="/squads/players" className="text-[#8B98B0] hover:text-[#22D3EE]">Players</Link>
                <Link href="/forum" className="text-[#8B98B0] hover:text-[#22D3EE]">Forum</Link>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {embed && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setEmbed(null); }}>
          <div className="w-full max-w-4xl rounded-xl overflow-hidden bg-[#131A2B]">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div className="text-sm text-[#E6EDF7] truncate">{embed.title}</div>
              <button type="button" onClick={() => setEmbed(null)} className="text-[#8B98B0] hover:text-[#E6EDF7] text-sm">Close</button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${embed.videoId}?autoplay=1`}
                title={embed.title}
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

// ── Loaders that live outside the component ─────────────────────────────

/** Active, non-legacy squads for a league. Untagged squads count as the featured league (same rule as the squad page). */
async function loadTeams(slug: string): Promise<Team[]> {
  const base = 'id, name, tag, captain_id, is_active, profiles!squads_captain_id_fkey(in_game_alias)';
  let rows: any[] | null = null;
  const withLeague = await supabase.from('squads').select(`${base}, league_slug, is_legacy`).eq('is_active', true);
  if (!withLeague.error) {
    rows = (withLeague.data || []).filter((s: any) => !s.is_legacy && (s.league_slug === slug || !s.league_slug));
  } else {
    const basic = await supabase.from('squads').select(base).eq('is_active', true);
    rows = basic.data || [];
  }
  if (!rows || rows.length === 0) return [];
  const ids = rows.map((s) => s.id);
  const { data: members } = await supabase.from('squad_members').select('squad_id').in('squad_id', ids).eq('status', 'active');
  const counts = new Map<string, number>();
  (members || []).forEach((m: any) => counts.set(m.squad_id, (counts.get(m.squad_id) || 0) + 1));
  return rows
    .map((s) => ({
      id: s.id,
      name: s.name,
      tag: s.tag ?? null,
      captain_alias: s.profiles?.in_game_alias || 'Unknown',
      member_count: counts.get(s.id) || 0,
    }))
    .sort((a, b) => b.member_count - a.member_count || a.name.localeCompare(b.name));
}

async function loadResults(slug: string, seasonNumber: number): Promise<LeagueResult[]> {
  try {
    const r = await fetch(`/api/ctf/matches?league=${encodeURIComponent(slug)}&season_number=${seasonNumber}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j.matches) ? j.matches : [])
      .filter((m: any) => m.played_at)
      .sort((a: any, b: any) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
      .slice(0, 6);
  } catch {
    return [];
  }
}
