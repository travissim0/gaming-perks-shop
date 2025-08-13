'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface MatchParticipant {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'player' | 'commentator' | 'recording' | 'referee';
  squad_name?: string;
  joined_at: string;
}

interface TournamentMatch {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  match_type: 'tournament';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  squad_a_id?: string;
  squad_b_id?: string;
  squad_a_name?: string;
  squad_b_name?: string;
  created_by: string;
  created_by_alias: string;
  created_at: string;
  participants: MatchParticipant[];
}

type SquadInfo = {
  id: string;
  name: string;
  banner_url?: string | null;
  members: { id: string; alias: string }[];
};

interface GroupedMatches {
  [date: string]: TournamentMatch[];
}

export default function TournamentMatchesPage() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [squadInfos, setSquadInfos] = useState<Map<string, SquadInfo>>(new Map());
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetchTournamentMatches();
  }, []);

  const fetchTournamentMatches = async () => {
    try {
      setPageLoading(true);
      
      // Fetch tournament matches that are scheduled and in the future
      const response = await fetch('/api/matches?status=scheduled&limit=100');
      if (response.ok) {
        const data = await response.json();
        const tournamentMatches = (data.matches || []).filter((match: any) => 
          match.match_type === 'tournament' && 
          new Date(match.scheduled_at) > new Date()
        );
        
        setMatches(tournamentMatches);
        
        // Fetch squad information for all unique squad IDs
        const squadIds = new Set<string>();
        tournamentMatches.forEach((match: TournamentMatch) => {
          if (match.squad_a_id) squadIds.add(match.squad_a_id);
          if (match.squad_b_id) squadIds.add(match.squad_b_id);
        });
        
        if (squadIds.size > 0) {
          await fetchSquadInfos(Array.from(squadIds));
        }
      } else {
        console.error('Failed to fetch tournament matches:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching tournament matches:', error);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchSquadInfos = async (squadIds: string[]) => {
    try {
      const { data: squadsData, error: squadsError } = await supabase
        .from('squads')
        .select('id, name, tag, banner_url')
        .in('id', squadIds);
      if (squadsError) throw squadsError;

      // Fetch members for all squads
      const { data: membersData, error: membersError } = await supabase
        .from('squad_members')
        .select('id, squad_id, player_id, profiles!squad_members_player_id_fkey(in_game_alias)')
        .in('squad_id', squadIds);
      if (membersError) throw membersError;

      const membersBySquad = new Map<string, { id: string; alias: string }[]>();
      (membersData || []).forEach((m: any) => {
        const arr = membersBySquad.get(m.squad_id) || [];
        arr.push({ id: m.player_id, alias: m.profiles?.in_game_alias || 'Unknown' });
        membersBySquad.set(m.squad_id, arr);
      });

      const squadInfosMap = new Map<string, SquadInfo>();
      (squadsData || []).forEach((squad: any) => {
        const members = (membersBySquad.get(squad.id) || []).sort((a, b) => a.alias.localeCompare(b.alias));
        squadInfosMap.set(squad.id, {
          id: squad.id,
          name: squad.name,
          banner_url: squad.banner_url,
          members
        });
      });

      setSquadInfos(squadInfosMap);
    } catch (error) {
      console.error('Error fetching squad infos:', error);
    }
  };

  const groupMatchesByDate = (matches: TournamentMatch[]): GroupedMatches => {
    const grouped: GroupedMatches = {};
    
    matches
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .forEach(match => {
        const date = new Date(match.scheduled_at).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(match);
      });
    
    return grouped;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-400';
      case 'in_progress': return 'text-green-400';
      case 'completed': return 'text-gray-400';
      case 'cancelled': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return '📅';
      case 'in_progress': return '🎮';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  const TournamentMatchCard = ({ match }: { match: TournamentMatch }) => {
    const squadA = match.squad_a_id ? squadInfos.get(match.squad_a_id) : null;
    const squadB = match.squad_b_id ? squadInfos.get(match.squad_b_id) : null;
    
    return (
      <Link href={`/matches/${match.id}`}>
        <div className="group bg-gray-800/50 border border-gray-700 hover:border-cyan-500/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer">
          {/* Squad vs Squad Layout */}
          {(squadA || squadB) ? (
            <div className="p-8">
              <div className="grid grid-cols-3 gap-6 items-center">
                {/* Squad A */}
                <div className="text-center">
                  <div className="mb-3">
                    <h3 className="text-white font-bold text-base sm:text-lg md:text-xl mb-2 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)] whitespace-nowrap truncate">
                      {squadA?.name || 'TBD'}
                    </h3>
                  </div>
                  <div className="relative">
                    <div className="aspect-square w-full rounded-xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden shadow-lg">
                      {squadA?.banner_url ? (
                        <img 
                          src={squadA.banner_url} 
                          alt={`${squadA.name} banner`} 
                          className="w-full h-full object-cover opacity-70" 
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700/40" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/15 via-transparent to-transparent" />
                    </div>
                  </div>
                </div>

                {/* VS Center with Enhanced Time Display */}
                <div className="relative flex items-center justify-center">
                  <div className="relative h-full w-full flex flex-col items-center justify-center py-6">
                    {/* Background glow effect */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-fuchsia-500/20 via-purple-500/15 to-cyan-500/15 blur-xl" />
                    </div>
                    
                    {/* VS with gradient styling */}
                    <div className="relative z-10 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-widest text-white select-none mb-3">
                      <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">VS</span>
                    </div>
                    
                    {/* Enhanced Time - Below VS */}
                    <div className="relative z-10">
                      <div className="text-sm sm:text-base md:text-lg font-bold text-cyan-300">
                        {new Date(match.scheduled_at).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          timeZone: 'America/New_York'
                        })} EST
                      </div>
                    </div>
                  </div>
                </div>

                {/* Squad B */}
                <div className="text-center">
                  <div className="mb-3">
                    <h3 className="text-white font-bold text-base sm:text-lg md:text-xl mb-2 drop-shadow-[0_0_8px_rgba(168,85,247,0.45)] whitespace-nowrap truncate">
                      {squadB?.name || 'TBD'}
                    </h3>
                  </div>
                  <div className="relative">
                    <div className="aspect-square w-full rounded-xl border border-purple-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden shadow-lg">
                      {squadB?.banner_url ? (
                        <img 
                          src={squadB.banner_url} 
                          alt={`${squadB.name} banner`} 
                          className="w-full h-full object-cover opacity-70" 
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700/40" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/15 via-transparent to-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Fallback for matches without squads */
            <div className="p-4">
              <div className="text-center text-gray-400">
                <div className="text-2xl mb-2">🏆</div>
                <div className="text-sm">Tournament Match</div>
                <div className="text-xs mt-1">
                  {match.participants?.length || 0} participants signed up
                </div>
              </div>
            </div>
          )}
        </div>
      </Link>
    );
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading tournament matches...</div>
        </div>
      </div>
    );
  }

  const groupedMatches = groupMatchesByDate(matches);
  const hasMatches = Object.keys(groupedMatches).length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-6xl mx-auto p-6">
        {/* Quick Navigation Links */}
        <div className="flex justify-center gap-8 mb-8">
          <Link href="/rules" className="group relative px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
            <span className="relative text-yellow-400 hover:text-yellow-300 font-serif text-base font-semibold tracking-wide">
              📜 Tournament Rules
            </span>
          </Link>
          <Link href="/league/ctfpl" className="group relative px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
            <span className="relative text-purple-400 hover:text-purple-300 font-sans text-base font-extrabold tracking-tight">
              🏆 View Standings
            </span>
          </Link>
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/matches" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2">
            ← Back to All Matches
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Upcoming Tournament Matches
          </h1>
          <div className="w-48"></div> {/* Spacer for centering */}
        </div>

        {/* Tournament Tree View Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-10">
          <div className="absolute inset-0 tournament-tree-bg">
            {/* Vertical Tournament Bracket Lines */}
            <div className="absolute left-1/4 top-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-300/30 to-transparent transform -translate-x-1/2"></div>
            <div className="absolute right-1/4 top-0 w-px h-full bg-gradient-to-b from-transparent via-purple-300/30 to-transparent transform translate-x-1/2"></div>
            <div className="absolute left-1/2 top-0 w-px h-full bg-gradient-to-b from-transparent via-yellow-300/30 to-transparent transform -translate-x-1/2"></div>
            
            {/* Horizontal Connection Lines */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-400/20 to-transparent"
                style={{ top: `${20 + i * 10}%` }}
              ></div>
            ))}
            
            {/* Tournament Bracket Nodes */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full border border-cyan-400/30 bg-cyan-500/10"
                style={{
                  left: `${25 + (i % 3) * 25}%`,
                  top: `${30 + Math.floor(i / 3) * 40}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              ></div>
            ))}
          </div>
        </div>

        {/* Matches Content */}
        {!hasMatches ? (
          <div className="relative z-10 text-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold mb-4">No Upcoming Tournament Matches</h2>
            <p className="text-gray-400 mb-6">
              There are currently no scheduled tournament matches. Check back later for updates.
            </p>
            <div className="flex justify-center gap-4">
              <Link 
                href="/matches" 
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors"
              >
                View All Matches
              </Link>
              <Link 
                href="/rules" 
                className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg transition-colors"
              >
                View Tournament Rules
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative z-10 space-y-12">
            {Object.entries(groupedMatches).map(([date, dayMatches], dateIndex) => (
              <div key={date} className="space-y-6">
                {/* Enhanced Date Header with Tree Connection */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent flex-1" />
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-lg blur-md"></div>
                      <h2 className="relative text-xl font-semibold text-cyan-300 px-6 py-3 bg-gray-800/70 rounded-lg border border-cyan-500/30 backdrop-blur-sm">
                        {date}
                      </h2>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent flex-1" />
                  </div>
                  
                  {/* Tree Connection Line */}
                  <div className="absolute left-1/2 top-full w-px h-8 bg-gradient-to-b from-cyan-500/50 to-transparent transform -translate-x-1/2"></div>
                </div>

                {/* Matches for this date with Parallax Effect */}
                <div 
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 transform transition-transform duration-500 ease-out"
                  style={{
                    transform: `translateY(${dateIndex * 2}px)`,
                  }}
                >
                  {dayMatches.map((match, matchIndex) => (
                    <div
                      key={match.id}
                      className="transform transition-all duration-700 ease-out hover:scale-105"
                      style={{
                        transform: `translateY(${matchIndex * 3}px) rotateY(${matchIndex % 2 === 0 ? '1deg' : '-1deg'})`,
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      <TournamentMatchCard match={match} />
                    </div>
                  ))}
                </div>

                {/* Connecting Lines Between Matches */}
                {dayMatches.length > 1 && (
                  <div className="relative flex justify-center">
                    <div className="w-32 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}


      </div>
    </div>
  );
}
