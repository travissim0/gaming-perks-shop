'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { getClassColorStyle } from '@/utils/classColors';
import { getLeagues, pickFeatured, getOpenSeason, type LeagueInfo, type LeagueSeason } from '@/lib/leagues';
import type { EloTier } from '@/utils/eloTiers';

// ---------- Types ----------

interface PlayerStat {
  id: number;
  player_name: string;
  team: string;
  game_mode: string;
  arena_name: string;
  base_used: string;
  side: string;
  result: string;
  main_class: string;
  kills: number;
  deaths: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  class_swaps: number;
  turret_damage: number;
  eb_hits: number;
  accuracy: number;
  avg_resource_unused_per_death: number;
  avg_explosive_unused_per_death: number;
  game_length_minutes: number;
  game_date: string;
  game_id?: string;
}

interface PlayerAggregateStats {
  id: number;
  player_name: string;
  game_mode: string;
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_kills: number;
  total_deaths: number;
  total_captures: number;
  kill_death_ratio: number;
  win_rate: number;
  avg_kills_per_game: number;
  avg_deaths_per_game: number;
  avg_captures_per_game: number;
  total_eb_hits: number;
  total_turret_damage: number;
  first_game_date: string;
  last_game_date: string;
}

interface PlayerResponse {
  success: boolean;
  player: {
    name: string;
    aggregateStats: PlayerAggregateStats[];
    recentGames: PlayerStat[];
    gameModeBreakdown: PlayerAggregateStats[];
    calculatedStats: {
      avgKillsPerGame: number;
      avgDeathsPerGame: number;
      avgCapturesPerGame: number;
      killDeathRatio: number;
      winRate: number;
      avgAccuracy: number;
    } | null;
    filters: {
      gameMode: string;
      dateFilter: string;
      limit: number;
    };
  };
}

interface ProfileResponse {
  profile: {
    id: string;
    in_game_alias: string | null;
    avatar_url: string | null;
    created_at: string;
    is_league_banned: boolean;
    ctf_role: string | null;
  } | null;
  aliases: string[];
  squad: {
    id: string;
    name: string;
    tag: string;
    banner_url: string | null;
    role: string;
  } | null;
  freeAgent: {
    preferred_roles: string[];
    skill_level: string;
    availability: string | null;
  } | null;
  elo: {
    weighted_elo: number;
    elo_rating: number;
    elo_peak: number;
    elo_confidence: number;
    total_games: number;
    win_rate: number;
    kill_death_ratio: number;
    tier: EloTier;
  } | null;
  isRegistered: boolean;
}

const DATE_FILTERS = [
  { value: 'all', label: 'All time' },
  { value: 'day', label: '24 hours' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

// ---------- Component ----------

export default function PlayerPage() {
  const params = useParams();
  const playerName = decodeURIComponent(params.name as string);
  const { user } = useAuth();

  const [playerData, setPlayerData] = useState<PlayerResponse['player'] | null>(null);
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  // Season context for the badge: is this player registered / drafted for the running league season?
  const [seasonBadge, setSeasonBadge] = useState<{ league: LeagueInfo; season: LeagueSeason; registered: boolean; classes: string[]; draftedTag: string | null } | null>(null);

  // Fetch profile data once on mount (independent of filters)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setProfileLoading(true);
        const response = await fetch(
          `/api/player-stats/player/${encodeURIComponent(playerName)}/profile`
        );
        if (response.ok) {
          const data: ProfileResponse = await response.json();
          setProfileData(data);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, [playerName]);

  // Season badge (public data: registration + draft pick for the featured league's open season)
  useEffect(() => {
    const pid = profileData?.profile?.id;
    if (!pid) return;
    let cancelled = false;
    (async () => {
      try {
        const league = pickFeatured(await getLeagues());
        if (!league) return;
        const season = await getOpenSeason(league);
        if (!season || cancelled) return;
        const { data: reg } = await supabase
          .from('free_agents')
          .select('preferred_roles')
          .eq('player_id', pid)
          .eq('is_active', true)
          .eq('league_slug', league.slug)
          .eq('season_number', season.season_number)
          .maybeSingle();
        let draftedTag: string | null = null;
        if (league.slug === 'ctfdl') {
          const { data: draft } = await supabase.from('ctfdl_drafts').select('id').eq('league_season_id', season.id).maybeSingle();
          if (draft) {
            const { data: pick } = await supabase
              .from('ctfdl_draft_picks')
              .select('team_id, ctfdl_draft_teams(squads(tag))')
              .eq('draft_id', draft.id)
              .eq('player_id', pid)
              .maybeSingle();
            draftedTag = (pick as any)?.ctfdl_draft_teams?.squads?.tag ?? (pick ? 'drafted' : null);
          }
        }
        if (!cancelled) setSeasonBadge({ league, season, registered: !!reg, classes: reg?.preferred_roles || [], draftedTag });
      } catch (e) {
        console.error('season badge', e);
      }
    })();
    return () => { cancelled = true; };
  }, [profileData?.profile?.id]);

  // Fetch stats data (re-fetches on filter changes)
  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        gameMode,
        dateFilter,
        limit: '50'
      });

      const response = await fetch(
        `/api/player-stats/player/${encodeURIComponent(playerName)}?${queryParams}`
      );
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Player not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: PlayerResponse = await response.json();
      if (data.success) {
        setPlayerData(data.player);
      } else {
        throw new Error('Failed to fetch player data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, dateFilter]);

  // ---------- Formatters ----------

  const formatNumber = (num: number, decimals = 0) => Number(num).toFixed(decimals);
  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // ---------- Compute aggregate totals from all-time stats ----------

  const aggregateTotals = playerData?.aggregateStats?.reduce(
    (acc, s) => ({
      totalGames: acc.totalGames + s.total_games,
      totalKills: acc.totalKills + s.total_kills,
      totalCaptures: acc.totalCaptures + s.total_captures,
    }),
    { totalGames: 0, totalKills: 0, totalCaptures: 0 }
  );

  const isMe = !!user && !!profileData?.profile?.id && user.id === profileData.profile.id;
  const profile = profileData?.profile;
  const elo = profileData?.elo;
  const cs = playerData?.calculatedStats;
  const lastGame = playerData?.recentGames?.[0]?.game_date || playerData?.aggregateStats?.[0]?.last_game_date || null;

  const chipCls = (on: boolean) => `rounded-md px-2.5 py-1 text-xs font-medium ${on ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`;
  const th = (label: string, right = true) => (
    <th className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[#8B98B0] ${right ? 'text-right' : 'text-left'}`}>{label}</th>
  );
  const winCls = (rate: number) => (rate >= 0.6 ? 'text-[#34D399]' : rate >= 0.4 ? 'text-[#F59E0B]' : 'text-[#F87171]');

  // ---------- Render ----------

  if (error && !playerData) {
    return (
      <div className="ctf-theme min-h-screen">
        <Navbar user={user} />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl text-[#F87171]">{error}</h1>
          <p className="mt-2 text-sm text-[#8B98B0]">Check the spelling, or find them on the players list.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/squads/players" className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Players</Link>
            <Link href="/stats" className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Leaderboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-3 text-sm">
          <Link href="/stats" className="text-[#8B98B0] hover:text-[#E6EDF7]">← Leaderboard</Link>
        </div>

        {/* ---- Header strip ---------------------------------------------- */}
        <div className="mb-4 rounded-xl bg-[#131A2B] p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-[#1B2438]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-2xl text-[#22D3EE]">{playerName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl leading-none text-[#E6EDF7] md:text-3xl">{playerName}</h1>
                {elo && (
                  <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title={`Peak ${Math.round(elo.elo_peak)}`}>
                    {elo.tier?.name || 'Rated'} · {Math.round(elo.weighted_elo)}
                  </span>
                )}
                {seasonBadge?.draftedTag ? (
                  <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">Drafted{seasonBadge.draftedTag !== 'drafted' ? ` → [${seasonBadge.draftedTag}]` : ''} · {seasonBadge.league.name} S{seasonBadge.season.season_number}</span>
                ) : seasonBadge?.registered ? (
                  <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#34D399]">Registered · {seasonBadge.league.name} S{seasonBadge.season.season_number}</span>
                ) : null}
                {profileData?.squad && (
                  <Link href={`/squads/${profileData.squad.id}`} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#E6EDF7] hover:bg-white/10">
                    [{profileData.squad.tag}] {profileData.squad.name}{profileData.squad.role === 'captain' ? ' · captain' : ''}
                  </Link>
                )}
                {profile?.ctf_role && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B98B0]">{profile.ctf_role.replace('ctf_', 'CTF ')}</span>
                )}
                {profile?.is_league_banned && (
                  <span className="rounded bg-[#F87171]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F87171]">League ban</span>
                )}
                {!profileLoading && !profile && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B98B0]">No site account</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[#8B98B0]">
                {profile?.created_at && <span>Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
                {(seasonBadge?.classes.length || profileData?.freeAgent?.preferred_roles?.length) ? (
                  <span>Plays <span className="text-[#E6EDF7]">{(seasonBadge?.classes.length ? seasonBadge.classes : profileData!.freeAgent!.preferred_roles).join(', ')}</span></span>
                ) : null}
                {profileData?.aliases && profileData.aliases.filter((a) => a.toLowerCase() !== playerName.toLowerCase()).length > 0 && (
                  <span>Also known as <span className="text-[#E6EDF7]">{profileData.aliases.filter((a) => a.toLowerCase() !== playerName.toLowerCase()).join(', ')}</span></span>
                )}
                {lastGame && <span>Last game {formatDate(lastGame)}</span>}
              </div>
            </div>
            {isMe && (
              <Link href="/profile" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Edit profile</Link>
            )}
          </div>
        </div>

        {loading && !playerData && (
          <div className="py-12 text-center text-sm text-[#8B98B0]">Loading player statistics…</div>
        )}

        {playerData && (
          <>
            {/* ---- Headline tiles (respect the filters below) -------------- */}
            {cs && (
              <div className="mb-4 grid grid-cols-3 gap-2 md:grid-cols-6">
                {[
                  { label: 'Games', value: aggregateTotals?.totalGames ?? '—' },
                  { label: 'Win rate', value: formatPercentage(cs.winRate), cls: winCls(cs.winRate) },
                  { label: 'K/D', value: formatNumber(cs.killDeathRatio, 2) },
                  { label: 'Accuracy', value: formatPercentage(cs.avgAccuracy) },
                  { label: elo ? 'ELO' : 'Caps', value: elo ? Math.round(elo.weighted_elo) : aggregateTotals?.totalCaptures ?? '—' },
                  { label: 'Kills', value: (aggregateTotals?.totalKills ?? 0).toLocaleString() },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg bg-[#131A2B] px-3 py-3 text-center">
                    <div className={`font-display text-2xl ${t.cls || 'text-[#E6EDF7]'}`}>{t.value}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{t.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Filters --------------------------------------------------- */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-[#131A2B] px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">Mode</span>
              <button type="button" onClick={() => setGameMode('all')} className={chipCls(gameMode === 'all')}>All</button>
              {playerData.gameModeBreakdown.map((m) => (
                <button key={m.game_mode} type="button" onClick={() => setGameMode(m.game_mode)} className={chipCls(gameMode === m.game_mode)}>
                  {m.game_mode} <span className={gameMode === m.game_mode ? 'opacity-70' : 'text-[#8B98B0]'}>{m.total_games}</span>
                </button>
              ))}
              <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">Period</span>
              {DATE_FILTERS.map((f) => (
                <button key={f.value} type="button" onClick={() => setDateFilter(f.value)} className={chipCls(dateFilter === f.value)}>{f.label}</button>
              ))}
              {loading && <span className="text-xs text-[#8B98B0]">Updating…</span>}
            </div>

            {/* ---- Summary cards --------------------------------------------- */}
            {cs && (
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-[#131A2B] p-4">
                  <h3 className="mb-2 font-display text-lg text-[#E6EDF7]">Combat</h3>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Avg kills / game</dt><dd className="tabular-nums text-[#E6EDF7]">{formatNumber(cs.avgKillsPerGame, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Avg deaths / game</dt><dd className="tabular-nums text-[#E6EDF7]">{formatNumber(cs.avgDeathsPerGame, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">K/D</dt><dd className="tabular-nums text-[#E6EDF7]">{formatNumber(cs.killDeathRatio, 2)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Accuracy</dt><dd className="tabular-nums text-[#E6EDF7]">{formatPercentage(cs.avgAccuracy)}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl bg-[#131A2B] p-4">
                  <h3 className="mb-2 font-display text-lg text-[#E6EDF7]">Objective</h3>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Win rate</dt><dd className={`tabular-nums ${winCls(cs.winRate)}`}>{formatPercentage(cs.winRate)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Avg captures / game</dt><dd className="tabular-nums text-[#E6EDF7]">{formatNumber(cs.avgCapturesPerGame, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Total captures</dt><dd className="tabular-nums text-[#E6EDF7]">{aggregateTotals?.totalCaptures ?? '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8B98B0]">Games in view</dt><dd className="tabular-nums text-[#E6EDF7]">{playerData.recentGames.length}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl bg-[#131A2B] p-4">
                  <h3 className="mb-2 font-display text-lg text-[#E6EDF7]">Modes</h3>
                  <dl className="space-y-1.5 text-sm">
                    {playerData.gameModeBreakdown.slice(0, 4).map((m) => (
                      <div key={m.game_mode} className="flex justify-between">
                        <dt className="text-[#8B98B0]">{m.game_mode}</dt>
                        <dd className="tabular-nums text-[#E6EDF7]">{m.total_games} games <span className={winCls(m.win_rate)}>· {formatPercentage(m.win_rate)}</span></dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}

            {/* ---- All-time by game mode ------------------------------------- */}
            {playerData.aggregateStats && playerData.aggregateStats.length > 0 && (
              <div className="mb-4 overflow-hidden rounded-xl bg-[#131A2B]">
                <div className="flex items-baseline justify-between px-4 pt-4">
                  <h2 className="font-display text-lg text-[#E6EDF7]">All-time by mode</h2>
                  <span className="text-xs text-[#8B98B0]">Not affected by the filters</span>
                </div>
                <div className="overflow-x-auto p-2">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr>{th('Mode', false)}{th('Games')}{th('Win rate')}{th('Kills')}{th('Deaths')}{th('K/D')}{th('Caps')}{th('EB hits')}{th('Last active')}</tr></thead>
                    <tbody>
                      {playerData.aggregateStats.map((s) => (
                        <tr key={s.game_mode} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                          <td className="px-3 py-2 text-[#E6EDF7]">{s.game_mode}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_games}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${winCls(s.win_rate)}`}>{formatPercentage(s.win_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_kills.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{s.total_deaths.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{formatNumber(s.kill_death_ratio, 2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_captures}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{s.total_eb_hits}</td>
                          <td className="px-3 py-2 text-right text-xs text-[#8B98B0]">{formatDate(s.last_game_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- Class breakdown (from the games in view) ------------------- */}
            {playerData.recentGames && playerData.recentGames.length > 0 && (() => {
              const classStats = playerData.recentGames.reduce((acc: any, game) => {
                const className = game.main_class;
                if (!acc[className]) acc[className] = { games: 0, wins: 0, kills: 0, deaths: 0, captures: 0, totalAccuracy: 0 };
                acc[className].games += 1;
                if (game.result === 'Win') acc[className].wins += 1;
                acc[className].kills += game.kills;
                acc[className].deaths += game.deaths;
                acc[className].captures += game.captures;
                acc[className].totalAccuracy += game.accuracy;
                return acc;
              }, {});
              const sortedClasses = Object.entries(classStats)
                .map(([className, stats]: [string, any]) => ({
                  className,
                  ...stats,
                  winRate: stats.games > 0 ? stats.wins / stats.games : 0,
                  kd: stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills,
                  avgAccuracy: stats.games > 0 ? stats.totalAccuracy / stats.games : 0,
                  avgKills: stats.games > 0 ? stats.kills / stats.games : 0,
                  avgDeaths: stats.games > 0 ? stats.deaths / stats.games : 0,
                  avgCaptures: stats.games > 0 ? stats.captures / stats.games : 0,
                }))
                .sort((a, b) => b.games - a.games);
              return (
                <div className="mb-4 overflow-hidden rounded-xl bg-[#131A2B]">
                  <div className="flex items-baseline justify-between px-4 pt-4">
                    <h2 className="font-display text-lg text-[#E6EDF7]">By class</h2>
                    <span className="text-xs text-[#8B98B0]">From the {playerData.recentGames.length} games in view</span>
                  </div>
                  <div className="overflow-x-auto p-2">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr>{th('Class', false)}{th('Games')}{th('Win rate')}{th('K/D')}{th('Avg K')}{th('Avg D')}{th('Avg caps')}{th('Accuracy')}</tr></thead>
                      <tbody>
                        {sortedClasses.map((c, i) => (
                          <tr key={c.className} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                            <td className="px-3 py-2">
                              <span className="font-medium" style={getClassColorStyle(c.className)}>{c.className}</span>
                              {i === 0 && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8B98B0]">Main</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{c.games}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${winCls(c.winRate)}`}>{formatPercentage(c.winRate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{formatNumber(c.kd, 2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{formatNumber(c.avgKills, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{formatNumber(c.avgDeaths, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{formatNumber(c.avgCaptures, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{formatPercentage(c.avgAccuracy)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* ---- Recent games ----------------------------------------------- */}
            {playerData.recentGames && playerData.recentGames.length > 0 && (
              <div className="mb-4 overflow-hidden rounded-xl bg-[#131A2B]">
                <div className="flex items-baseline justify-between px-4 pt-4">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Recent games <span className="text-sm text-[#8B98B0]">· {playerData.recentGames.length}</span></h2>
                </div>
                <div className="overflow-x-auto p-2">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr>{th('Date', false)}{th('Mode', false)}{th('Arena', false)}{th('Result', false)}{th('Class', false)}{th('K')}{th('D')}{th('K/D')}{th('Caps')}{th('Acc')}<th className="px-3 py-2" /></tr></thead>
                    <tbody>
                      {playerData.recentGames.map((game) => (
                        <tr key={game.id} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                          <td className="px-3 py-2 text-xs text-[#8B98B0] whitespace-nowrap">{formatDate(game.game_date)}</td>
                          <td className="px-3 py-2 text-xs text-[#E6EDF7]">{game.game_mode}</td>
                          <td className="px-3 py-2 text-xs text-[#8B98B0]">{game.arena_name}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${game.result === 'Win' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F87171]/15 text-[#F87171]'}`}>{game.result}</span>
                          </td>
                          <td className="px-3 py-2 text-xs font-medium" style={getClassColorStyle(game.main_class)}>{game.main_class}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{game.kills}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{game.deaths}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{game.deaths > 0 ? formatNumber(game.kills / game.deaths, 2) : game.kills}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{game.captures}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{formatPercentage(game.accuracy)}</td>
                          <td className="px-3 py-2 text-right">
                            {game.game_id && (
                              <Link href={`/stats/game/${encodeURIComponent(game.game_id)}`} className="rounded-md bg-white/5 px-2 py-1 text-xs text-[#E6EDF7] hover:bg-white/10 whitespace-nowrap">View game</Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!playerData.recentGames?.length && !playerData.aggregateStats?.length) && (
              <div className="rounded-xl bg-[#131A2B] py-12 text-center">
                <p className="font-display text-2xl text-[#E6EDF7]">No game statistics found</p>
                <p className="mt-1 text-sm text-[#8B98B0]">This player hasn't played any recorded games yet, or the filters are hiding them.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
