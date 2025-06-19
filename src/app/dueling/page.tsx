'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Player {
  id: string;
  in_game_alias: string;
  email: string;
}

interface BracketSlot {
  id: string;
  player?: Player;
  roundNumber: number;
  matchNumber: number;
  position: 'top' | 'bottom';
}

interface TournamentMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;
  bracket: 'winners' | 'losers' | 'grand_finals';
  player1?: Player;
  player2?: Player;
  winner?: Player;
  loser?: Player;
  status: 'pending' | 'in_progress' | 'completed';
}

interface Tournament {
  id: string;
  name: string;
  winnersMatches: TournamentMatch[];
  losersMatches: TournamentMatch[];
  grandFinalsMatches: TournamentMatch[];
  status: 'registration' | 'in_progress' | 'completed';
  winner?: Player;
  runner_up?: Player;
}

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
  { value: 'overall', label: 'Overall Rankings' },
  { value: 'all', label: 'All Types' },
  { value: 'unranked', label: 'Unranked' },
  { value: 'ranked_bo3', label: 'Ranked Bo3' },
  { value: 'ranked_bo5', label: 'Ranked Bo5' }
];

export default function DuelingPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [winnersCollapsed, setWinnersCollapsed] = useState(false);
  const [losersCollapsed, setLosersCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'matches'>('matches');
  const [duelingPlayers, setDuelingPlayers] = useState<DuelingPlayer[]>([]);
  const [duelingMatches, setDuelingMatches] = useState<DuelingMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [matchType, setMatchType] = useState('overall');
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

  useEffect(() => {
    fetchPlayers();
    checkAdminStatus();
    fetchRecentMatches(); // Fetch matches on component load
  }, [user]);

  useEffect(() => {
    if (players.length >= 16 && !tournament) {
      initializeTournament();
    }
  }, [players]);

  const checkAdminStatus = async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        setIsAdmin(data?.is_admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    }
  };

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email')
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null)
        .neq('in_game_alias', '')
        .order('in_game_alias')
        .limit(16);

      if (error) throw error;
      setPlayers(data || []);
    } catch (error: any) {
      console.error('Error fetching players:', error);
      toast.error('Failed to fetch players');
    } finally {
      setLoading(false);
    }
  };

  const initializeTournament = () => {
    if (players.length < 16) return;

    // Shuffle players for random seeding
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5).slice(0, 16);
    
    // Create Winners Bracket matches
    const winnersMatches: TournamentMatch[] = [];
    
    // Winners Round 1 - 8 matches with 16 players
    for (let i = 0; i < 8; i++) {
      winnersMatches.push({
        id: `wr1-m${i + 1}`,
        roundNumber: 1,
        matchNumber: i + 1,
        bracket: 'winners',
        player1: shuffledPlayers[i * 2],
        player2: shuffledPlayers[i * 2 + 1],
        status: 'pending'
      });
    }

    // Winners Round 2 - 4 matches (Quarterfinals)
    for (let i = 0; i < 4; i++) {
      winnersMatches.push({
        id: `wr2-m${i + 1}`,
        roundNumber: 2,
        matchNumber: i + 1,
        bracket: 'winners',
        status: 'pending'
      });
    }

    // Winners Round 3 - 2 matches (Semifinals)
    for (let i = 0; i < 2; i++) {
      winnersMatches.push({
        id: `wr3-m${i + 1}`,
        roundNumber: 3,
        matchNumber: i + 1,
        bracket: 'winners',
        status: 'pending'
      });
    }

    // Winners Round 4 - 1 match (Winners Finals)
    winnersMatches.push({
      id: 'wr4-m1',
      roundNumber: 4,
      matchNumber: 1,
      bracket: 'winners',
      status: 'pending'
    });

    // Create Losers Bracket matches
    const losersMatches: TournamentMatch[] = [];
    
    // Losers Round 1 - 8 losers from Winners Round 1
    for (let i = 0; i < 4; i++) {
      losersMatches.push({
        id: `lr1-m${i + 1}`,
        roundNumber: 1,
        matchNumber: i + 1,
        bracket: 'losers',
        status: 'pending'
      });
    }

    // Losers Round 2 - 4 winners from LR1 vs 4 losers from Winners Quarterfinals
    for (let i = 0; i < 4; i++) {
      losersMatches.push({
        id: `lr2-m${i + 1}`,
        roundNumber: 2,
        matchNumber: i + 1,
        bracket: 'losers',
        status: 'pending'
      });
    }

    // Losers Round 3 - 2 matches
    for (let i = 0; i < 2; i++) {
      losersMatches.push({
        id: `lr3-m${i + 1}`,
        roundNumber: 3,
        matchNumber: i + 1,
        bracket: 'losers',
        status: 'pending'
      });
    }

    // Losers Round 4 - 1 match (vs loser from Winners Semifinals)
    losersMatches.push({
      id: 'lr4-m1',
      roundNumber: 4,
      matchNumber: 1,
      bracket: 'losers',
      status: 'pending'
    });

    // Losers Round 5 - 1 match (vs loser from Winners Finals)
    losersMatches.push({
      id: 'lr5-m1',
      roundNumber: 5,
      matchNumber: 1,
      bracket: 'losers',
      status: 'pending'
    });

    // Grand Finals
    const grandFinalsMatches: TournamentMatch[] = [
      {
        id: 'gf-m1',
        roundNumber: 1,
        matchNumber: 1,
        bracket: 'grand_finals',
        status: 'pending'
      }
    ];

    const newTournament: Tournament = {
      id: `tournament-${Date.now()}`,
      name: `Double Elimination Tournament ${new Date().toLocaleDateString()}`,
      winnersMatches,
      losersMatches,
      grandFinalsMatches,
      status: 'registration'
    };

    setTournament(newTournament);
  };

  const simulateMatch = (player1: Player, player2: Player): Player => {
    // Random winner with slight bias for alphabetically first player
    const bias = Math.random() * 0.1;
    const random = Math.random() + (player1.in_game_alias < player2.in_game_alias ? bias : -bias);
    return random > 0.5 ? player1 : player2;
  };

  const advanceWinner = (match: TournamentMatch, winner: Player, loser: Player) => {
    if (!tournament) return;

    // Update the match with winner and loser
    match.winner = winner;
    match.loser = loser;
    match.status = 'completed';

    if (match.bracket === 'winners') {
      advanceWinnersMatch(match, winner, loser);
    } else if (match.bracket === 'losers') {
      advanceLosersMatch(match, winner);
    }

    // Update tournament state
    setTournament(prev => ({
      ...prev!,
      winnersMatches: [...tournament.winnersMatches],
      losersMatches: [...tournament.losersMatches],
      grandFinalsMatches: [...tournament.grandFinalsMatches]
    }));
  };

  const advanceWinnersMatch = (match: TournamentMatch, winner: Player, loser: Player) => {
    // Advance winner in winners bracket
    if (match.roundNumber < 4) {
      const nextRoundNumber = match.roundNumber + 1;
      const nextMatchNumber = Math.ceil(match.matchNumber / 2);
      const nextMatch = tournament!.winnersMatches.find(m => 
        m.roundNumber === nextRoundNumber && m.matchNumber === nextMatchNumber
      );

      if (nextMatch) {
        const isTopSlot = (match.matchNumber % 2) === 1;
        if (isTopSlot) {
          nextMatch.player1 = winner;
        } else {
          nextMatch.player2 = winner;
        }
        if (nextMatch.player1 && nextMatch.player2) {
          nextMatch.status = 'pending';
        }
      }
    } else if (match.roundNumber === 4) {
      // Winners Finals - advance to Grand Finals
      const grandFinals = tournament!.grandFinalsMatches[0];
      grandFinals.player1 = winner; // Winners bracket champion gets player1 slot
    }

    // Drop loser to losers bracket
    dropToLosers(match, loser);
  };

  const advanceLosersMatch = (match: TournamentMatch, winner: Player) => {
    if (match.roundNumber < 5) {
      const nextRoundNumber = match.roundNumber + 1;
      const nextMatch = tournament!.losersMatches.find(m => 
        m.roundNumber === nextRoundNumber
      );

      if (nextMatch) {
        if (!nextMatch.player1) {
          nextMatch.player1 = winner;
        } else {
          nextMatch.player2 = winner;
        }
        if (nextMatch.player1 && nextMatch.player2) {
          nextMatch.status = 'pending';
        }
      }
    } else if (match.roundNumber === 5) {
      // Losers Finals - advance to Grand Finals
      const grandFinals = tournament!.grandFinalsMatches[0];
      grandFinals.player2 = winner; // Losers bracket champion gets player2 slot
      if (grandFinals.player1 && grandFinals.player2) {
        grandFinals.status = 'pending';
      }
    }
  };

  const dropToLosers = (winnersMatch: TournamentMatch, loser: Player) => {
    if (winnersMatch.roundNumber === 1) {
      // Round 1 losers go to Losers Round 1
      const losersRound1Matches = tournament!.losersMatches.filter(m => m.roundNumber === 1);
      const matchIndex = Math.floor((winnersMatch.matchNumber - 1) / 2);
      const losersMatch = losersRound1Matches[matchIndex];
      
      if (!losersMatch.player1) {
        losersMatch.player1 = loser;
      } else {
        losersMatch.player2 = loser;
      }
      if (losersMatch.player1 && losersMatch.player2) {
        losersMatch.status = 'pending';
      }
    } else if (winnersMatch.roundNumber === 2) {
      // Quarterfinals losers go to Losers Round 2
      const losersMatch = tournament!.losersMatches.find(m => 
        m.roundNumber === 2 && m.matchNumber === winnersMatch.matchNumber
      );
      if (losersMatch) {
        losersMatch.player2 = loser; // They face LR1 winners
        if (losersMatch.player1 && losersMatch.player2) {
          losersMatch.status = 'pending';
        }
      }
    } else if (winnersMatch.roundNumber === 3) {
      // Semifinals loser goes to Losers Round 4
      const losersMatch = tournament!.losersMatches.find(m => m.roundNumber === 4);
      if (losersMatch) {
        losersMatch.player2 = loser;
        if (losersMatch.player1 && losersMatch.player2) {
          losersMatch.status = 'pending';
        }
      }
    } else if (winnersMatch.roundNumber === 4) {
      // Winners Finals loser goes to Losers Round 5
      const losersMatch = tournament!.losersMatches.find(m => m.roundNumber === 5);
      if (losersMatch) {
        losersMatch.player2 = loser;
        if (losersMatch.player1 && losersMatch.player2) {
          losersMatch.status = 'pending';
        }
      }
    }
  };

    const simulateTournament = async () => {
    if (!tournament || !isAdmin) {
      toast.error('Admin access required for tournament simulation');
      return;
    }

    setIsSimulating(true);
    setTournament(prev => ({ ...prev!, status: 'in_progress' }));

    // Simulate in order: Winners, then Losers as they become available, then Grand Finals
    const allMatches = [
      ...tournament.winnersMatches,
      ...tournament.losersMatches,
      ...tournament.grandFinalsMatches
    ];

    // Keep track of which matches are ready
    const isMatchReady = (match: TournamentMatch) => {
      return match.player1 && match.player2 && match.status === 'pending';
    };

    // Simulate until all matches are complete
    while (allMatches.some(m => m.status !== 'completed')) {
      const readyMatches = allMatches.filter(isMatchReady);
      
      if (readyMatches.length === 0) break; // No more ready matches

      for (const match of readyMatches) {
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const winner = simulateMatch(match.player1!, match.player2!);
        const loser = winner === match.player1 ? match.player2! : match.player1!;
        
        // Advance winner and update bracket
        advanceWinner(match, winner, loser);
        
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    // Find final results
    const grandFinals = tournament.grandFinalsMatches[0];
    setTournament(prev => ({
      ...prev!,
      status: 'completed',
      winner: grandFinals?.winner,
      runner_up: grandFinals?.loser
    }));

    setIsSimulating(false);
    toast.success(`Tournament completed! Winner: ${grandFinals?.winner?.in_game_alias}`);
  };

  const resetTournament = () => {
    setTournament(null);
    fetchPlayers();
  };

  const getRoundName = (roundNumber: number) => {
    switch (roundNumber) {
      case 1: return 'Round 1';
      case 2: return 'Quarterfinals';
      case 3: return 'Semifinals';
      case 4: return 'Finals';
      default: return `Round ${roundNumber}`;
    }
  };

  // Double Elimination Bracket Component
  const DoubleEliminationBracket = ({ tournament }: { tournament: Tournament }) => {
    // Match box dimensions for calculation consistency
    const MATCH_BOX = {
      width: 192, // 48 * 4 = 192px
      height: 80, // 20 * 4 = 80px
      largeWidth: 256, // 64 * 4 = 256px
      largeHeight: 96 // 24 * 4 = 96px
    };

    const MatchBox = ({ match, size = 'normal' }: { match: TournamentMatch, size?: 'normal' | 'large' }) => (
      <div className={`bg-gray-800/70 border rounded p-1 shadow-lg ${
        size === 'large' ? 'w-32 h-14' : 'w-24 h-10'
      } ${match.status === 'completed' ? 'border-green-500/60 shadow-green-500/20' : 'border-gray-600'} flex flex-col justify-center`}>
        <div className={`px-1 py-0.5 rounded mb-0.5 text-xs ${
          match.winner?.id === match.player1?.id ? 'bg-green-600/40 font-bold text-green-100 border border-green-500/50' : 'bg-gray-700/60'
        }`}>
          <div className="truncate text-xs leading-tight">
            {match.player1?.in_game_alias || 'TBD'}
            {match.winner?.id === match.player1?.id && ' 👑'}
          </div>
        </div>
        <div className={`px-1 py-0.5 rounded text-xs ${
          match.winner?.id === match.player2?.id ? 'bg-green-600/40 font-bold text-green-100 border border-green-500/50' : 'bg-gray-700/60'
        }`}>
          <div className="truncate text-xs leading-tight">
            {match.player2?.in_game_alias || 'TBD'}
            {match.winner?.id === match.player2?.id && ' 👑'}
          </div>
        </div>
      </div>
    );

    const WinnersBracket = () => {
      const round1Matches = tournament.winnersMatches.filter(m => m.roundNumber === 1);
      const round2Matches = tournament.winnersMatches.filter(m => m.roundNumber === 2);
      const round3Matches = tournament.winnersMatches.filter(m => m.roundNumber === 3);
      const round4Matches = tournament.winnersMatches.filter(m => m.roundNumber === 4);

      // Compact spacing - half scale
      const ROUND_SPACING = 160; // Horizontal spacing between rounds
      const HEADER_HEIGHT = 30; // Height of round headers
      const MATCH_HEIGHT = 60; // Match box height + margin (compact)
      const MATCH_BOX_WIDTH = 96; // Match box width (w-24 = 96px)
      const MATCH_BOX_HEIGHT = 48; // Actual match box height for center calculation (h-12 = 48px)
      
      return (
        <div className="mb-8">
          <div className="flex items-center justify-center mb-6">
            <h3 className="text-2xl font-bold text-cyan-400">🏆 Winners Bracket</h3>
            <button
              onClick={() => setWinnersCollapsed(!winnersCollapsed)}
              className="ml-4 px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded text-sm transition-colors"
            >
              {winnersCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
          </div>
          
          {!winnersCollapsed && (
            <div className="relative" style={{ height: '550px' }}>
            {/* Round 1 - 8 matches */}
            {round1Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + idx * MATCH_HEIGHT) + 'px',
                left: '0px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            <div className="absolute text-xs font-bold text-cyan-400 text-center w-24 bg-cyan-500/10 py-1 rounded" 
                 style={{ left: '0px', top: '0px' }}>
              Round 1
            </div>

            {/* Round 2 - 4 matches (Quarterfinals) */}
            {round2Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT/2 + idx * MATCH_HEIGHT * 2) + 'px',
                left: ROUND_SPACING + 'px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            <div className="absolute text-xs font-bold text-cyan-400 text-center w-24 bg-cyan-500/10 py-1 rounded" 
                 style={{ left: ROUND_SPACING + 'px', top: '0px' }}>
              Quarterfinals
            </div>

            {/* Round 3 - 2 matches (Semifinals) */}
            {round3Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + idx * MATCH_HEIGHT * 4) + 'px',
                left: (ROUND_SPACING * 2) + 'px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            <div className="absolute text-xs font-bold text-cyan-400 text-center w-24 bg-cyan-500/10 py-1 rounded" 
                 style={{ left: (ROUND_SPACING * 2) + 'px', top: '0px' }}>
              Semifinals
            </div>

            {/* Round 4 - 1 match (Winners Finals) */}
            {round4Matches.map((match) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT * 3.5) + 'px',
                left: (ROUND_SPACING * 3) + 'px' 
              }}>
                <MatchBox match={match} size="large" />
              </div>
            ))}
            <div className="absolute text-xs font-bold text-cyan-400 text-center w-32 bg-cyan-500/10 py-1 rounded" 
                 style={{ left: (ROUND_SPACING * 3) + 'px', top: '0px' }}>
              Winners Finals
            </div>

            {/* Connection Lines for Winners Bracket - Fixed Drawing */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
                </marker>
              </defs>
              
              {/* Round 1 to Quarterfinals - Perfect Center Alignment */}
              {round1Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + idx * MATCH_HEIGHT + (MATCH_BOX_HEIGHT / 2) + 2; // Perfect center with offset
                const targetMatchIdx = Math.floor(idx / 2);
                const endY = HEADER_HEIGHT + MATCH_HEIGHT/2 + targetMatchIdx * MATCH_HEIGHT * 2 + (MATCH_BOX_HEIGHT / 2) + 2;
                const startX = MATCH_BOX_WIDTH + 5; // Small offset from box edge
                const endX = ROUND_SPACING - 5; // Small offset to box edge
                const midX = startX + (endX - startX) / 2;
                
                                  return (
                  <g key={`r1-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}

              {/* Quarterfinals to Semifinals - Perfect Center Alignment */}
              {round2Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + MATCH_HEIGHT/2 + idx * MATCH_HEIGHT * 2 + (MATCH_BOX_HEIGHT / 2) + 2;
                const targetMatchIdx = Math.floor(idx / 2);
                const endY = HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + targetMatchIdx * MATCH_HEIGHT * 4 + (MATCH_BOX_HEIGHT / 2) + 2;
                const startX = ROUND_SPACING + MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING * 2 - 5;
                const midX = startX + (endX - startX) / 2;
                
                                  return (
                  <g key={`r2-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}

                            {/* Semifinals to Finals - Perfect Center Alignment */}
              {round3Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + idx * MATCH_HEIGHT * 4 + (MATCH_BOX_HEIGHT / 2) + 2;
                const endY = HEADER_HEIGHT + MATCH_HEIGHT * 3.5 + (MATCH_BOX_HEIGHT / 2) + 2; // Center of finals
                const startX = ROUND_SPACING * 2 + MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING * 3 - 5;
                const midX = startX + (endX - startX) / 2;
                
                return (
                  <g key={`r3-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#38bdf8" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}


            </svg>
          </div>
          )}
        </div>
      );
    };

    const LosersBracket = () => {
      const round1Matches = tournament.losersMatches.filter(m => m.roundNumber === 1);
      const round2Matches = tournament.losersMatches.filter(m => m.roundNumber === 2);
      const round3Matches = tournament.losersMatches.filter(m => m.roundNumber === 3);
      const round4Matches = tournament.losersMatches.filter(m => m.roundNumber === 4);
      const round5Matches = tournament.losersMatches.filter(m => m.roundNumber === 5);

      // Compact spacing - half scale
      const ROUND_SPACING = 160;
      const HEADER_HEIGHT = 30;
      const MATCH_HEIGHT = 65; // Compact spacing for losers bracket
      const MATCH_BOX_WIDTH = 96; // Match box width (w-24 = 96px)
      const MATCH_BOX_HEIGHT = 48; // Actual match box height for center calculation (h-12 = 48px)

      return (
        <div className="mb-8 border-t-2 border-red-500/30 pt-6">
          <div className="flex items-center justify-center mb-6">
            <h3 className="text-2xl font-bold text-red-400">💀 Losers Bracket</h3>
            <button
              onClick={() => setLosersCollapsed(!losersCollapsed)}
              className="ml-4 px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-colors"
            >
              {losersCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
          </div>
          
          {!losersCollapsed && (
            <div className="relative" style={{ height: '325px' }}>
            {/* LR1 - 4 matches */}
            {round1Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + idx * MATCH_HEIGHT) + 'px',
                left: '0px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            {round1Matches.length > 0 && (
              <div className="absolute text-xs font-bold text-red-400 text-center w-24 bg-red-500/10 py-1 rounded" 
                   style={{ left: '0px', top: '0px' }}>
                LR1
              </div>
            )}

            {/* LR2 - 4 matches */}
            {round2Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + idx * MATCH_HEIGHT) + 'px',
                left: ROUND_SPACING + 'px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            {round2Matches.length > 0 && (
              <div className="absolute text-xs font-bold text-red-400 text-center w-24 bg-red-500/10 py-1 rounded" 
                   style={{ left: ROUND_SPACING + 'px', top: '0px' }}>
                LR2
              </div>
            )}

            {/* LR3 - 2 matches */}
            {round3Matches.map((match, idx) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT/2 + idx * MATCH_HEIGHT * 2) + 'px',
                left: (ROUND_SPACING * 2) + 'px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            {round3Matches.length > 0 && (
              <div className="absolute text-xs font-bold text-red-400 text-center w-24 bg-red-500/10 py-1 rounded" 
                   style={{ left: (ROUND_SPACING * 2) + 'px', top: '0px' }}>
                LR3
              </div>
            )}

            {/* LR4 - 1 match */}
            {round4Matches.map((match) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT * 1.5) + 'px',
                left: (ROUND_SPACING * 3) + 'px' 
              }}>
                <MatchBox match={match} />
              </div>
            ))}
            {round4Matches.length > 0 && (
              <div className="absolute text-xs font-bold text-red-400 text-center w-24 bg-red-500/10 py-1 rounded" 
                   style={{ left: (ROUND_SPACING * 3) + 'px', top: '0px' }}>
                LR4
              </div>
            )}

            {/* LR5 - Losers Finals */}
            {round5Matches.map((match) => (
              <div key={match.id} className="absolute" style={{ 
                top: (HEADER_HEIGHT + MATCH_HEIGHT * 1.5) + 'px',
                left: (ROUND_SPACING * 4) + 'px' 
              }}>
                <MatchBox match={match} size="large" />
              </div>
            ))}
            {round5Matches.length > 0 && (
              <div className="absolute text-xs font-bold text-red-400 text-center w-32 bg-red-500/10 py-1 rounded" 
                   style={{ left: (ROUND_SPACING * 4) + 'px', top: '0px' }}>
                Losers Finals
              </div>
            )}

            {/* Connection Lines for Losers Bracket - Fixed Drawing */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              <defs>
                <marker id="losers-arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                </marker>
              </defs>
              
              {/* LR1 to LR2 - Perfect Center Alignment */}
              {round1Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + idx * MATCH_HEIGHT + (MATCH_BOX_HEIGHT / 2) + 2; // Perfect center with offset
                const targetMatchIdx = Math.floor(idx / 2);
                const endY = HEADER_HEIGHT + (targetMatchIdx + 2) * MATCH_HEIGHT + (MATCH_BOX_HEIGHT / 2) + 2;
                const startX = MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING - 5;
                const midX = startX + (endX - startX) / 2;
                
                                  return (
                  <g key={`lr1-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}

              {/* LR2 to LR3 - Perfect Center Alignment */}
              {round2Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + idx * MATCH_HEIGHT + (MATCH_BOX_HEIGHT / 2) + 2;
                const targetMatchIdx = Math.floor(idx / 2);
                const endY = HEADER_HEIGHT + MATCH_HEIGHT/2 + targetMatchIdx * MATCH_HEIGHT * 2 + (MATCH_BOX_HEIGHT / 2) + 2;
                const startX = ROUND_SPACING + MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING * 2 - 5;
                const midX = startX + (endX - startX) / 2;
                
                                  return (
                  <g key={`lr2-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}

              {/* LR3 to LR4 - Perfect Center Alignment */}
              {round3Matches.map((match, idx) => {
                const startY = HEADER_HEIGHT + MATCH_HEIGHT/2 + idx * MATCH_HEIGHT * 2 + (MATCH_BOX_HEIGHT / 2) + 2;
                const endY = HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + (MATCH_BOX_HEIGHT / 2) + 2;
                const startX = ROUND_SPACING * 2 + MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING * 3 - 5;
                const midX = startX + (endX - startX) / 2;
                
                                  return (
                  <g key={`lr3-${idx}`}>
                    <line x1={startX} y1={startY} x2={midX} y2={startY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={startY} x2={midX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                    <line x1={midX} y1={endY} x2={endX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}

                            {/* LR4 to LR5 (Losers Finals) - Perfect Center Alignment */}
              {round4Matches.map((match) => {
                const startY = HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + (MATCH_BOX_HEIGHT / 2);
                const endY = HEADER_HEIGHT + MATCH_HEIGHT * 1.5 + (MATCH_BOX_HEIGHT / 2); // Center of finals
                const startX = ROUND_SPACING * 3 + MATCH_BOX_WIDTH + 5;
                const endX = ROUND_SPACING * 4 - 5;
                
                return (
                  <g key="lr4-lr5">
                    <line x1={startX} y1={startY} x2={endX} y2={endY} 
                          stroke="#ef4444" strokeWidth="3" opacity="0.8"/>
                  </g>
                );
              })}


            </svg>
          </div>
          )}
        </div>
      );
    };

    const GrandFinals = () => {
      const match = tournament.grandFinalsMatches[0];
      if (!match) return null;

      return (
        <div className="relative">
          <h3 className="text-lg font-bold text-yellow-400 text-center mb-3">🏆 Grand Finals</h3>
          <div className={`bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-2 rounded-lg p-3 w-36 ${
            match.status === 'completed' ? 'border-yellow-500/80' : 'border-yellow-600/60'
          } shadow-xl`}>
            <div className="text-center text-xs text-yellow-400 mb-2 font-bold">
              Championship
            </div>
            <div className={`p-1 rounded mb-1 text-center ${
              match.winner?.id === match.player1?.id ? 'bg-green-600/40 font-bold border border-green-500/50' : 'bg-gray-700/60'
            }`}>
              <div className="text-cyan-300 text-xs">Winners</div>
              <div className="text-white text-xs truncate">
                {match.player1?.in_game_alias || 'TBD'}
                {match.winner?.id === match.player1?.id && ' 👑'}
              </div>
            </div>
            <div className="text-center text-yellow-400 font-bold text-xs mb-1">VS</div>
            <div className={`p-1 rounded mb-2 text-center ${
              match.winner?.id === match.player2?.id ? 'bg-green-600/40 font-bold border border-green-500/50' : 'bg-gray-700/60'
            }`}>
              <div className="text-red-300 text-xs">Losers</div>
              <div className="text-white text-xs truncate">
                {match.player2?.in_game_alias || 'TBD'}
                {match.winner?.id === match.player2?.id && ' 👑'}
              </div>
            </div>
            <div className="text-center">
              {match.status === 'completed' ? (
                <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 p-1 rounded border border-yellow-500/50">
                  <div className="text-yellow-400 font-bold text-xs">🏆 Champion!</div>
                  <div className="text-yellow-300 text-xs truncate">{match.winner?.in_game_alias}</div>
                </div>
              ) : match.player1 && match.player2 ? (
                <span className="text-blue-400 font-bold text-xs">🔄 Ready!</span>
              ) : (
                <span className="text-gray-400 text-xs">⏳ Waiting</span>
              )}
            </div>
          </div>
        </div>
      );
    };

          return (
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 p-4 rounded-2xl border border-gray-700/50 w-full overflow-x-auto">
        <div className="min-w-max" style={{ width: '900px' }}>
          <div className="relative">
            <div className="space-y-10">
              <WinnersBracket />
              <LosersBracket />
            </div>
            {/* Grand Finals positioned to the right */}
            <div className="absolute" style={{ 
              top: '300px', 
              right: '25px',
              zIndex: 10 
            }}>
              <GrandFinals />
            </div>
            

          </div>
        </div>
      </div>
    );
  };

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
    fetchLeaderboard(0);
  }, [matchType, sortBy, sortOrder, playerName]);

  useEffect(() => {
    if (activeTab === 'matches') {
      fetchRecentMatches(0);
    }
  }, [activeTab, matchType, playerName]);

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
    
    // Handle date sorting
    if (matchSortBy === 'completed_at') {
      aValue = new Date(a.completed_at).getTime();
      bValue = new Date(b.completed_at).getTime();
    }
    
    // Handle numeric sorting
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return matchSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    // Handle string sorting
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return matchSortOrder === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return 0;
  });

  const getEloTier = (elo: number) => {
    if (elo >= 2400) return { name: 'Legend', color: 'text-yellow-400' };
    if (elo >= 2200) return { name: 'Grandmaster', color: 'text-purple-400' };
    if (elo >= 2000) return { name: 'Master', color: 'text-red-400' };
    if (elo >= 1800) return { name: 'Diamond', color: 'text-cyan-400' };
    if (elo >= 1600) return { name: 'Platinum', color: 'text-gray-300' };
    if (elo >= 1400) return { name: 'Gold', color: 'text-yellow-600' };
    if (elo >= 1200) return { name: 'Silver', color: 'text-gray-400' };
    if (elo >= 1000) return { name: 'Bronze', color: 'text-orange-600' };
    return { name: 'Unranked', color: 'text-gray-500' };
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading && players.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-xl">Loading dueling statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Dueling Arena
          </h1>
          <p className="text-xl text-blue-200">Compete in 1v1 battles and climb the rankings</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex mb-6">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-6 py-3 rounded-l-lg font-medium transition-colors ${
              activeTab === 'leaderboard'
                ? 'bg-cyan-600 text-white'
                : 'bg-white/10 text-blue-200 hover:bg-white/20'
            }`}
          >
            Leaderboard
          </button>
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-6 py-3 rounded-r-lg font-medium transition-colors ${
              activeTab === 'matches'
                ? 'bg-cyan-600 text-white'
                : 'bg-white/10 text-blue-200 hover:bg-white/20'
            }`}
          >
            Recent Matches
          </button>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-8 border border-white/20"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Match Type Filter */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Match Type</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              >
                {MATCH_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value} className="bg-gray-800">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort By Filter */}
            {activeTab === 'leaderboard' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-gray-800">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="desc" className="bg-gray-800">Highest First</option>
                    <option value="asc" className="bg-gray-800">Lowest First</option>
                  </select>
                </div>
              </>
            )}

            {/* Player Search */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Search Player</label>
              <div className="flex">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Player name..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-l-lg px-3 py-2 text-white placeholder-blue-300"
                />
                <button
                  onClick={handleSearch}
                  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-r-lg transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {activeTab === 'leaderboard' ? (
          /* Leaderboard Table */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20"
          >
            {error ? (
              <div className="p-8 text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button 
                  onClick={() => fetchLeaderboard(0)}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Rank</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Player</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Type</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Matches</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Win Rate</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">K/D</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">Accuracy</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-blue-200">ELO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duelingPlayers.map((player, index) => {
                      const tier = getEloTier(player.current_elo);
                      return (
                        <tr key={`${player.player_name}-${player.match_type}`} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-6 py-4">
                            <span className="text-lg font-bold text-cyan-400">#{player.rank}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{player.player_name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-blue-600/50 rounded text-xs">
                              {player.match_type.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{player.total_matches}</div>
                            <div className="text-xs text-blue-300">{player.matches_won}W-{player.matches_lost}L</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-lg font-bold text-green-400">
                              {formatPercentage(player.win_rate)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{player.kill_death_ratio.toFixed(2)}</div>
                            <div className="text-xs text-blue-300">{player.total_kills}K-{player.total_deaths}D</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{formatPercentage(player.overall_accuracy)}</div>
                          </td>
                          <td className="px-6 py-4">
                            {player.match_type.startsWith('ranked') || player.match_type === 'overall' ? (
                              <div>
                                <div className={`font-bold ${tier.color}`}>{player.current_elo}</div>
                                <div className="text-xs text-blue-300">Peak: {player.peak_elo}</div>
                                <div className={`text-xs ${tier.color}`}>{tier.name}</div>
                              </div>
                            ) : (
                              <span className="text-gray-500">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ) : (
          /* Recent Matches - Compact Table Format */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20"
          >
            {matchesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                <p>Loading recent matches...</p>
              </div>
            ) : duelingMatches.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-blue-200">No matches found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-blue-200 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('completed_at')}
                      >
                        Date {matchSortBy === 'completed_at' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-blue-200 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('match_type')}
                      >
                        Type {matchSortBy === 'match_type' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-blue-200 uppercase">Players</th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-blue-200 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('total_rounds')}
                      >
                        Score {matchSortBy === 'total_rounds' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-blue-200 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('duration_seconds')}
                      >
                        Duration {matchSortBy === 'duration_seconds' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-blue-200 uppercase">Player 1 Stats</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-blue-200 uppercase">Player 2 Stats</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-blue-200 uppercase">Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMatches.map((match) => (
                      <tr key={match.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-blue-300">
                          {new Date(match.completed_at).toLocaleDateString()}
                          <div className="text-xs text-blue-400">
                            {new Date(match.completed_at).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-blue-600/50 rounded text-xs">
                            {match.match_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className={`text-sm font-medium ${match.winner_name === match.player1_name ? 'text-green-400' : 'text-red-400'}`}>
                              {match.player1_name} {match.winner_name === match.player1_name ? '👑' : ''}
                            </div>
                            <div className="text-xs text-blue-300">vs</div>
                            <div className={`text-sm font-medium ${match.winner_name === match.player2_name ? 'text-green-400' : 'text-red-400'}`}>
                              {match.player2_name} {match.winner_name === match.player2_name ? '👑' : ''}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-lg font-bold text-white">
                            {match.player1_rounds_won} - {match.player2_rounds_won}
                          </div>
                          <div className="text-xs text-blue-300">
                            {match.total_rounds} rounds
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-blue-300">
                          {match.formatted_duration}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs space-y-1">
                            {match.match_stats?.player1_accuracy !== undefined && (
                              <div className="text-green-400">
                                {(match.match_stats.player1_accuracy * 100).toFixed(1)}% acc
                              </div>
                            )}
                            {match.match_stats?.player1_shots_fired !== undefined && (
                              <div className="text-blue-300">
                                {match.match_stats.player1_shots_hit || 0}/{match.match_stats.player1_shots_fired || 0}
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player1_double_hits || 0) > 0 && (
                              <div className="text-yellow-400">
                                {match.match_stats.player1_double_hits}x2
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player1_triple_hits || 0) > 0 && (
                              <div className="text-red-400">
                                {match.match_stats.player1_triple_hits}x3
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs space-y-1">
                            {match.match_stats?.player2_accuracy !== undefined && (
                              <div className="text-green-400">
                                {(match.match_stats.player2_accuracy * 100).toFixed(1)}% acc
                              </div>
                            )}
                            {match.match_stats?.player2_shots_fired !== undefined && (
                              <div className="text-blue-300">
                                {match.match_stats.player2_shots_hit || 0}/{match.match_stats.player2_shots_fired || 0}
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player2_double_hits || 0) > 0 && (
                              <div className="text-yellow-400">
                                {match.match_stats.player2_double_hits}x2
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player2_triple_hits || 0) > 0 && (
                              <div className="text-red-400">
                                {match.match_stats.player2_triple_hits}x3
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {match.rounds_data && match.rounds_data.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {match.rounds_data.map((round: any, index: number) => (
                                <div key={index} className="bg-white/10 rounded px-1 py-0.5 text-xs">
                                  R{round.round_number}: {round.winner_name === match.player1_name ? 'P1' : 'P2'}
                                  <div className="text-xs text-blue-400">({round.winner_hp}HP)</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">No details</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
} 