'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ZoneCard from './ZoneCard';

interface StandingEntry {
  squad_id: string;
  squad_name: string;
  squad_tag: string;
  wins: number;
  losses: number;
  points: number;
}

interface RecentMatch {
  id: string;
  title: string;
  squad_a_name: string;
  squad_b_name: string;
  squad_a_score: number;
  squad_b_score: number;
  played_at: string;
}

interface UpcomingMatch {
  id: string;
  title: string;
  squad_a_name: string;
  squad_b_name: string;
  scheduled_at: string;
}

export default function CTFPLCard() {
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [recentMatch, setRecentMatch] = useState<RecentMatch | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<UpcomingMatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCTFPLData = async () => {
      try {
        // Fetch current season standings
        const { data: standingsData } = await supabase
          .from('ctfpl_standings')
          .select('squad_id, squad_name, squad_tag, wins, losses, points')
          .order('points', { ascending: false })
          .limit(5);

        if (standingsData) {
          setStandings(standingsData);
        }

        // Fetch most recent completed match
        const { data: recentMatchData } = await supabase
          .from('ctfpl_matches')
          .select('id, title, squad_a_name, squad_b_name, squad_a_score, squad_b_score, played_at')
          .eq('status', 'completed')
          .order('played_at', { ascending: false })
          .limit(1)
          .single();

        if (recentMatchData) {
          setRecentMatch(recentMatchData);
        }

        // Fetch next scheduled match
        const { data: upcomingMatchData } = await supabase
          .from('ctfpl_matches')
          .select('id, title, squad_a_name, squad_b_name, scheduled_at')
          .eq('status', 'scheduled')
          .gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .single();

        if (upcomingMatchData) {
          setUpcomingMatch(upcomingMatchData);
        }
      } catch (error) {
        console.error('Failed to fetch CTFPL data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCTFPLData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ZoneCard
      title="CTFPL League"
      icon="🏆"
      accentColor="blue"
      linkTo="/league/ctfpl"
      linkText="View Full League"
    >
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Standings */}
          {standings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Current Standings</h4>
              <div className="space-y-1">
                {standings.slice(0, 5).map((team, index) => (
                  <div
                    key={team.squad_id}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                        #{index + 1}
                      </span>
                      <span className="text-gray-300">[{team.squad_tag}]</span>
                      <span className="text-white truncate max-w-24">{team.squad_name}</span>
                    </div>
                    <span className="text-blue-400 font-medium">{team.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Match */}
          {recentMatch && (
            <div className="pt-2 border-t border-gray-700/50">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Latest Result</h4>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{recentMatch.squad_a_name}</span>
                  <span className="text-lg font-bold text-white">
                    {recentMatch.squad_a_score} - {recentMatch.squad_b_score}
                  </span>
                  <span className="text-gray-300">{recentMatch.squad_b_name}</span>
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Match */}
          {upcomingMatch && (
            <div className="pt-2 border-t border-gray-700/50">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Next Match</h4>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-sm text-center">
                  <span className="text-gray-300">{upcomingMatch.squad_a_name}</span>
                  <span className="text-gray-500 mx-2">vs</span>
                  <span className="text-gray-300">{upcomingMatch.squad_b_name}</span>
                </div>
                <div className="text-xs text-cyan-400 text-center mt-1">
                  {formatDate(upcomingMatch.scheduled_at)}
                </div>
              </div>
            </div>
          )}

          {standings.length === 0 && !recentMatch && !upcomingMatch && (
            <p className="text-gray-500 text-sm text-center py-4">
              No active season data available
            </p>
          )}
        </div>
      )}
    </ZoneCard>
  );
}
