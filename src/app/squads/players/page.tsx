'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { CLASS_COLORS } from '@/lib/constants';
import { getLeagues, pickFeatured, getOpenSeason, type LeagueInfo, type LeagueSeason } from '@/lib/leagues';

interface PlayerRow {
  id: string;
  alias: string;
  squadName: string | null;
  squadTag: string | null;
  squadId: string | null;
  registered: boolean;
  classes: string[];
  draftedRound: number | null;
  games: number;
  winRate: number | null;
  kd: number | null;
  kills: number;
  captures: number;
  elo: number | null;
  eloTier: string | null;
  lastActive: string | null;
}

type StatusFilter = 'all' | 'registered' | 'drafted' | 'free' | 'squad';
type SortKey = 'alias' | 'status' | 'games' | 'winRate' | 'kd' | 'kills' | 'captures' | 'elo' | 'lastActive';

const PAGE = 50;

function relative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/**
 * Players: every profile with squad status, this season's registration
 * (draft leagues), and combined stats. Captains use it to size up the pool.
 */
export default function SquadsPlayersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; in_game_alias: string | null; hidden_from_players_list?: boolean }[]>([]);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [squadMap, setSquadMap] = useState<Record<string, { name: string; tag: string; id: string; role: string }>>({});
  const [statsMap, setStatsMap] = useState<Record<string, { total_games: number; total_kills: number; total_captures: number; win_rate: number; kill_death_ratio: number; last_game_date: string | null }>>({});
  const [eloMap, setEloMap] = useState<Record<string, { weighted_elo: number; elo_tier?: { name: string } }>>({});
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [season, setSeason] = useState<LeagueSeason | null>(null);
  const [regMap, setRegMap] = useState<Record<string, string[]>>({});
  const [draftMap, setDraftMap] = useState<Record<string, { round: number; tag: string | null }>>({});

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('games');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;

    async function loadSquadMap() {
      const map: Record<string, { name: string; tag: string; id: string; role: string }> = {};
      const { data: squads } = await supabase.from('squads').select('id, name, tag').eq('is_active', true).eq('is_legacy', false);
      if (!squads?.length) return map;
      const { data: members } = await supabase.from('squad_members').select('player_id, squad_id, role').eq('status', 'active');
      const squadById = Object.fromEntries((squads || []).map((s) => [s.id, s]));
      (members || []).forEach((m: any) => {
        const s = squadById[m.squad_id];
        if (s) map[m.player_id] = { name: s.name, tag: s.tag, id: s.id, role: m.role || 'player' };
      });
      return map;
    }

    async function loadSeasonContext() {
      const leagues = await getLeagues();
      const featured = pickFeatured(leagues);
      if (!featured) return { featured: null, open: null, reg: {}, drafted: {} };
      const open = await getOpenSeason(featured);
      const reg: Record<string, string[]> = {};
      const drafted: Record<string, { round: number; tag: string | null }> = {};
      if (open) {
        const { data: regs } = await supabase
          .from('free_agents')
          .select('player_id, preferred_roles')
          .eq('is_active', true)
          .eq('league_slug', featured.slug)
          .eq('season_number', open.season_number);
        (regs || []).forEach((r: any) => { reg[r.player_id] = r.preferred_roles || []; });

        if (featured.slug === 'ctfdl') {
          const { data: draft } = await supabase.from('ctfdl_drafts').select('id').eq('league_season_id', open.id).maybeSingle();
          if (draft) {
            const { data: teams } = await supabase.from('ctfdl_draft_teams').select('id, squads(tag)').eq('draft_id', draft.id);
            const tagByTeam: Record<string, string | null> = {};
            (teams || []).forEach((t: any) => { tagByTeam[t.id] = t.squads?.tag ?? null; });
            const { data: picks } = await supabase.from('ctfdl_draft_picks').select('player_id, round, team_id').eq('draft_id', draft.id);
            (picks || []).forEach((p: any) => { if (p.player_id) drafted[p.player_id] = { round: p.round, tag: tagByTeam[p.team_id] ?? null }; });
          }
        }
      }
      return { featured, open, reg, drafted };
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let profRes: { data: any[] | null; error: any } = await supabase.from('profiles').select('id, in_game_alias, hidden_from_players_list').order('in_game_alias');
        if (profRes.error && (profRes.error.message?.includes('column') || profRes.error.message?.includes('does not exist'))) {
          profRes = await supabase.from('profiles').select('id, in_game_alias').order('in_game_alias');
        }
        const [squadRes, statsRes, eloRes, ctx] = await Promise.all([
          loadSquadMap(),
          fetch('/api/player-stats/leaderboard?gameMode=Combined&limit=1000&minGames=0').then((r) => (r.ok ? r.json() : { success: false, data: [] })),
          fetch('/api/player-stats/elo-leaderboard?gameMode=Combined&limit=1000&minGames=0').then((r) => (r.ok ? r.json() : { data: [] })),
          loadSeasonContext().catch((e) => { console.error('season context', e); return { featured: null, open: null, reg: {}, drafted: {} }; }),
        ]);
        if (cancelled) return;

        if (profRes.error) throw new Error(profRes.error.message);
        setProfiles(((profRes.data || []) as any[]).filter((p) => p.hidden_from_players_list !== true));

        if (user) {
          const { data: me } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).single();
          if (!cancelled) setIsAdmin(!!(me?.is_admin === true || me?.ctf_role === 'ctf_admin'));
        }

        setSquadMap(squadRes);
        setLeague(ctx.featured);
        setSeason(ctx.open);
        setRegMap(ctx.reg);
        setDraftMap(ctx.drafted);

        const stats: typeof statsMap = {};
        ((statsRes.data || []) as any[]).forEach((p: any) => {
          const key = (p.player_name || '').trim().toLowerCase();
          if (key) stats[key] = {
            total_games: p.total_games ?? 0,
            total_kills: p.total_kills ?? 0,
            total_captures: p.total_captures ?? 0,
            win_rate: Number(p.win_rate) ?? 0,
            kill_death_ratio: Number(p.kill_death_ratio) ?? 0,
            last_game_date: p.last_game_date || null,
          };
        });
        setStatsMap(stats);

        const elo: typeof eloMap = {};
        (eloRes.data || []).forEach((p: any) => {
          const key = (p.player_name || '').trim().toLowerCase();
          if (key) elo[key] = { weighted_elo: Number(p.weighted_elo) ?? 0, elo_tier: p.elo_tier };
        });
        setEloMap(elo);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  const hideFromList = async (profileId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    setHidingId(profileId);
    try {
      const res = await fetch('/api/admin/hide-from-players-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ profileId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to hide');
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    } catch (e) {
      console.error(e);
      alert((e as Error).message || 'Failed to hide from list');
    } finally {
      setHidingId(null);
    }
  };

  const allRows: PlayerRow[] = useMemo(() => profiles.map((p) => {
    const alias = (p.in_game_alias || 'Unknown').trim();
    const key = alias.toLowerCase();
    const squad = squadMap[p.id];
    const stats = statsMap[key];
    const elo = eloMap[key];
    return {
      id: p.id,
      alias,
      squadName: squad?.name ?? null,
      squadTag: squad?.tag ?? null,
      squadId: squad?.id ?? null,
      registered: !!regMap[p.id],
      classes: regMap[p.id] || [],
      draftedRound: draftMap[p.id]?.round ?? null,
      games: stats?.total_games ?? 0,
      winRate: stats?.win_rate ?? null,
      kd: stats?.kill_death_ratio ?? null,
      kills: stats?.total_kills ?? 0,
      captures: stats?.total_captures ?? 0,
      elo: elo?.weighted_elo ?? null,
      eloTier: elo?.elo_tier?.name ?? null,
      lastActive: stats?.last_game_date ?? null,
    };
  }), [profiles, squadMap, statsMap, eloMap, regMap, draftMap]);

  const counts = useMemo(() => ({
    all: allRows.length,
    registered: allRows.filter((r) => r.registered).length,
    drafted: allRows.filter((r) => r.draftedRound != null).length,
    free: allRows.filter((r) => r.registered && !r.squadId).length,
    squad: allRows.filter((r) => !!r.squadId).length,
  }), [allRows]);

  const statusRank = (r: PlayerRow) => (r.draftedRound != null ? 3 : r.registered ? 2 : r.squadId ? 1 : 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allRows;
    if (q) list = list.filter((r) => r.alias.toLowerCase().includes(q) || r.squadName?.toLowerCase().includes(q) || r.squadTag?.toLowerCase().includes(q) || r.classes.some((c) => c.toLowerCase().includes(q)));
    if (status === 'registered') list = list.filter((r) => r.registered);
    if (status === 'drafted') list = list.filter((r) => r.draftedRound != null);
    if (status === 'free') list = list.filter((r) => r.registered && !r.squadId);
    if (status === 'squad') list = list.filter((r) => !!r.squadId);
    const ord = sortOrder === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'alias': diff = a.alias.localeCompare(b.alias); break;
        case 'status': diff = statusRank(a) - statusRank(b) || (a.squadName || '').localeCompare(b.squadName || ''); break;
        case 'games': diff = a.games - b.games; break;
        case 'winRate': diff = (a.winRate ?? -1) - (b.winRate ?? -1); break;
        case 'kd': diff = (a.kd ?? -1) - (b.kd ?? -1); break;
        case 'kills': diff = a.kills - b.kills; break;
        case 'captures': diff = a.captures - b.captures; break;
        case 'elo': diff = (a.elo ?? -1) - (b.elo ?? -1); break;
        case 'lastActive': diff = (a.lastActive || '').localeCompare(b.lastActive || ''); break;
      }
      return diff * ord || a.alias.localeCompare(b.alias);
    });
  }, [allRows, search, status, sortBy, sortOrder]);

  useEffect(() => { setLimit(PAGE); }, [search, status, sortBy, sortOrder]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(key); setSortOrder(key === 'alias' ? 'asc' : 'desc'); }
  };

  const th = (key: SortKey, label: string, right = false) => (
    <th
      className={`sticky top-0 z-10 bg-[#131A2B] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide ${right ? 'text-right' : 'text-left'} ${sortBy === key ? 'text-[#22D3EE]' : 'text-[#8B98B0]'} cursor-pointer select-none hover:text-[#E6EDF7]`}
      onClick={() => toggleSort(key)}
    >
      {label}{sortBy === key ? (sortOrder === 'desc' ? ' ▾' : ' ▴') : ''}
    </th>
  );

  const chip = (key: StatusFilter, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setStatus(key)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${status === key ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}
    >
      {label} <span className={status === key ? 'opacity-70' : 'text-[#8B98B0]'}>{n}</span>
    </button>
  );

  const seasonLabel = league && season ? `${league.name} Season ${season.season_number}` : null;
  const isDraftLeague = !!league?.format && league.format !== 'squad';
  const shown = rows.slice(0, limit);

  return (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 rounded-xl bg-[#131A2B] p-4 md:p-5">
          <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">Players</div>
          <h1 className="font-display text-2xl leading-none text-[#E6EDF7] md:text-3xl">
            {allRows.length} players
            {seasonLabel && <span className="ml-2 text-base text-[#8B98B0]">· {counts.registered} registered for {seasonLabel}</span>}
          </h1>
          <p className="mt-1 text-sm text-[#8B98B0]">Combined stats across game modes. Click a name for the full profile.{isDraftLeague ? ' Registered players show the classes they signed up with.' : ''}</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-[#131A2B] px-4 py-3">
          <input
            type="text"
            placeholder="Search name, squad or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1">
            {chip('all', 'All', counts.all)}
            {seasonLabel && chip('registered', 'Registered', counts.registered)}
            {seasonLabel && isDraftLeague && chip('drafted', 'Drafted', counts.drafted)}
            {seasonLabel && chip('free', 'Free agents', counts.free)}
            {chip('squad', 'In a squad', counts.squad)}
          </div>
          <span className="ml-auto text-xs text-[#8B98B0]">{rows.length} shown</span>
        </div>

        {loading && <div className="py-16 text-center text-[#8B98B0]">Loading players…</div>}
        {error && <div className="rounded-xl bg-[#F87171]/10 px-4 py-3 text-sm text-[#F87171]">{error}</div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto rounded-xl bg-[#131A2B]">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 bg-[#131A2B] px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">#</th>
                    {th('alias', 'Player')}
                    {th('status', seasonLabel ? 'Status' : 'Squad')}
                    {th('games', 'Games', true)}
                    {th('winRate', 'Win%', true)}
                    {th('kills', 'Kills', true)}
                    {th('kd', 'K/D', true)}
                    {th('captures', 'Caps', true)}
                    {th('elo', 'ELO', true)}
                    {th('lastActive', 'Last active', true)}
                    {isAdmin && <th className="sticky top-0 z-10 bg-[#131A2B] px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">Admin</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id} className={`border-t border-white/[0.06] hover:bg-[#1B2438] ${user?.id === r.id ? 'bg-[#22D3EE]/5' : ''}`}>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-[#8B98B0]">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/stats/player/${encodeURIComponent(r.alias)}`} className="font-medium text-[#E6EDF7] hover:text-[#22D3EE]">{r.alias}</Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.draftedRound != null && (
                            <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">Drafted R{r.draftedRound}</span>
                          )}
                          {r.registered && r.draftedRound == null && (
                            <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#34D399]">Registered</span>
                          )}
                          {r.squadId ? (
                            <Link href={`/squads/${r.squadId}`} className="text-[#E6EDF7] hover:text-[#22D3EE] whitespace-nowrap">[{r.squadTag}] {r.squadName}</Link>
                          ) : !r.registered ? (
                            <span className="text-[#8B98B0]/50">—</span>
                          ) : null}
                          {r.classes.slice(0, 3).map((c) => (
                            <span key={c} className={`rounded border px-1 py-0.5 text-[10px] font-medium leading-none ${CLASS_COLORS[c] || 'border-white/10 text-[#8B98B0]'}`}>{c}</span>
                          ))}
                          {r.classes.length > 3 && <span className="text-[10px] text-[#8B98B0]">+{r.classes.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{r.games || <span className="text-[#8B98B0]/50">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{r.winRate != null && r.games ? `${(r.winRate * 100).toFixed(1)}%` : <span className="text-[#8B98B0]/50">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{r.kills ? r.kills.toLocaleString() : <span className="text-[#8B98B0]/50">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{r.kd != null && r.games ? r.kd.toFixed(2) : <span className="text-[#8B98B0]/50">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6EDF7]">{r.captures ? r.captures.toLocaleString() : <span className="text-[#8B98B0]/50">—</span>}</td>
                      <td className="px-3 py-2 text-right">
                        {r.elo != null ? <span title={r.eloTier || ''} className="rounded bg-[#22D3EE]/10 px-1.5 py-0.5 text-xs tabular-nums text-[#22D3EE]">{Math.round(r.elo)}</span> : <span className="text-[#8B98B0]/50">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-[#8B98B0] whitespace-nowrap" title={r.lastActive ? new Date(r.lastActive).toLocaleString() : ''}>{relative(r.lastActive)}</td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button type="button" onClick={() => hideFromList(r.id)} disabled={hidingId === r.id} className="text-xs text-[#8B98B0] hover:text-[#F59E0B] disabled:opacity-50" title="Remove from players list (hidden for everyone)">
                            {hidingId === r.id ? '…' : 'Hide'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={isAdmin ? 11 : 10} className="px-3 py-10 text-center text-sm text-[#8B98B0]">No players match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > shown.length && (
              <div className="mt-3 text-center">
                <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">
                  Show more · {rows.length - shown.length} remaining
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
