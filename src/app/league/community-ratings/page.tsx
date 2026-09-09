'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface PlayerCard {
  player_key: string;
  player_name: string;
  games: number;
  kills: number;
  deaths: number;
  kd: number;
  win_rate: number | null;
  decided_games: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  accuracy: number | null;
  explosives_left_per_death: number | null;
  resources_left_per_death: number | null;
  main_class: string | null;
  rating: number;
  wins: number;
  losses: number;
}

interface Totals {
  rankedPlayers: number;
  totalVotes: number;
  votesToday: number;
  activeVoters: number;
  minGames: number;
}

interface Viewer {
  votes: number;
  votesToday: number;
  dailyLimit: number;
  agreement: number | null;
  rank: number | null;
  rating: number | null;
  playerName: string | null;
}

// Short tags keep the class readable inside a narrow card.
const CLASS_TAGS: Record<string, string> = {
  Infantry: 'INF',
  'Heavy Weapons': 'HVY',
  'Combat Engineer': 'ENG',
  'Squad Leader': 'SL',
  'Field Medic': 'MED',
  Infiltrator: 'INFIL',
  'Jump Trooper': 'JT',
  SciOps: 'SCI',
};

function classTag(name: string | null): string {
  if (!name) return 'N/A';
  return CLASS_TAGS[name] ?? name.slice(0, 5).toUpperCase();
}

function formatCarryTime(seconds: number): string {
  if (!seconds) return '0m';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function CommunityRatingsPage() {
  const { user } = useAuth();

  const [matchup, setMatchup] = useState<{ a: PlayerCard; b: PlayerCard } | null>(null);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, []);

  const loadMatchup = useCallback(
    async (excluded: string[]) => {
      try {
        const headers = await authHeaders();
        const params = excluded.length ? `?exclude=${encodeURIComponent(excluded.join(','))}` : '';
        const res = await fetch(`/api/ctf/ratings/matchup${params}`, { headers });
        const json = await res.json();
        if (json.success) {
          setMatchup(json.matchup);
          setLoadError(null);
        } else {
          // Distinguish "the pool is genuinely thin" from "this never got set up",
          // which otherwise both render as an empty card.
          setLoadError(json.error || 'Could not load a matchup');
        }
      } catch (e: any) {
        setLoadError(e?.message || 'Could not load a matchup');
      }
    },
    [authHeaders],
  );

  const loadBoard = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/ctf/ratings/leaderboard', { headers });
      const json = await res.json();
      if (json.success) {
        setPlayers(json.players || []);
        setTotals(json.totals || null);
        setViewer(json.viewer || null);
      }
    } catch {
      toast.error('Could not load the leaderboard');
    }
  }, [authHeaders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMatchup([]), loadBoard()]);
      setLoading(false);
    })();
  }, [loadMatchup, loadBoard, user]);

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const skip = async () => {
    if (!matchup) return;
    const next = [...seen, pairKey(matchup.a.player_key, matchup.b.player_key)].slice(-40);
    setSeen(next);
    setFlash(null);
    await loadMatchup(next);
  };

  const castVote = async (winner: PlayerCard, loser: PlayerCard) => {
    if (!user) {
      toast.error('Sign in to vote');
      return;
    }
    if (voting) return;

    setVoting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/ctf/ratings/vote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ winnerKey: winner.player_key, loserKey: loser.player_key }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || 'Vote failed');
        return;
      }

      setFlash(`${winner.player_name} +${json.delta}`);
      const next = [...seen, pairKey(winner.player_key, loser.player_key)].slice(-40);
      setSeen(next);
      await Promise.all([loadMatchup(next), loadBoard()]);
    } catch {
      toast.error('Vote failed');
    } finally {
      setVoting(false);
    }
  };

  const votesToday = viewer?.votesToday ?? 0;
  const dailyLimit = viewer?.dailyLimit ?? 50;
  const atLimit = !!user && votesToday >= dailyLimit;

  const filtered = search.trim()
    ? players.filter((p) => p.player_name.toLowerCase().includes(search.trim().toLowerCase()))
    : players;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>⚔️</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              Community Ratings
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Choose the better player in head-to-head voting. Community-driven CTF player rankings.
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <Chip
              label="Today"
              value={user ? `${votesToday}/${dailyLimit} votes` : `${totals?.votesToday ?? 0} votes`}
            />
            <Chip label="Active voters" value={totals?.activeVoters ?? 0} />
            <Chip label="Ranked players" value={totals?.rankedPlayers ?? 0} />
            <Chip label="Total votes" value={totals?.totalVotes ?? 0} />
          </div>

          <Link
            href="/stats"
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-700/60 bg-gray-900/50 px-4 py-3 hover:border-cyan-500/40 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">📊</span>
              <div>
                <div className="font-semibold text-gray-200 text-sm">Explore CTF Stats</div>
                <div className="text-gray-500 text-xs">
                  Per-game breakdowns, class splits, recent games and more
                </div>
              </div>
            </div>
            <span className="text-gray-500 group-hover:text-cyan-400 transition-colors">→</span>
          </Link>
        </div>

        {/* ── Viewer standing ────────────────────────────────────── */}
        {user && viewer && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Tile
              label="Your rank"
              value={viewer.rank ? `#${viewer.rank}` : '—'}
              sub={
                viewer.rank
                  ? `of ${totals?.rankedPlayers ?? 0} · ${viewer.rating} rating`
                  : 'no rated games under your alias'
              }
            />
            <Tile label="Your votes" value={viewer.votes} sub="all-time" />
            <Tile
              label="Agreement"
              value={viewer.agreement === null ? '—' : `${viewer.agreement}%`}
              sub="with community"
            />
          </div>
        )}

        {/* ── The matchup ────────────────────────────────────────── */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-5">
          <h2 className="text-center text-lg font-bold text-gray-200 mb-5">
            Who&apos;s the better player?
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading matchup…</div>
          ) : loadError ? (
            <div className="text-center py-12 space-y-2">
              <div className="text-amber-400/90 text-sm font-semibold">Ratings are not set up yet</div>
              <div className="text-gray-500 text-xs max-w-md mx-auto">
                Run <code className="text-gray-400">supabase-ctf-community-ratings.sql</code> in the
                SQL editor to create the view and tables this page reads.
              </div>
              <div className="text-gray-700 text-[10px] font-mono pt-1">{loadError}</div>
            </div>
          ) : !matchup ? (
            <div className="text-center py-12 text-gray-500">
              Not enough rated players yet — needs two with {totals?.minGames ?? 5}+ recorded games.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <VoteCard
                  player={matchup.a}
                  disabled={voting || atLimit || !user}
                  onClick={() => castVote(matchup.a, matchup.b)}
                />
                <div className="text-center text-gray-600 font-bold text-sm">VS</div>
                <VoteCard
                  player={matchup.b}
                  disabled={voting || atLimit || !user}
                  onClick={() => castVote(matchup.b, matchup.a)}
                />
              </div>

              <div className="flex flex-col items-center gap-2 mt-5">
                {flash && <div className="text-cyan-400 text-sm font-mono">{flash}</div>}
                {!user && (
                  <p className="text-gray-500 text-sm">
                    <Link href="/auth/login" className="text-cyan-400 hover:underline">
                      Sign in
                    </Link>{' '}
                    to cast votes.
                  </p>
                )}
                {atLimit && (
                  <p className="text-amber-400/80 text-sm">
                    Daily limit reached ({dailyLimit} votes). Resets at 00:00 UTC.
                  </p>
                )}
                <button
                  onClick={skip}
                  disabled={voting}
                  className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-400 text-sm hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-50"
                >
                  ⏭ Skip this matchup
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Leaderboard ────────────────────────────────────────── */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700/60 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-gray-200">Rankings</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player…"
              className="bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-right">Rating</th>
                  <th className="px-4 py-2 text-right">W-L</th>
                  <th className="px-4 py-2 text-right">K/D</th>
                  <th className="px-4 py-2 text-right">WR</th>
                  <th className="px-4 py-2 text-right">Games</th>
                  <th className="px-4 py-2 text-right">Caps</th>
                  <th className="px-4 py-2 text-right">CK</th>
                  <th className="px-4 py-2 text-left">Class</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const rank = players.indexOf(p) + 1;
                  return (
                    <tr
                      key={p.player_key}
                      className={`border-t border-gray-700/40 hover:bg-gray-700/20 transition-colors ${
                        i % 2 ? 'bg-gray-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-2 text-gray-500 font-mono">{rank}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/stats/player/${encodeURIComponent(p.player_name)}`}
                          className="text-gray-200 hover:text-cyan-400 transition-colors"
                        >
                          {p.player_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-cyan-400">
                        {Math.round(p.rating)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-500 text-xs">
                        {p.wins}-{p.losses}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-300">{p.kd}</td>
                      <td
                        className="px-4 py-2 text-right font-mono text-gray-400"
                        title={p.win_rate === null ? undefined : `over ${p.decided_games} decided games`}
                      >
                        {p.win_rate === null ? '—' : `${p.win_rate}%`}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">{p.games}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">{p.captures}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">
                        {p.carrier_kills}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {classTag(p.main_class)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">No players found.</div>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center pb-4">
          Ratings start at 1500 and move on each vote. Only players with{' '}
          {totals?.minGames ?? 5}+ recorded games are eligible.
        </p>
      </div>
    </div>
  );
}

/* ── Small presentational pieces ────────────────────────────────── */

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-900/50 px-3 py-1.5 text-xs">
      <span className="text-gray-500">{label}: </span>
      <span className="text-cyan-400 font-bold">{value}</span>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 px-4 py-3">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-gray-100 mt-0.5">{value}</div>
      {sub && <div className="text-gray-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function Stat({
  value,
  label,
  title,
}: {
  value: string | number;
  label: string;
  title?: string;
}) {
  return (
    <div className="text-center" title={title}>
      <div className="font-bold text-gray-100 font-mono">{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function VoteCard({
  player,
  disabled,
  onClick,
}: {
  player: PlayerCard;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left rounded-xl border border-gray-700/60 bg-gray-900/50 p-5 transition-all hover:border-cyan-500/50 hover:bg-gray-900/80 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-700/60"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-gray-700/60 flex items-center justify-center text-xl font-bold text-gray-400">
          {player.player_name.charAt(0).toUpperCase()}
        </div>
        <div className="font-bold text-gray-100 text-center">{player.player_name}</div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
          {classTag(player.main_class)}
        </span>
      </div>

      {/* Core line - the same three USL leads with */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Stat value={player.kd} label="K/D" />
        <Stat
          value={player.win_rate === null ? '—' : `${player.win_rate}%`}
          label="WR"
          title={
            player.win_rate === null
              ? 'No games with a recorded winner'
              : `Over ${player.decided_games} games that recorded a winner`
          }
        />
        <Stat value={player.games} label="Games" />
      </div>

      {/* CTF flag play - what a duel-only rating can't see */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-700/40">
        <Stat value={player.captures} label="Caps" />
        <Stat value={player.carrier_kills} label="CK" />
        <Stat value={formatCarryTime(player.carry_time_seconds)} label="Carry" />
      </div>

      {/* Macro signals, deliberately muted - context, not headline */}
      <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-gray-600">
        {player.accuracy !== null && <span>ACC {(player.accuracy * 100).toFixed(1)}%</span>}
        {player.explosives_left_per_death !== null && (
          <span title="Average explosives left unused at death - lower means more spent before dying">
            EXP LEFT {player.explosives_left_per_death}
          </span>
        )}
      </div>
    </button>
  );
}
