'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { displayFont, bodyFont } from '@/lib/fonts';
import { getClassColorStyle } from '@/utils/classColors';
import { getLeagues, pickFeatured, getOpenSeason, type LeagueInfo, type LeagueSeason } from '@/lib/leagues';
import type { EloTier } from '@/utils/eloTiers';
import {
  T, SIDE, isSide, Card, Tag, SideBadge, ResultBadge, ModeBadge, ClassChip, ClassBars, WeaponTable, StatTile,
  fmtPct, fmtNum, fmtKD, fmtMMSS, fmtDelta, fmtDate, mergeClasses, mergeWeapons, type StatRow,
} from '@/components/ctf-stats/CtfStats';

/*
 * One player. Aggregates come from /api/player-stats/player/[name] (the per-mode view plus the games
 * in view); everything schema-2 - class time, per-weapon accuracy, side split, ELO movement, captain
 * games - is computed here from the games in view, since those rows carry the jsonb columns.
 */

// ---------- Types ----------

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
    recentGames: StatRow[];
    gameModeBreakdown: PlayerAggregateStats[];
    calculatedStats: {
      avgKillsPerGame: number;
      avgDeathsPerGame: number;
      avgCapturesPerGame: number;
      killDeathRatio: number;
      winRate: number;
      avgAccuracy: number;
    } | null;
    filters: { gameMode: string; dateFilter: string; limit: number };
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
  squad: { id: string; name: string; tag: string; banner_url: string | null; role: string } | null;
  freeAgent: { preferred_roles: string[]; skill_level: string; availability: string | null } | null;
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

/** Win rate as a fraction whichever way the view stores it (0.5 or 50). */
const pctValue = (v: number) => (Number(v) > 1 ? Number(v) / 100 : Number(v) || 0);
const winCls = (rate: number) => (rate >= 0.6 ? 'text-[#34D399]' : rate >= 0.4 ? 'text-[#F59E0B]' : 'text-[#F87171]');
const winColor = (rate: number) => (rate >= 0.6 ? T.win : rate >= 0.4 ? T.highlight : T.loss);

/** Rating after each game, oldest first, as a small line. Only games that carry an ELO value. */
function EloSparkline({ games }: { games: StatRow[] }) {
  const pts = games
    .filter((g) => g.elo_after !== null && g.elo_after !== undefined)
    .map((g) => ({ t: new Date(g.game_date).getTime(), v: Number(g.elo_after), id: g.game_id }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const W = 320, H = 56, P = 4;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const y = (v: number) => (max === min ? H / 2 : P + (H - 2 * P) * (1 - (v - min) / (max - min)));
  const x = (i: number) => P + ((W - 2 * P) * i) / (pts.length - 1);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1], first = pts[0];
  const up = last.v >= first.v;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" role="img" aria-label={`ELO from ${Math.round(first.v)} to ${Math.round(last.v)} over ${pts.length} games`}>
        <path d={d} fill="none" stroke={up ? T.win : T.loss} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(last.v)} r="2.5" fill={up ? T.win : T.loss} />
      </svg>
      <div className="flex justify-between text-[11px] text-[#8B98B0] tabular-nums"><span>{Math.round(first.v)} · {fmtDate(new Date(first.t).toISOString())}</span><span className="text-[#E6EDF7]">{Math.round(last.v)}</span></div>
    </div>
  );
}

// ---------- Component ----------

/** Tranq darts landed / fired out of a weapon map (one game, or the games in view merged). */
const tranqOf = (weapons: Record<string, { fired: number; landed: number }> | null | undefined) => {
  const entry = Object.entries(weapons ?? {}).find(([name]) => /tranq/i.test(name));
  return { fired: entry ? Number(entry[1]?.fired) || 0 : 0, landed: entry ? Number(entry[1]?.landed) || 0 : 0 };
};

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
        const response = await fetch(`/api/player-stats/player/${encodeURIComponent(playerName)}/profile`);
        if (response.ok) setProfileData(await response.json());
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const queryParams = new URLSearchParams({ gameMode, dateFilter, limit: '50' });
        const response = await fetch(`/api/player-stats/player/${encodeURIComponent(playerName)}?${queryParams}`);
        if (!response.ok) throw new Error(response.status === 404 ? 'Player not found' : `Could not load stats (${response.status})`);
        const data: PlayerResponse = await response.json();
        if (!data.success) throw new Error('Could not load stats');
        if (!cancelled) setPlayerData(data.player);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerName, gameMode, dateFilter]);

  // ---------- Derived, from the games in view ----------

  const games = playerData?.recentGames ?? [];
  const inView = useMemo(() => {
    const wins = games.filter((g) => g.result === 'Win').length;
    const classes = games.reduce((acc, g) => mergeClasses(acc, g.class_play_times), {} as Record<string, number>);
    const weapons = games.reduce((acc, g) => mergeWeapons(acc, g.weapon_stats), {} as Record<string, { fired: number; landed: number }>);
    const bySide = (['defense', 'offense'] as const).map((side) => {
      const rows = games.filter((g) => g.side === side);
      const w = rows.filter((g) => g.result === 'Win').length;
      const k = rows.reduce((s, g) => s + g.kills, 0), d = rows.reduce((s, g) => s + g.deaths, 0);
      return { side, games: rows.length, wins: w, winRate: rows.length ? w / rows.length : 0, kd: fmtKD(k, d), kpg: rows.length ? k / rows.length : 0 };
    });
    const captainGames = games.filter((g) => g.is_captain).length;
    const summoned = games.reduce((s, g) => s + (g.times_summoned ?? 0), 0);
    const summons = games.reduce((s, g) => s + (g.summons_performed ?? 0), 0);
    const playSeconds = games.reduce((s, g) => s + (g.play_seconds ?? 0), 0);
    const eloTotal = games.reduce((s, g) => s + (Number(g.elo_change) || 0), 0);
    const hasElo = games.some((g) => g.elo_change !== null && g.elo_change !== undefined);
    const schema2 = games.some((g) => (g.schema_version ?? 1) >= 2);
    const tranq = tranqOf(weapons);
    return { wins, classes, weapons, bySide, captainGames, summoned, summons, playSeconds, eloTotal, hasElo, schema2, tranq };
  }, [games]);

  // The per-mode view can hold one row per (mode, season). Fold those into one row per mode and
  // recompute the ratios, so the chips and the table never show "OvD" twice. "Combined" is the
  // view's own every-mode rollup; it is shown as "All", never as a mode of its own.
  const byMode = useMemo(() => {
    const rows = playerData?.gameModeBreakdown?.length ? playerData.gameModeBreakdown : playerData?.aggregateStats ?? [];
    const acc = new Map<string, PlayerAggregateStats>();
    for (const s of rows) {
      const cur = acc.get(s.game_mode);
      if (!cur) { acc.set(s.game_mode, { ...s, win_rate: pctValue(s.win_rate) }); continue; }
      cur.total_games += s.total_games; cur.total_wins += s.total_wins ?? 0; cur.total_losses += s.total_losses ?? 0;
      cur.total_kills += s.total_kills; cur.total_deaths += s.total_deaths; cur.total_captures += s.total_captures;
      cur.total_eb_hits += s.total_eb_hits ?? 0; cur.total_turret_damage += s.total_turret_damage ?? 0;
      if (new Date(s.last_game_date) > new Date(cur.last_game_date)) cur.last_game_date = s.last_game_date;
      if (new Date(s.first_game_date) < new Date(cur.first_game_date)) cur.first_game_date = s.first_game_date;
      cur.win_rate = cur.total_games ? cur.total_wins / cur.total_games : 0;
      cur.kill_death_ratio = cur.total_deaths ? cur.total_kills / cur.total_deaths : cur.total_kills;
    }
    const list = [...acc.values()].sort((a, b) => (a.game_mode === 'Combined' ? -1 : b.game_mode === 'Combined' ? 1 : b.total_games - a.total_games));
    return { all: list, modes: list.filter((m) => m.game_mode !== 'Combined') };
  }, [playerData]);

  const aggregateTotals = (() => {
    const src = byMode.all.find((m) => m.game_mode === 'Combined') ? [byMode.all.find((m) => m.game_mode === 'Combined')!] : byMode.modes;
    return src.reduce(
      (acc, s) => ({ totalGames: acc.totalGames + s.total_games, totalKills: acc.totalKills + s.total_kills, totalCaptures: acc.totalCaptures + s.total_captures }),
      { totalGames: 0, totalKills: 0, totalCaptures: 0 },
    );
  })();

  const isMe = !!user && !!profileData?.profile?.id && user.id === profileData.profile.id;
  const profile = profileData?.profile;
  const elo = profileData?.elo;
  const cs = playerData?.calculatedStats;
  const lastGame = games[0]?.game_date || playerData?.aggregateStats?.[0]?.last_game_date || null;

  const chipCls = (on: boolean) => `rounded-md px-2.5 py-1 text-xs font-medium ${on ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`;
  const th = (label: string, right = true, title?: string) => (
    <th title={title} className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[#8B98B0] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{label}</th>
  );

  // ---------- Render ----------

  if (error && !playerData) {
    return (
      <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
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
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
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
                <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">{playerName}</h1>
                {elo && (
                  <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title={`Peak ${Math.round(elo.elo_peak)} · confidence ${Math.round(elo.elo_confidence * 100)}%`}>
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
                {lastGame && <span>Last game {fmtDate(lastGame)}</span>}
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
              <div className={`mb-4 grid grid-cols-3 gap-2 ${inView.tranq.fired > 0 ? 'md:grid-cols-7' : 'md:grid-cols-6'}`}>
                <StatTile label="Games" value={aggregateTotals?.totalGames ?? '—'} />
                <StatTile label="Win rate" value={fmtPct(cs.winRate, 0)} color={winColor(cs.winRate)} hint={`${inView.wins} of ${games.length} in view`} />
                <StatTile label="K/D" value={fmtNum(cs.killDeathRatio, 2)} />
                <StatTile label="Accuracy" value={fmtPct(cs.avgAccuracy, 0)} />
                {elo ? <StatTile label="ELO" value={Math.round(elo.weighted_elo)} hint={inView.hasElo ? `${fmtDelta(inView.eloTotal, 0)} in view` : undefined} color={T.highlight} /> : <StatTile label="Caps" value={aggregateTotals?.totalCaptures ?? '—'} />}
                <StatTile label="Kills" value={(aggregateTotals?.totalKills ?? 0).toLocaleString()} />
                {inView.tranq.fired > 0 && <StatTile label="Tranq" value={fmtPct(inView.tranq.landed / inView.tranq.fired, 0)} hint={`${inView.tranq.landed} / ${inView.tranq.fired} darts in view`} color={T.highlight} />}
              </div>
            )}

            {/* ---- Filters --------------------------------------------------- */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-[#131A2B] px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">Mode</span>
              <button type="button" onClick={() => setGameMode('all')} className={chipCls(gameMode === 'all')}>All</button>
              {byMode.modes.map((m) => (
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

            {/* ---- Sides / class time / weapons (games in view) -------------- */}
            {games.length > 0 && (
              <div className="mb-4 grid gap-4 lg:grid-cols-3">
                <Card title="Offense vs defense" right={`${games.length} games in view`}>
                  {inView.bySide.some((s) => s.games > 0) ? (
                    <div className="space-y-3">
                      {inView.bySide.filter((s) => s.games > 0).map((s) => (
                        <div key={s.side}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="inline-flex items-center gap-2"><SideBadge side={s.side} /><span className="text-[#8B98B0]">{s.games} game{s.games === 1 ? '' : 's'}</span></span>
                            <span className="tabular-nums"><span className={winCls(s.winRate)}>{fmtPct(s.winRate, 0)}</span><span className="text-[#8B98B0]"> · {s.kd} K/D · {fmtNum(s.kpg, 1)} K/g</span></span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.winRate * 100}%`, background: SIDE[s.side].color }} /></div>
                        </div>
                      ))}
                      {games.some((g) => !isSide(g.side)) && <p className="text-[11px] text-[#8B98B0]">{games.filter((g) => !isSide(g.side)).length} game{games.filter((g) => !isSide(g.side)).length === 1 ? '' : 's'} without a recorded side (pub games, or older than Sep 2026).</p>}
                      {inView.schema2 && (inView.summoned > 0 || inView.summons > 0 || inView.captainGames > 0) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B98B0] pt-1 border-t border-white/[0.06]">
                          <span>Summoned <span className="text-[#E6EDF7] tabular-nums">{inView.summoned}</span></span>
                          <span>Summons performed <span className="text-[#E6EDF7] tabular-nums">{inView.summons}</span></span>
                          {inView.captainGames > 0 && <span><span className="text-[#F59E0B]">★</span> Captain <span className="text-[#E6EDF7] tabular-nums">{inView.captainGames}×</span></span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#8B98B0]">No offense/defense games in view.</p>
                  )}
                  {inView.hasElo && (
                    <div className="mt-4 pt-3 border-t border-white/[0.06]">
                      <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">ELO over these games</div>
                      <EloSparkline games={games} />
                    </div>
                  )}
                </Card>
                <Card title="Class time" right={inView.playSeconds ? `${fmtMMSS(inView.playSeconds)} played` : undefined}>
                  <ClassBars classes={inView.classes} emptyText="Class time is recorded for games from Sep 2026 on." />
                </Card>
                <Card title="Weapons" right="Shots fired · hit · accuracy">
                  <WeaponTable weapons={inView.weapons} max={10} emptyText="Per-weapon accuracy is recorded for games from Sep 2026 on." />
                </Card>
              </div>
            )}

            {/* ---- All-time by game mode ------------------------------------- */}
            {byMode.all.length > 0 && (
              <Card title="All-time by mode" right="Not affected by the filters" className="mb-4" pad={false}>
                <div className="overflow-x-auto px-2 pb-2">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr>{th('Mode', false)}{th('Games')}{th('Win rate')}{th('Kills')}{th('Deaths')}{th('K/D')}{th('Caps')}{th('EB hits')}{th('Last active')}</tr></thead>
                    <tbody>
                      {byMode.all.map((s) => (
                        <tr key={s.game_mode} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                          <td className="px-3 py-2">{s.game_mode === 'Combined' ? <Tag>All modes</Tag> : <ModeBadge mode={s.game_mode} />}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_games}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${winCls(s.win_rate)}`}>{fmtPct(s.win_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_kills.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{s.total_deaths.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtNum(s.kill_death_ratio, 2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{s.total_captures}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{s.total_eb_hits}</td>
                          <td className="px-3 py-2 text-right text-xs text-[#8B98B0]">{fmtDate(s.last_game_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ---- Class breakdown (from the games in view) ------------------- */}
            {games.length > 0 && (() => {
              const classStats = games.reduce((acc: Record<string, { games: number; wins: number; kills: number; deaths: number; captures: number; totalAccuracy: number; seconds: number }>, game) => {
                const className = game.main_class;
                const c = acc[className] ||= { games: 0, wins: 0, kills: 0, deaths: 0, captures: 0, totalAccuracy: 0, seconds: 0 };
                c.games += 1;
                if (game.result === 'Win') c.wins += 1;
                c.kills += game.kills;
                c.deaths += game.deaths;
                c.captures += game.captures ?? 0;
                c.totalAccuracy += game.accuracy;
                c.seconds += Number(game.class_play_times?.[className] ?? 0);
                return acc;
              }, {});
              const sortedClasses = Object.entries(classStats)
                .map(([className, stats]) => ({
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
              const anySeconds = sortedClasses.some((c) => c.seconds > 0);
              return (
                <Card title="By class" right={`From the ${games.length} games in view · main class of each game`} className="mb-4" pad={false}>
                  <div className="overflow-x-auto px-2 pb-2">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr>{th('Class', false)}{th('Games')}{anySeconds && th('Time', true, 'Time as this class across the games in view')}{th('Win rate')}{th('K/D')}{th('Avg K')}{th('Avg D')}{th('Avg caps')}{th('Accuracy')}</tr></thead>
                      <tbody>
                        {sortedClasses.map((c, i) => (
                          <tr key={c.className} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                            <td className="px-3 py-2">
                              <ClassChip name={c.className} />
                              {i === 0 && <Tag className="ml-2">Main</Tag>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{c.games}</td>
                            {anySeconds && <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{c.seconds ? fmtMMSS(c.seconds) : '—'}</td>}
                            <td className={`px-3 py-2 text-right tabular-nums ${winCls(c.winRate)}`}>{fmtPct(c.winRate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtNum(c.kd, 2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtNum(c.avgKills, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{fmtNum(c.avgDeaths, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtNum(c.avgCaptures, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtPct(c.avgAccuracy)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })()}

            {/* ---- Recent games ----------------------------------------------- */}
            {games.length > 0 && (
              <Card title={<>Recent games <span className="text-sm text-[#8B98B0] font-body">· {games.length}</span></>} className="mb-4" pad={false}>
                <div className="overflow-x-auto px-2 pb-2">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead><tr>{th('Date', false)}{th('Mode', false)}{th('Arena', false)}{th('Side', false)}{th('Result', false)}{th('Class', false)}{th('K')}{th('D')}{th('K/D')}{th('Caps')}{th('Acc')}{inView.tranq.fired > 0 && th('Tranq', true, 'Tranq darts landed / fired')}{inView.hasElo && th('ELO Δ')}<th className="px-3 py-2" /></tr></thead>
                    <tbody>
                      {games.map((game) => {
                        const delta = game.elo_change === null || game.elo_change === undefined ? null : Number(game.elo_change);
                        return (
                          <tr key={game.id ?? `${game.game_id}-${game.game_date}`} className="border-t border-white/[0.06] hover:bg-[#1B2438]">
                            <td className="px-3 py-2 text-xs text-[#8B98B0] whitespace-nowrap">{fmtDate(game.game_date)}</td>
                            <td className="px-3 py-2"><ModeBadge mode={game.game_mode} /></td>
                            <td className="px-3 py-2 text-xs text-[#8B98B0] whitespace-nowrap">{game.arena_name}{game.base_used && game.base_used !== 'Unknown' ? <span className="text-[#E6EDF7]"> · {game.base_used}</span> : ''}</td>
                            <td className="px-3 py-2">{isSide(game.side) ? <SideBadge side={game.side} /> : <span className="text-xs text-[#8B98B0]">—</span>}</td>
                            <td className="px-3 py-2"><ResultBadge result={game.result} /></td>
                            <td className="px-3 py-2 text-xs whitespace-nowrap"><span className="font-medium" style={getClassColorStyle(game.main_class)}>{game.main_class}</span>{game.is_captain && <span className="ml-1 text-[#F59E0B]" title="Captain">★</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{game.kills}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{game.deaths}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{fmtKD(game.kills, game.deaths)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{game.captures ?? 0}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#8B98B0]">{game.accuracy ? fmtPct(game.accuracy, 0) : '—'}</td>
                            {inView.tranq.fired > 0 && (() => { const t = tranqOf(game.weapon_stats); return <td className="px-3 py-2 text-right tabular-nums" style={{ color: t.landed > 0 ? T.highlight : T.muted }} title={t.fired > 0 ? `${fmtPct(t.landed / t.fired, 0)} of ${t.fired} darts landed` : undefined}>{t.fired > 0 ? <>{t.landed}<span className="text-[#8B98B0]"> / {t.fired}</span></> : '—'}</td>; })()}
                            {inView.hasElo && <td className="px-3 py-2 text-right tabular-nums" style={{ color: delta === null ? T.muted : delta > 0 ? T.win : delta < 0 ? T.loss : T.muted }}>{fmtDelta(delta)}</td>}
                            <td className="px-3 py-2 text-right">
                              {game.game_id && (
                                <Link href={`/stats/game/${encodeURIComponent(game.game_id)}`} className="rounded-md bg-white/5 px-2 py-1 text-xs text-[#E6EDF7] hover:bg-white/10 whitespace-nowrap">View game</Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {(!games.length && !playerData.aggregateStats?.length) && (
              <div className="rounded-xl bg-[#131A2B] py-12 text-center">
                <p className="font-display text-2xl text-[#E6EDF7]">No game statistics found</p>
                <p className="mt-1 text-sm text-[#8B98B0]">This player hasn&apos;t played any recorded games yet, or the filters are hiding them.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
