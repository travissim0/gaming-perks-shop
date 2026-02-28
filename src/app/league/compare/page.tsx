'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Squad {
  id: string;
  name: string;
  tag: string;
}

interface SquadMember {
  squad_id: string;
  player_id: string;
  in_game_alias: string;
  role: string;
}

interface PlayerStats {
  player_name: string;
  total_kills: number;
  total_deaths: number;
  kill_death_ratio: number;
  total_captures: number;
  total_games: number;
}

interface EloEntry {
  player_name: string;
  weighted_elo: number;
}

interface MemberWithStats {
  alias: string;
  role: string;
  kills: number;
  deaths: number;
  kd: number;
  captures: number;
  elo: number;
}

interface MatchReport {
  id: string;
  title: string;
  squad_a_name: string;
  squad_b_name: string;
  match_date: string;
  season_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Render a horizontal comparison bar for a single stat. */
function ComparisonBar({
  label,
  valueA,
  valueB,
  formatValue,
}: {
  label: string;
  valueA: number;
  valueB: number;
  formatValue?: (v: number) => string;
}) {
  const fmt = formatValue ?? ((v: number) => String(v));
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;

  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-400 text-center font-medium">{label}</div>
      <div className="flex items-center gap-2">
        {/* Squad A bar (grows right-to-left) */}
        <span className="w-20 text-right text-sm font-semibold text-cyan-400">
          {fmt(valueA)}
        </span>
        <div className="flex-1 flex items-center gap-1">
          <div className="flex-1 flex justify-end">
            <div
              className="h-5 rounded-l bg-cyan-500/70 transition-all duration-500"
              style={{ width: `${pctA}%` }}
            />
          </div>
          <div className="flex-1">
            <div
              className="h-5 rounded-r bg-purple-500/70 transition-all duration-500"
              style={{ width: `${pctB}%` }}
            />
          </div>
        </div>
        <span className="w-20 text-left text-sm font-semibold text-purple-400">
          {fmt(valueB)}
        </span>
      </div>
    </div>
  );
}

/** Skeleton placeholder while loading. */
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="h-6 bg-gray-700 rounded w-40 mb-4" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-12 bg-gray-700/50 rounded mb-2" />
            ))}
          </div>
        ))}
      </div>
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="h-6 bg-gray-700 rounded w-48 mb-4" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-700/50 rounded mb-3" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SquadComparePage() {
  // Squad selection
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadAId, setSquadAId] = useState('');
  const [squadBId, setSquadBId] = useState('');

  // Comparison data
  const [membersA, setMembersA] = useState<MemberWithStats[]>([]);
  const [membersB, setMembersB] = useState<MemberWithStats[]>([]);
  const [matches, setMatches] = useState<MatchReport[]>([]);

  // Loading / error
  const [squadsLoading, setSquadsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch active squads on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function fetchSquads() {
      try {
        const { data, error: sqErr } = await supabase
          .from('squads')
          .select('id, name, tag')
          .eq('is_active', true)
          .order('name');

        if (sqErr) throw sqErr;
        setSquads(data ?? []);
      } catch (err) {
        console.error('Failed to load squads:', err);
        setError('Failed to load squads.');
      } finally {
        setSquadsLoading(false);
      }
    }
    fetchSquads();
  }, []);

  // -----------------------------------------------------------------------
  // When both squads are selected, fetch comparison data
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!squadAId || !squadBId || squadAId === squadBId) {
      setMembersA([]);
      setMembersB([]);
      setMatches([]);
      return;
    }

    async function fetchComparisonData() {
      setDataLoading(true);
      setError(null);
      try {
        // 1. Fetch members for both squads
        const [resA, resB] = await Promise.all([
          supabase
            .from('squad_members')
            .select('squad_id, player_id, in_game_alias, role')
            .eq('squad_id', squadAId),
          supabase
            .from('squad_members')
            .select('squad_id, player_id, in_game_alias, role')
            .eq('squad_id', squadBId),
        ]);

        if (resA.error) throw resA.error;
        if (resB.error) throw resB.error;

        const rawA: SquadMember[] = resA.data ?? [];
        const rawB: SquadMember[] = resB.data ?? [];

        // 2. Fetch leaderboard stats (large limit to capture all players)
        const [statsRes, eloRes] = await Promise.all([
          fetch('/api/player-stats/leaderboard?limit=1000&sortBy=total_kills&sortOrder=desc'),
          fetch('/api/player-stats/elo-leaderboard?limit=1000&minGames=1'),
        ]);

        const statsJson = await statsRes.json();
        const eloJson = await eloRes.json();

        const allStats: PlayerStats[] = statsJson.data ?? [];
        const allElo: EloEntry[] = eloJson.data ?? [];

        // Build lookup maps (lowercase keys)
        const statsMap = new Map<string, PlayerStats>();
        for (const s of allStats) {
          statsMap.set(s.player_name.toLowerCase(), s);
        }

        const eloMap = new Map<string, number>();
        for (const e of allElo) {
          eloMap.set(e.player_name.toLowerCase(), Number(e.weighted_elo) || 0);
        }

        // 3. Merge member info with stats
        const buildMembers = (raw: SquadMember[]): MemberWithStats[] =>
          raw.map((m) => {
            const key = m.in_game_alias.toLowerCase();
            const ps = statsMap.get(key);
            return {
              alias: m.in_game_alias,
              role: m.role,
              kills: ps?.total_kills ?? 0,
              deaths: ps?.total_deaths ?? 0,
              kd: ps ? Number(ps.kill_death_ratio) : 0,
              captures: ps?.total_captures ?? 0,
              elo: eloMap.get(key) ?? 0,
            };
          });

        setMembersA(buildMembers(rawA));
        setMembersB(buildMembers(rawB));

        // 4. Head-to-head matches
        const { data: matchData, error: matchErr } = await supabase
          .from('match_reports')
          .select('id, title, squad_a_name, squad_b_name, match_date, season_name')
          .or(
            `and(squad_a_id.eq.${squadAId},squad_b_id.eq.${squadBId}),and(squad_a_id.eq.${squadBId},squad_b_id.eq.${squadAId})`
          )
          .order('match_date', { ascending: false })
          .limit(20);

        if (matchErr) throw matchErr;
        setMatches(matchData ?? []);
      } catch (err: any) {
        console.error('Comparison fetch error:', err);
        setError(err?.message ?? 'Failed to load comparison data.');
      } finally {
        setDataLoading(false);
      }
    }

    fetchComparisonData();
  }, [squadAId, squadBId]);

  // -----------------------------------------------------------------------
  // Derived aggregates
  // -----------------------------------------------------------------------
  const aggregate = (members: MemberWithStats[]) => {
    if (members.length === 0)
      return { totalKills: 0, avgKd: 0, totalCaptures: 0, avgElo: 0 };
    const totalKills = members.reduce((s, m) => s + m.kills, 0);
    const avgKd =
      members.reduce((s, m) => s + m.kd, 0) / members.length;
    const totalCaptures = members.reduce((s, m) => s + m.captures, 0);
    const eloMembers = members.filter((m) => m.elo > 0);
    const avgElo =
      eloMembers.length > 0
        ? eloMembers.reduce((s, m) => s + m.elo, 0) / eloMembers.length
        : 0;
    return { totalKills, avgKd, totalCaptures, avgElo };
  };

  const aggA = aggregate(membersA);
  const aggB = aggregate(membersB);

  const squadA = squads.find((s) => s.id === squadAId);
  const squadB = squads.find((s) => s.id === squadBId);

  const bothSelected = squadAId && squadBId && squadAId !== squadBId;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/league"
          className="inline-flex items-center text-sm text-gray-400 hover:text-cyan-400 transition-colors mb-6"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to League
        </Link>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          Squad Comparison
        </h1>
        <p className="text-gray-400 mb-8">Compare squads head-to-head</p>

        {/* ---- Squad Selectors ---- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Squad A */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-1">
              Squad A
            </label>
            <select
              value={squadAId}
              onChange={(e) => setSquadAId(e.target.value)}
              disabled={squadsLoading}
              className="w-full bg-gray-800 border border-cyan-500/40 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            >
              <option value="">Select a squad...</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === squadBId}>
                  {s.name} [{s.tag}]
                </option>
              ))}
            </select>
          </div>

          {/* Squad B */}
          <div>
            <label className="block text-sm font-medium text-purple-400 mb-1">
              Squad B
            </label>
            <select
              value={squadBId}
              onChange={(e) => setSquadBId(e.target.value)}
              disabled={squadsLoading}
              className="w-full bg-gray-800 border border-purple-500/40 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
            >
              <option value="">Select a squad...</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === squadAId}>
                  {s.name} [{s.tag}]
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Prompt to select */}
        {!bothSelected && !dataLoading && (
          <div className="text-center text-gray-500 py-16">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
            <p className="text-lg">Select two different squads to compare</p>
          </div>
        )}

        {/* Loading skeleton */}
        {dataLoading && <LoadingSkeleton />}

        {/* ---- Comparison Content ---- */}
        {bothSelected && !dataLoading && (
          <div className="space-y-8">
            {/* Roster comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Squad A Roster */}
              <div className="bg-gray-800/50 border border-cyan-500/20 rounded-lg p-5">
                <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  {squadA?.name}{' '}
                  <span className="text-gray-500 font-normal">[{squadA?.tag}]</span>
                  <span className="ml-auto text-xs text-gray-500 font-normal">
                    {membersA.length} members
                  </span>
                </h2>
                {membersA.length === 0 ? (
                  <p className="text-gray-500 text-sm">No members found.</p>
                ) : (
                  <div className="space-y-2">
                    {membersA.map((m) => (
                      <Link
                        key={m.alias}
                        href={`/stats/player/${encodeURIComponent(m.alias)}`}
                        className="block bg-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-3 hover:border-cyan-500/40 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white">{m.alias}</span>
                          <span className="text-xs text-gray-500 capitalize">{m.role.replace('_', ' ')}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-400">
                          <span>
                            Kills:{' '}
                            <span className="text-cyan-300">{m.kills.toLocaleString()}</span>
                          </span>
                          <span>
                            K/D:{' '}
                            <span className="text-cyan-300">{m.kd.toFixed(2)}</span>
                          </span>
                          <span>
                            Caps:{' '}
                            <span className="text-cyan-300">{m.captures.toLocaleString()}</span>
                          </span>
                          <span>
                            ELO:{' '}
                            <span className="text-cyan-300">
                              {m.elo > 0 ? Math.round(m.elo) : '---'}
                            </span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Squad B Roster */}
              <div className="bg-gray-800/50 border border-purple-500/20 rounded-lg p-5">
                <h2 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  {squadB?.name}{' '}
                  <span className="text-gray-500 font-normal">[{squadB?.tag}]</span>
                  <span className="ml-auto text-xs text-gray-500 font-normal">
                    {membersB.length} members
                  </span>
                </h2>
                {membersB.length === 0 ? (
                  <p className="text-gray-500 text-sm">No members found.</p>
                ) : (
                  <div className="space-y-2">
                    {membersB.map((m) => (
                      <Link
                        key={m.alias}
                        href={`/stats/player/${encodeURIComponent(m.alias)}`}
                        className="block bg-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-3 hover:border-purple-500/40 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white">{m.alias}</span>
                          <span className="text-xs text-gray-500 capitalize">{m.role.replace('_', ' ')}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-400">
                          <span>
                            Kills:{' '}
                            <span className="text-purple-300">{m.kills.toLocaleString()}</span>
                          </span>
                          <span>
                            K/D:{' '}
                            <span className="text-purple-300">{m.kd.toFixed(2)}</span>
                          </span>
                          <span>
                            Caps:{' '}
                            <span className="text-purple-300">{m.captures.toLocaleString()}</span>
                          </span>
                          <span>
                            ELO:{' '}
                            <span className="text-purple-300">
                              {m.elo > 0 ? Math.round(m.elo) : '---'}
                            </span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ---- Aggregate Stats ---- */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold text-white mb-1">Aggregate Comparison</h2>
              <p className="text-xs text-gray-500 mb-5">
                <span className="text-cyan-400">{squadA?.tag}</span>
                {' vs '}
                <span className="text-purple-400">{squadB?.tag}</span>
              </p>
              <div className="space-y-5">
                <ComparisonBar
                  label="Total Kills"
                  valueA={aggA.totalKills}
                  valueB={aggB.totalKills}
                  formatValue={(v) => v.toLocaleString()}
                />
                <ComparisonBar
                  label="Avg K/D"
                  valueA={aggA.avgKd}
                  valueB={aggB.avgKd}
                  formatValue={(v) => v.toFixed(2)}
                />
                <ComparisonBar
                  label="Total Captures"
                  valueA={aggA.totalCaptures}
                  valueB={aggB.totalCaptures}
                  formatValue={(v) => v.toLocaleString()}
                />
                <ComparisonBar
                  label="Avg ELO"
                  valueA={aggA.avgElo}
                  valueB={aggB.avgElo}
                  formatValue={(v) => (v > 0 ? Math.round(v).toLocaleString() : '---')}
                />
              </div>
            </div>

            {/* ---- Head-to-Head Match History ---- */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold text-white mb-4">Head-to-Head Match History</h2>
              {matches.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">
                  No matches found between these squads.
                </p>
              ) : (
                <div className="space-y-2">
                  {matches.map((match) => (
                    <Link
                      key={match.id}
                      href={`/league/match-reports/${match.id}`}
                      className="block bg-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-3 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="font-medium text-white">{match.title}</span>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {match.season_name && (
                            <span className="bg-gray-700/50 px-2 py-0.5 rounded">
                              {match.season_name}
                            </span>
                          )}
                          <span>{formatDate(match.match_date)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="text-cyan-400">{match.squad_a_name}</span>
                        {' vs '}
                        <span className="text-purple-400">{match.squad_b_name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
