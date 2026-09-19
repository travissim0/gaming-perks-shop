'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { StaffShell, HeaderStrip, Panel, Chip, Spinner, Empty, th, td } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnQuiet } from '@/components/ctf/FormBits';
import { useAuth } from '@/lib/AuthContext';
import { getEloTier } from '@/utils/eloTiers';

interface DuelingPlayer {
  player_name: string;
  match_type: string;
  total_matches: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  total_kills: number;
  total_deaths: number;
  kill_death_ratio: number;
  overall_accuracy: number;
  double_hits: number;
  triple_hits: number;
  burst_damage_ratio: number;
  current_elo: number;
  peak_elo: number;
  rank: number;
}

interface DuelingMatch {
  id: number;
  match_type: string;
  player1_name: string;
  player2_name: string;
  winner_name: string;
  player1_rounds_won: number;
  player2_rounds_won: number;
  total_rounds: number;
  match_status: string;
  arena_name: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  formatted_duration: string;
  rounds_data: any[];
  match_stats?: {
    player1_accuracy?: number;
    player1_shots_fired?: number;
    player1_shots_hit?: number;
    player1_double_hits?: number;
    player1_triple_hits?: number;
    player2_accuracy?: number;
    player2_shots_fired?: number;
    player2_shots_hit?: number;
    player2_double_hits?: number;
    player2_triple_hits?: number;
  };
}

interface DuelingResponse {
  success: boolean;
  data: DuelingPlayer[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  filters: {
    matchType: string;
    sortBy: string;
    sortOrder: string;
    playerName: string;
    availableMatchTypes: string[];
  };
}

interface MatchesResponse {
  success: boolean;
  data: DuelingMatch[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

const SORT_OPTIONS = [
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'current_elo', label: 'Current ELO' },
  { value: 'peak_elo', label: 'Peak ELO' },
  { value: 'total_matches', label: 'Total Matches' },
  { value: 'matches_won', label: 'Matches Won' },
  { value: 'kill_death_ratio', label: 'K/D Ratio' },
  { value: 'overall_accuracy', label: 'Accuracy' },
  { value: 'burst_damage_ratio', label: 'Burst Damage' },
  { value: 'double_hits', label: 'Double Hits' },
  { value: 'triple_hits', label: 'Triple Hits' }
];

const MATCH_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'ranked_bo3', label: 'Ranked Bo3' },
  { value: 'ranked_bo5', label: 'Ranked Bo5' },
  { value: 'unranked', label: 'Unranked' },
  { value: 'overall', label: 'Overall Rankings' }
];

export default function DuelingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'matches'>('matches');
  const [duelingPlayers, setDuelingPlayers] = useState<DuelingPlayer[]>([]);
  const [duelingMatches, setDuelingMatches] = useState<DuelingMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [matchType, setMatchType] = useState('all');
  const [sortBy, setSortBy] = useState('current_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Match sorting
  const [matchSortBy, setMatchSortBy] = useState('completed_at');
  const [matchSortOrder, setMatchSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50,
    hasMore: false
  });

  const fetchLeaderboard = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        matchType,
        sortBy,
        sortOrder,
        playerName,
        limit: pagination.limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`/api/dueling/stats?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: DuelingResponse = await response.json();

      if (data.success) {
        setDuelingPlayers(data.data);
        setPagination(data.pagination);
      } else {
        throw new Error('Failed to fetch dueling leaderboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentMatches = async (offset = 0) => {
    try {
      setMatchesLoading(true);

      const params = new URLSearchParams({
        limit: '20',
        offset: offset.toString(),
        matchType: matchType !== 'all' ? matchType : '',
        playerName: playerName
      });

      const response = await fetch(`/api/dueling/matches?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MatchesResponse = await response.json();

      if (data.success) {
        setDuelingMatches(data.data);
      } else {
        throw new Error('Failed to fetch recent matches');
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentMatches();
  }, []);

  useEffect(() => {
    fetchLeaderboard(0);
  }, [matchType, sortBy, sortOrder, playerName]);

  useEffect(() => {
    if (activeTab === 'matches') {
      if (matchType === 'overall') {
        setMatchType('all');
      } else {
        fetchRecentMatches(0);
      }
    }
  }, [activeTab, matchType, playerName]);

  // Auto-switch match type when changing tabs
  useEffect(() => {
    if (activeTab === 'leaderboard' && matchType === 'all') {
      setMatchType('overall');
    } else if (activeTab === 'matches' && matchType === 'overall') {
      setMatchType('all');
    }
  }, [activeTab]);

  const handleSearch = () => {
    setPlayerName(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleMatchSort = (column: string) => {
    if (matchSortBy === column) {
      setMatchSortOrder(matchSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMatchSortBy(column);
      setMatchSortOrder('desc');
    }
  };

  const sortedMatches = [...duelingMatches].sort((a, b) => {
    let aValue: any = a[matchSortBy as keyof DuelingMatch];
    let bValue: any = b[matchSortBy as keyof DuelingMatch];

    if (matchSortBy === 'completed_at') {
      aValue = new Date(a.completed_at).getTime();
      bValue = new Date(b.completed_at).getTime();
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return matchSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return matchSortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;
  const typeLabel = (t: string) => t.replace(/_/g, ' ').replace(/\bbo(\d)\b/i, 'Bo$1').replace(/^\w/, (c) => c.toUpperCase());
  const sortArrow = (col: string) => (matchSortBy === col ? (matchSortOrder === 'asc' ? ' ↑' : ' ↓') : '');

  const filters = (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <label className={labelCls}>Match type</label>
        <select value={matchType} onChange={(e) => setMatchType(e.target.value)} className={inputCls}>
          {MATCH_TYPE_OPTIONS.filter((o) => (activeTab === 'leaderboard' ? o.value !== 'all' : o.value !== 'overall')).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {activeTab === 'leaderboard' && (
        <>
          <div>
            <label className={labelCls}>Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inputCls}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Order</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} className={inputCls}>
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
            </select>
          </div>
        </>
      )}
      <div className={activeTab === 'leaderboard' ? '' : 'sm:col-span-1 lg:col-span-2'}>
        <label className={labelCls}>Player</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Alias…"
            className={inputCls}
          />
          <button type="button" onClick={handleSearch} className={btnQuiet}>Search</button>
          {playerName && (
            <button type="button" onClick={() => { setSearchInput(''); setPlayerName(''); }} className={btnQuiet} title="Clear the player filter">✕</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <StaffShell user={user} maxWidth="max-w-7xl">
      <HeaderStrip
        title="Dueling"
        meta={
          <>
            <span>1v1 in the CTF zone</span>
            <span>· Ranked Bo3 and Bo5 count toward ELO</span>
            {playerName && <span className="text-[#22D3EE]">· showing {playerName}</span>}
          </>
        }
        actions={<Link href="/league" className={btnQuiet}>League page</Link>}
      >
        <div className="mt-4 flex flex-wrap gap-1">
          <Chip active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')}>Leaderboard</Chip>
          <Chip active={activeTab === 'matches'} onClick={() => setActiveTab('matches')}>Recent matches</Chip>
        </div>
      </HeaderStrip>

      {activeTab === 'leaderboard' ? (
        <Panel
          title="Leaderboard"
          hint={(() => {
            const n = pagination.total || duelingPlayers.length;
            return `${n} player${n === 1 ? '' : 's'}${pagination.hasMore ? '+' : ''} · sorted by ${SORT_OPTIONS.find((o) => o.value === sortBy)?.label.toLowerCase() || sortBy}`;
          })()}
        >
          {filters}
          {loading ? (
            <Spinner label="Loading leaderboard…" />
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#F87171] mb-3">{error}</p>
              <button type="button" onClick={() => fetchLeaderboard(0)} className={btnQuiet}>Retry</button>
            </div>
          ) : duelingPlayers.length === 0 ? (
            <Empty>No players match these filters.</Empty>
          ) : (
            <div className="overflow-x-auto border-t border-white/[0.06]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={`${th} w-14`}>#</th>
                    <th className={th}>Player</th>
                    <th className={th}>Type</th>
                    <th className={`${th} text-right`}>Matches</th>
                    <th className={`${th} text-right`}>Win rate</th>
                    <th className={`${th} text-right`}>K/D</th>
                    <th className={`${th} text-right`}>Accuracy</th>
                    <th className={`${th} text-right`}>ELO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {duelingPlayers.map((player) => {
                    const tier = getEloTier(player.current_elo);
                    const rated = player.match_type.startsWith('ranked') || player.match_type === 'overall';
                    return (
                      <tr key={`${player.player_name}-${player.match_type}`} className="hover:bg-white/[0.03]">
                        <td className={`${td} font-display text-lg tabular-nums ${player.rank <= 3 ? 'text-[#F59E0B]' : 'text-[#8B98B0]'}`}>{player.rank}</td>
                        <td className={`${td} text-[#E6EDF7]`}>
                          <Link href={`/stats/player/${encodeURIComponent(player.player_name)}`} className="hover:text-[#22D3EE]">{player.player_name}</Link>
                        </td>
                        <td className={td}><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8B98B0]">{typeLabel(player.match_type)}</span></td>
                        <td className={`${td} text-right tabular-nums`}>
                          <div className="text-[#E6EDF7]">{player.total_matches}</div>
                          <div className="text-[11px] text-[#8B98B0]"><span className="text-[#34D399]">{player.matches_won}W</span> · <span className="text-[#F87171]">{player.matches_lost}L</span></div>
                        </td>
                        <td className={`${td} text-right font-display text-lg tabular-nums ${player.win_rate >= 0.5 ? 'text-[#34D399]' : 'text-[#E6EDF7]'}`}>{formatPercentage(player.win_rate)}</td>
                        <td className={`${td} text-right tabular-nums`}>
                          <div className="text-[#E6EDF7]">{player.kill_death_ratio.toFixed(2)}</div>
                          <div className="text-[11px] text-[#8B98B0]">{player.total_kills}K · {player.total_deaths}D</div>
                        </td>
                        <td className={`${td} text-right tabular-nums text-[#E6EDF7]`}>{formatPercentage(player.overall_accuracy)}</td>
                        <td className={`${td} text-right tabular-nums`}>
                          {rated ? (
                            <>
                              <div className="font-display text-lg" style={{ color: tier.color }}>{player.current_elo}</div>
                              <div className="text-[11px] text-[#8B98B0]"><span style={{ color: tier.color }}>{tier.name}</span> · peak {player.peak_elo}</div>
                            </>
                          ) : (
                            <span className="text-[#8B98B0]/60">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Recent matches" hint="Newest first. Click a column to sort.">
          {filters}
          {matchesLoading ? (
            <Spinner label="Loading matches…" />
          ) : duelingMatches.length === 0 ? (
            <Empty>No matches found.</Empty>
          ) : (
            <div className="overflow-x-auto border-t border-white/[0.06]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={`${th} cursor-pointer hover:text-[#22D3EE]`} onClick={() => handleMatchSort('completed_at')}>Date{sortArrow('completed_at')}</th>
                    <th className={`${th} cursor-pointer hover:text-[#22D3EE]`} onClick={() => handleMatchSort('match_type')}>Type{sortArrow('match_type')}</th>
                    <th className={th}>Players</th>
                    <th className={`${th} text-center cursor-pointer hover:text-[#22D3EE]`} onClick={() => handleMatchSort('total_rounds')}>Score{sortArrow('total_rounds')}</th>
                    <th className={`${th} text-center cursor-pointer hover:text-[#22D3EE]`} onClick={() => handleMatchSort('duration_seconds')}>Length{sortArrow('duration_seconds')}</th>
                    <th className={`${th} text-center`}>P1 stats</th>
                    <th className={`${th} text-center`}>P2 stats</th>
                    <th className={th}>Rounds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sortedMatches.map((match) => {
                    const s = match.match_stats;
                    const p1Won = match.winner_name === match.player1_name;
                    const p2Won = match.winner_name === match.player2_name;
                    const statCell = (acc?: number, hit?: number, fired?: number, dbl?: number, tpl?: number) => (
                      <div className="text-[11px] tabular-nums space-y-0.5">
                        {acc !== undefined && <div className="text-[#E6EDF7]">{(acc * 100).toFixed(1)}% acc</div>}
                        {fired !== undefined && <div className="text-[#8B98B0]">{hit || 0}/{fired || 0}</div>}
                        {(dbl || 0) > 0 && <div className="text-[#F59E0B]">{dbl}×2</div>}
                        {(tpl || 0) > 0 && <div className="text-[#F87171]">{tpl}×3</div>}
                      </div>
                    );
                    const when = new Date(match.completed_at);
                    return (
                      <tr key={match.id} className="hover:bg-white/[0.03] align-top">
                        <td className={`${td} whitespace-nowrap`}>
                          <div className="text-[#E6EDF7]">{when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-[11px] text-[#8B98B0]">{when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                        </td>
                        <td className={td}><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8B98B0] whitespace-nowrap">{typeLabel(match.match_type)}</span></td>
                        <td className={td}>
                          <div className={`text-sm ${p1Won ? 'text-[#34D399]' : 'text-[#E6EDF7]'}`}>{match.player1_name}{p1Won && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">win</span>}</div>
                          <div className="text-[10px] uppercase tracking-wide text-[#8B98B0]/60">vs</div>
                          <div className={`text-sm ${p2Won ? 'text-[#34D399]' : 'text-[#E6EDF7]'}`}>{match.player2_name}{p2Won && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">win</span>}</div>
                        </td>
                        <td className={`${td} text-center`}>
                          <div className="font-display text-xl leading-none tabular-nums text-[#E6EDF7]">{match.player1_rounds_won}–{match.player2_rounds_won}</div>
                          <div className="mt-1 text-[11px] text-[#8B98B0]">{match.total_rounds} round{match.total_rounds === 1 ? '' : 's'}</div>
                        </td>
                        <td className={`${td} text-center tabular-nums text-[#8B98B0]`}>{match.formatted_duration || '—'}</td>
                        <td className={`${td} text-center`}>{statCell(s?.player1_accuracy, s?.player1_shots_hit, s?.player1_shots_fired, s?.player1_double_hits, s?.player1_triple_hits)}</td>
                        <td className={`${td} text-center`}>{statCell(s?.player2_accuracy, s?.player2_shots_hit, s?.player2_shots_fired, s?.player2_double_hits, s?.player2_triple_hits)}</td>
                        <td className={td}>
                          {match.rounds_data && match.rounds_data.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {match.rounds_data.map((round: any, index: number) => {
                                const p1 = round.winner_name === match.player1_name;
                                return (
                                  <span
                                    key={index}
                                    className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${p1 ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}
                                    title={`Round ${round.round_number}: ${round.winner_name} at ${round.winner_hp} HP`}
                                  >
                                    R{round.round_number} {p1 ? 'P1' : 'P2'} <span className="opacity-70">{round.winner_hp}hp</span>
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#8B98B0]/60">No round detail</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </StaffShell>
  );
}
