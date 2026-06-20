'use client';

import React, { useEffect, useState } from 'react';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';
import { supabase } from '@/lib/supabase';

interface Season {
  id: string;
  season_number: number;
  season_name: string | null;
  status: string;
}

interface StandingRow {
  squad_id: string;
  squad_name: string;
  squad_tag: string | null;
  rank: number;
  matches_played: number;
  wins: number;
  losses: number;
  no_shows: number;
  points: number;
  score_for: number;
  score_against: number;
  score_difference: number;
  win_percentage: number;
}

export default function CtfmlStandingsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load seasons, default to the active one (or latest).
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ctfml_seasons')
          .select('id, season_number, season_name, status')
          .order('season_number', { ascending: false });
        if (error) throw error;
        const list = (data as Season[]) || [];
        setSeasons(list);
        const active = list.find((s) => s.status === 'active') || list[0];
        setSeasonId(active?.id ?? null);
        if (!active) setLoading(false);
      } catch (err: any) {
        console.error('Error loading CTFML seasons:', err);
        setError(err?.message || 'Failed to load seasons');
        setLoading(false);
      }
    })();
  }, []);

  // Load standings whenever the selected season changes.
  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ctfml_standings_with_rankings')
          .select('*')
          .eq('season_id', seasonId)
          .order('rank', { ascending: true });
        if (error) throw error;
        setRows((data as StandingRow[]) || []);
      } catch (err: any) {
        console.error('Error loading CTFML standings:', err);
        setError(err?.message || 'Failed to load standings');
      } finally {
        setLoading(false);
      }
    })();
  }, [seasonId]);

  return (
    <CtfmlBackground opacity={0.16}>
      <CtfmlHeader currentPage="standings" />

      <div className="relative pt-32 pb-20 z-10 max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent drop-shadow-lg">
            Standings
          </h1>
          {seasons.length > 0 && (
            <select
              value={seasonId ?? ''}
              onChange={(e) => setSeasonId(e.target.value)}
              className="bg-gray-900/80 border border-emerald-400/40 text-emerald-100 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-300"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.season_name || `Season ${s.season_number}`}
                  {s.status === 'active' ? ' (active)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading && <div className="text-center py-20 text-white/70">Loading standings…</div>}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-6 text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && seasons.length === 0 && (
          <div className="bg-emerald-400/5 border border-emerald-300/30 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-emerald-200 mb-2">No seasons yet</h2>
            <p className="text-white/70">Standings will appear once a season is created and matches are played.</p>
          </div>
        )}

        {!loading && !error && seasons.length > 0 && rows.length === 0 && (
          <div className="bg-emerald-400/5 border border-emerald-300/30 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-emerald-200 mb-2">No results yet</h2>
            <p className="text-white/70">No matches have been recorded for this season.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-emerald-300/30 bg-gray-950/60 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-emerald-200 border-b border-emerald-400/30">
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Squad</th>
                  <th className="px-3 py-3 text-center font-semibold">GP</th>
                  <th className="px-3 py-3 text-center font-semibold">W</th>
                  <th className="px-3 py-3 text-center font-semibold">L</th>
                  <th className="px-3 py-3 text-center font-semibold">Pts</th>
                  <th className="px-3 py-3 text-center font-semibold">Win%</th>
                  <th className="px-3 py-3 text-center font-semibold">Diff</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.squad_id}
                    className="border-b border-white/5 hover:bg-emerald-500/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-emerald-300 font-bold">{r.rank}</td>
                    <td className="px-4 py-3 text-white font-medium">
                      {r.squad_name}
                      {r.squad_tag && (
                        <span className="ml-2 text-xs text-emerald-300 font-mono">[{r.squad_tag}]</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-white/80">{r.matches_played}</td>
                    <td className="px-3 py-3 text-center text-emerald-300">{r.wins}</td>
                    <td className="px-3 py-3 text-center text-rose-300">{r.losses}</td>
                    <td className="px-3 py-3 text-center text-white font-bold">{r.points}</td>
                    <td className="px-3 py-3 text-center text-white/80">{Number(r.win_percentage).toFixed(0)}%</td>
                    <td className="px-3 py-3 text-center text-white/70">
                      {r.score_difference > 0 ? `+${r.score_difference}` : r.score_difference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CtfmlBackground>
  );
}
