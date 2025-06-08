'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';

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

export default function DuelingPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchPlayers();
    checkAdminStatus();
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
    const MATCH_HEIGHT = 80;
    const SPACING = 20;
    
    const WinnersBracket = () => (
      <div className="flex-1">
        <h3 className="text-xl font-bold text-cyan-400 text-center mb-6">Winners Bracket</h3>
        <div className="flex justify-center space-x-16">
          {[1, 2, 3, 4].map(round => {
            const roundMatches = tournament.winnersMatches.filter(m => m.roundNumber === round);
            const roundName = round === 1 ? 'Round 1' : round === 2 ? 'Quarterfinals' : 
                             round === 3 ? 'Semifinals' : 'Winners Finals';
            
            return (
              <div key={round} className="flex flex-col items-center">
                <div className="text-sm font-bold text-cyan-400 mb-4">{roundName}</div>
                <div className="space-y-6">
                  {roundMatches.map(match => (
                    <div key={match.id} className={`bg-gray-800/70 border rounded-lg p-3 w-40 ${
                      match.status === 'completed' ? 'border-green-500/60' : 'border-gray-600'
                    }`}>
                      <div className={`p-2 rounded mb-1 text-xs ${
                        match.winner?.id === match.player1?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
                      }`}>
                        {match.player1?.in_game_alias || 'TBD'}
                        {match.winner?.id === match.player1?.id && ' 👑'}
                      </div>
                      <div className="text-center text-xs text-gray-500">vs</div>
                      <div className={`p-2 rounded text-xs ${
                        match.winner?.id === match.player2?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
                      }`}>
                        {match.player2?.in_game_alias || 'TBD'}
                        {match.winner?.id === match.player2?.id && ' 👑'}
                      </div>
                      <div className="text-center mt-1 text-xs">
                        {match.status === 'completed' ? '✓' : match.player1 && match.player2 ? '🔄' : '⏳'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    const LosersBracket = () => (
      <div className="flex-1">
        <h3 className="text-xl font-bold text-red-400 text-center mb-6">Losers Bracket</h3>
        <div className="flex justify-center space-x-16">
          {[1, 2, 3, 4, 5].map(round => {
            const roundMatches = tournament.losersMatches.filter(m => m.roundNumber === round);
            if (roundMatches.length === 0) return null;
            
            const roundName = `LR ${round}`;
            
            return (
              <div key={round} className="flex flex-col items-center">
                <div className="text-sm font-bold text-red-400 mb-4">{roundName}</div>
                <div className="space-y-6">
                  {roundMatches.map(match => (
                    <div key={match.id} className={`bg-gray-800/70 border rounded-lg p-3 w-40 ${
                      match.status === 'completed' ? 'border-green-500/60' : 'border-gray-600'
                    }`}>
                      <div className={`p-2 rounded mb-1 text-xs ${
                        match.winner?.id === match.player1?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
                      }`}>
                        {match.player1?.in_game_alias || 'TBD'}
                        {match.winner?.id === match.player1?.id && ' 👑'}
                      </div>
                      <div className="text-center text-xs text-gray-500">vs</div>
                      <div className={`p-2 rounded text-xs ${
                        match.winner?.id === match.player2?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
                      }`}>
                        {match.player2?.in_game_alias || 'TBD'}
                        {match.winner?.id === match.player2?.id && ' 👑'}
                      </div>
                      <div className="text-center mt-1 text-xs">
                        {match.status === 'completed' ? '✓' : match.player1 && match.player2 ? '🔄' : '⏳'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    const GrandFinals = () => {
      const match = tournament.grandFinalsMatches[0];
      if (!match) return null;

      return (
        <div className="mt-8">
          <h3 className="text-2xl font-bold text-yellow-400 text-center mb-6">Grand Finals</h3>
          <div className="flex justify-center">
            <div className={`bg-gray-800/70 border rounded-lg p-4 w-60 ${
              match.status === 'completed' ? 'border-yellow-500/60' : 'border-gray-600'
            }`}>
              <div className="text-center text-sm text-yellow-400 mb-2">Winners vs Losers Champion</div>
              <div className={`p-3 rounded mb-2 ${
                match.winner?.id === match.player1?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
              }`}>
                {match.player1?.in_game_alias || 'Winners Champion'}
                {match.winner?.id === match.player1?.id && ' 👑'}
              </div>
              <div className="text-center text-gray-500 mb-2">vs</div>
              <div className={`p-3 rounded ${
                match.winner?.id === match.player2?.id ? 'bg-green-600/30 font-bold' : 'bg-gray-700/60'
              }`}>
                {match.player2?.in_game_alias || 'Losers Champion'}
                {match.winner?.id === match.player2?.id && ' 👑'}
              </div>
              <div className="text-center mt-3">
                {match.status === 'completed' ? (
                  <span className="text-yellow-400 font-bold">🏆 Tournament Complete!</span>
                ) : match.player1 && match.player2 ? (
                  <span className="text-blue-400">🔄 Ready to Play</span>
                ) : (
                  <span className="text-gray-500">⏳ Waiting for Champions</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="bg-gray-900/80 p-6 rounded-xl overflow-x-auto">
        <div className="space-y-8">
          <div className="flex space-x-8">
            <WinnersBracket />
            <LosersBracket />
          </div>
          <GrandFinals />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="text-white mt-4 text-lg">Loading tournament bracket...</p>
        </div>
      </div>
    );
  }

  if (!tournament && players.length < 16) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚔️</div>
          <h1 className="text-2xl font-bold text-white mb-4">Insufficient Players</h1>
          <p className="text-gray-400 mb-4">Need at least 16 registered players for tournament bracket</p>
          <p className="text-sm text-gray-500">Currently have: {players.length} players</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                  ⚔️ Tournament Bracket
                </h1>
                <p className="text-gray-400 mt-2">16-Player Single Elimination Tournament</p>
              </div>
              <div className="flex items-center space-x-4">
                <Link 
                  href="/dueling/stats"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  📊 Dueling Stats
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {tournament && (
          <>
            {/* Tournament Info */}
            <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{tournament.name}</h2>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400">16 Players • Single Elimination</span>
                    <span className={`px-3 py-1 rounded text-xs font-bold ${
                      tournament.status === 'completed' ? 'bg-green-600' :
                      tournament.status === 'in_progress' ? 'bg-yellow-600' :
                      'bg-blue-600'
                    } text-white`}>
                      {tournament.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {tournament.winner && (
                    <div className="mt-3 p-4 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/50 rounded-lg">
                      <div className="font-bold text-yellow-300 text-lg">🏆 Champion: {tournament.winner.in_game_alias}</div>
                      <div className="text-sm text-yellow-400">🥈 Runner-up: {tournament.runner_up?.in_game_alias}</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-4">
                  {isAdmin && (
                    <>
                      <button
                        onClick={simulateTournament}
                        disabled={isSimulating || tournament.status === 'completed'}
                        className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300 disabled:cursor-not-allowed"
                      >
                        {isSimulating ? '⏳ Simulating...' : tournament.status === 'completed' ? '✅ Complete' : '🎯 Simulate Tournament'}
                      </button>
                      <button
                        onClick={resetTournament}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300"
                      >
                        🔄 Reset
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tournament Bracket */}
            <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
              <DoubleEliminationBracket tournament={tournament} />
            </div>
          </>
        )}
      </div>
    </div>
  );
} 