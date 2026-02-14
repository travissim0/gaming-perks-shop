'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

interface PlayerRow {
  id: string;
  alias: string;
  akas: string[];
  squadName: string | null;
  squadTag: string | null;
  squadId: string | null;
  role: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  kd: number | null;
  elo: number | null;
  eloTier: string | null;
  lastActive: string | null;
}

export default function SquadsPlayersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; in_game_alias: string | null; hidden_from_players_list?: boolean }[]>([]);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [squadMap, setSquadMap] = useState<Record<string, { name: string; tag: string; id: string; role: string }>>({});
  const [statsMap, setStatsMap] = useState<Record<string, { total_games: number; total_wins: number; total_losses: number; win_rate: number; kill_death_ratio: number; last_game_date: string | null; all_aliases: string | null }>>({});
  const [eloMap, setEloMap] = useState<Record<string, { weighted_elo: number; elo_tier?: { name: string }; all_aliases: string | null }>>({});
  const [search, setSearch] = useState('');
  const [squadFilter, setSquadFilter] = useState<'all' | 'squad' | 'no-squad'>('all');
  const [sortBy, setSortBy] = useState<'alias' | 'squad' | 'games' | 'winRate' | 'kd' | 'elo'>('alias');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let profRes = await supabase.from('profiles').select('id, in_game_alias, hidden_from_players_list').order('in_game_alias');
        if (profRes.error && (profRes.error.message?.includes('column') || profRes.error.message?.includes('does not exist'))) {
          profRes = await supabase.from('profiles').select('id, in_game_alias').order('in_game_alias');
        }
        const [squadRes, statsRes, eloRes] = await Promise.all([
          loadSquadMap(),
          fetch('/api/player-stats/leaderboard?gameMode=Combined&limit=1000&minGames=0').then(r => r.ok ? r.json() : { success: false, data: [] }),
          fetch('/api/player-stats/elo-leaderboard?gameMode=Combined&limit=1000&minGames=0').then(r => r.ok ? r.json() : { data: [] }),
        ]);

        if (cancelled) return;

        if (profRes.error) throw new Error(profRes.error.message);
        const allProfiles = (profRes.data || []) as { id: string; in_game_alias: string | null; hidden_from_players_list?: boolean }[];
        setProfiles(allProfiles.filter((p: any) => p.hidden_from_players_list !== true));

        if (user) {
          const { data: me } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).single();
          if (!cancelled) setIsAdmin(!!(me?.is_admin === true || me?.ctf_role === 'ctf_admin'));
        }

        setSquadMap(squadRes);

        const stats: Record<string, { total_games: number; total_wins: number; total_losses: number; win_rate: number; kill_death_ratio: number; last_game_date: string | null; all_aliases: string | null }> = {};
        ((statsRes.data || []) as any[]).forEach((p: any) => {
          const key = (p.player_name || '').trim().toLowerCase();
          if (key) stats[key] = {
            total_games: p.total_games ?? 0,
            total_wins: p.total_wins ?? 0,
            total_losses: p.total_losses ?? 0,
            win_rate: Number(p.win_rate) ?? 0,
            kill_death_ratio: Number(p.kill_death_ratio) ?? 0,
            last_game_date: p.last_game_date || null,
            all_aliases: p.all_aliases ?? null,
          };
        });
        setStatsMap(stats);

        const elo: Record<string, { weighted_elo: number; elo_tier?: { name: string }; all_aliases: string | null }> = {};
        (eloRes.data || []).forEach((p: any) => {
          const key = (p.profile_id || (p.player_name || '').trim().toLowerCase());
          if (key) elo[key] = {
            weighted_elo: Number(p.weighted_elo) ?? 0,
            elo_tier: p.elo_tier,
            all_aliases: p.all_aliases ?? null,
          };
        });
        (eloRes.data || []).forEach((p: any) => {
          const nameKey = (p.player_name || '').trim().toLowerCase();
          if (nameKey && !elo[nameKey]) elo[nameKey] = { weighted_elo: Number(p.weighted_elo) ?? 0, elo_tier: p.elo_tier, all_aliases: p.all_aliases ?? null };
        });
        setEloMap(elo);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadSquadMap(): Promise<Record<string, { name: string; tag: string; id: string; role: string }>> {
      const map: Record<string, { name: string; tag: string; id: string; role: string }> = {};
      const { data: squads } = await supabase.from('squads').select('id, name, tag').eq('is_active', true);
      if (!squads?.length) return map;
      const { data: members } = await supabase
        .from('squad_members')
        .select('player_id, squad_id, role')
        .eq('status', 'active');
      if (!members) return map;
      const squadById = Object.fromEntries((squads || []).map(s => [s.id, s]));
      members.forEach((m: any) => {
        const s = squadById[m.squad_id];
        if (s) map[m.player_id] = { name: s.name, tag: s.tag, id: s.id, role: m.role || 'player' };
      });
      return map;
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
      setProfiles(prev => prev.filter(p => p.id !== profileId));
    } catch (e) {
      console.error(e);
      alert((e as Error).message || 'Failed to hide from list');
    } finally {
      setHidingId(null);
    }
  };

  function parseAliases(allAliases: string | null | undefined, primaryAlias: string): string[] {
    if (!allAliases || typeof allAliases !== 'string') return [];
    const primary = primaryAlias.trim().toLowerCase();
    const parts = allAliases.split(',').map(s => s.trim()).filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>([primary]);
    for (const a of parts) {
      const lower = a.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        out.push(a);
      }
    }
    return out;
  }

  const rows: PlayerRow[] = useMemo(() => {
    const list: PlayerRow[] = profiles.map(p => {
      const alias = (p.in_game_alias || 'Unknown').trim();
      const aliasLower = alias.toLowerCase();
      const squad = squadMap[p.id];
      const stats = statsMap[aliasLower] || statsMap[alias];
      const eloByProfile = eloMap[p.id];
      const eloByName = eloMap[aliasLower];
      const eloData = eloByProfile || eloByName;
      const statsAliases = parseAliases(stats?.all_aliases, alias);
      const eloAliases = parseAliases(eloData?.all_aliases, alias);
      const akas = [...new Set([...statsAliases, ...eloAliases])];
      return {
        id: p.id,
        alias,
        akas,
        squadName: squad?.name ?? null,
        squadTag: squad?.tag ?? null,
        squadId: squad?.id ?? null,
        role: squad?.role ?? null,
        games: stats?.total_games ?? 0,
        wins: stats?.total_wins ?? 0,
        losses: stats?.total_losses ?? 0,
        winRate: stats?.win_rate != null ? stats.win_rate : null,
        kd: stats?.kill_death_ratio != null ? stats.kill_death_ratio : null,
        elo: eloData?.weighted_elo != null ? eloData.weighted_elo : null,
        eloTier: eloData?.elo_tier?.name ?? null,
        lastActive: stats?.last_game_date ?? null,
      };
    });

    const searchLower = search.trim().toLowerCase();
    let filtered = searchLower
      ? list.filter(r =>
          r.alias.toLowerCase().includes(searchLower) ||
          r.akas.some(a => a.toLowerCase().includes(searchLower)) ||
          r.squadName?.toLowerCase().includes(searchLower) ||
          r.squadTag?.toLowerCase().includes(searchLower)
        )
      : list;

    if (squadFilter === 'squad') filtered = filtered.filter(r => r.squadId != null);
    if (squadFilter === 'no-squad') filtered = filtered.filter(r => r.squadId == null);

    const ord = sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'alias': diff = (a.alias || '').localeCompare(b.alias || ''); break;
        case 'squad': diff = (a.squadName || '').localeCompare(b.squadName || ''); break;
        case 'games': diff = a.games - b.games; break;
        case 'winRate': diff = (a.winRate ?? 0) - (b.winRate ?? 0); break;
        case 'kd': diff = (a.kd ?? 0) - (b.kd ?? 0); break;
        case 'elo': diff = (a.elo ?? 0) - (b.elo ?? 0); break;
        default: break;
      }
      return diff * ord;
    });
    return filtered;
  }, [profiles, squadMap, statsMap, eloMap, search, squadFilter, sortBy, sortOrder]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    else setSortBy(key);
  };

  const profileUrl = (alias: string) => `/stats/player/${encodeURIComponent(alias)}`;

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Players</h1>
          <p className="text-gray-400 mt-1">
            Squad status and stats (Combined). Click a name for full profile and stats.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <input
            type="text"
            placeholder="Search by name or squad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 w-72 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
          />
          <select
            value={squadFilter}
            onChange={e => setSquadFilter(e.target.value as any)}
            className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="all">All</option>
            <option value="squad">In a squad</option>
            <option value="no-squad">No squad</option>
          </select>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent" />
            <span className="ml-3 text-gray-400">Loading players…</span>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-500/30 px-4 py-3 text-red-400">{error}</div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-gray-600/80 bg-gray-800/40 shadow-xl">
            <table className={`w-full text-left ${isAdmin ? 'min-w-[1000px]' : ''}`}>
              <thead>
                <tr className="border-b border-gray-600 bg-gray-800/80">
                  <th className="px-5 py-4 text-sm font-semibold text-cyan-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('alias')}>
                    Player {sortBy === 'alias' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">AKAs</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('squad')}>
                    Squad {sortBy === 'squad' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('games')}>
                    Games {sortBy === 'games' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">W–L</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('winRate')}>
                    Win % {sortBy === 'winRate' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('kd')}>
                    K/D {sortBy === 'kd' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-cyan-300" onClick={() => toggleSort('elo')}>
                    ELO {sortBy === 'elo' && (sortOrder === 'desc' ? ' ▼' : ' ▲')}
                  </th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Profile</th>
                  {isAdmin && <th className="px-5 py-4 text-sm font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[7rem]">Admin</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/80">
                {rows.map(r => (
                  <tr key={r.id} className="bg-gray-800/30 hover:bg-gray-700/50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={profileUrl(r.alias)}
                        className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline"
                      >
                        {r.alias}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{r.akas.length ? r.akas.join(', ') : '—'}</td>
                    <td className="px-5 py-3 text-gray-300">
                      {r.squadId ? (
                        <Link href={`/squads/${r.squadId}`} className="text-cyan-400 hover:text-cyan-300 hover:underline">
                          [{r.squadTag}] {r.squadName}
                        </Link>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{r.role ? r.role.replace('_', ' ') : '—'}</td>
                    <td className="px-5 py-3 text-gray-300 tabular-nums">{r.games}</td>
                    <td className="px-5 py-3 text-gray-300 tabular-nums whitespace-nowrap">{r.games ? `${r.wins}–${r.losses}` : '—'}</td>
                    <td className="px-5 py-3 text-gray-300 tabular-nums">{r.winRate != null ? `${(r.winRate * 100).toFixed(1)}%` : '—'}</td>
                    <td className="px-5 py-3 text-gray-300 tabular-nums">{r.kd != null ? r.kd.toFixed(2) : '—'}</td>
                    <td className="px-5 py-3">
                      {r.elo != null ? (
                        <span title={r.eloTier || ''} className="inline-flex items-center px-2 py-0.5 rounded font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30">
                          {Math.round(r.elo)}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={profileUrl(r.alias)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 hover:border-cyan-500/50 transition-colors"
                      >
                        View profile
                      </Link>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 whitespace-nowrap min-w-[7rem]">
                        <button
                          type="button"
                          onClick={() => hideFromList(r.id)}
                          disabled={hidingId === r.id}
                          className="text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50"
                          title="Remove from players list (hidden for everyone)"
                        >
                          {hidingId === r.id ? '…' : 'Hide from list'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <p className="text-gray-500 text-sm mt-4">
            {rows.length} player{rows.length !== 1 ? 's' : ''}
          </p>
        )}
      </main>
    </div>
  );
}
