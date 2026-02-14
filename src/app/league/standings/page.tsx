'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CTFPLStandingsContent } from '@/components/league/CTFPLStandingsContent';

interface League {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface LeagueSeason {
  id: string;
  league_id: string;
  season_number: number;
  season_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  champion_squad_ids: string[];
  runner_up_squad_ids: string[];
  third_place_squad_ids: string[];
  total_matches: number | null;
  total_squads: number | null;
}

interface SquadMap {
  [id: string]: string;
}

function LeagueStandingsHubContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const leagueSlugParam = searchParams.get('league') || 'ctfpl';

  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(leagueSlugParam);
  const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
  const [squadNames, setSquadNames] = useState<SquadMap>({});
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);

  useEffect(() => {
    setSelectedSlug(leagueSlugParam);
  }, [leagueSlugParam]);

  useEffect(() => {
    (async () => {
      setLoadingLeagues(true);
      const { data, error } = await supabase
        .from('leagues')
        .select('id, slug, name, description')
        .order('slug');
      if (!error && data) setLeagues(data);
      setLoadingLeagues(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    if (selectedSlug === 'ctfpl') {
      setSeasons([]);
      return;
    }
    (async () => {
      setLoadingSeasons(true);
      const league = leagues.find((l) => l.slug === selectedSlug);
      if (!league) {
        setLoadingSeasons(false);
        return;
      }
      const { data: seasonsData, error: seasonsError } = await supabase
        .from('league_seasons')
        .select('id, league_id, season_number, season_name, start_date, end_date, status, champion_squad_ids, runner_up_squad_ids, third_place_squad_ids, total_matches, total_squads')
        .eq('league_id', league.id)
        .order('season_number', { ascending: false });
      if (seasonsError) {
        setSeasons([]);
        setLoadingSeasons(false);
        return;
      }
      const list = (seasonsData || []) as LeagueSeason[];
      setSeasons(list);
      const allIds = new Set<string>();
      list.forEach((s) => {
        (s.champion_squad_ids || []).forEach((id) => allIds.add(id));
        (s.runner_up_squad_ids || []).forEach((id) => allIds.add(id));
        (s.third_place_squad_ids || []).forEach((id) => allIds.add(id));
      });
      if (allIds.size > 0) {
        const { data: squads } = await supabase
          .from('squads')
          .select('id, name')
          .in('id', Array.from(allIds));
        const map: SquadMap = {};
        (squads || []).forEach((row: any) => { map[row.id] = row.name || 'Unknown'; });
        setSquadNames(map);
      } else {
        setSquadNames({});
      }
      setLoadingSeasons(false);
    })();
  }, [selectedSlug, leagues]);

  const getSquadName = (id: string) => squadNames[id] || '—';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />
      {/* League selector — shown for all leagues */}
      {loadingLeagues ? (
        <div className="border-b border-gray-800 px-4 py-4 text-gray-400">Loading leagues…</div>
      ) : (
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <p className="text-gray-400 text-sm mb-2">League</p>
            <div className="flex flex-wrap gap-2">
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={`/league/standings?league=${encodeURIComponent(league.slug)}`}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedSlug === league.slug
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {league.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTFPL: show full standings on this page */}
      {selectedSlug === 'ctfpl' && <CTFPLStandingsContent />}

      {/* Other leagues: show seasons list */}
      {selectedSlug && selectedSlug !== 'ctfpl' && (
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  {leagues.find((l) => l.slug === selectedSlug)?.name || selectedSlug} — Seasons
                </h2>
                {loadingSeasons ? (
                  <div className="text-gray-400">Loading seasons…</div>
                ) : seasons.length === 0 ? (
                  <p className="text-gray-400">No seasons recorded yet.</p>
                ) : (
                  <ul className="space-y-4">
                    {seasons.map((s) => (
                      <li
                        key={s.id}
                        className={`border rounded-lg p-4 ${s.status === 'active' ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-gray-700'}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-medium text-white">
                            {s.season_name || `Season ${s.season_number}`}
                          </span>
                          {s.status === 'active' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-cyan-600 text-white">Active</span>
                          )}
                          {s.status === 'upcoming' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-600 text-gray-200">Upcoming</span>
                          )}
                          {s.status === 'completed' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-600 text-gray-400">Completed</span>
                          )}
                        </div>
                        {(s.start_date || s.end_date) && (
                          <p className="text-sm text-gray-400 mb-2">
                            {s.start_date && new Date(s.start_date).toLocaleDateString()}
                            {s.end_date && ` – ${new Date(s.end_date).toLocaleDateString()}`}
                          </p>
                        )}
                        {(s.champion_squad_ids?.length > 0 || s.runner_up_squad_ids?.length > 0 || s.third_place_squad_ids?.length > 0) && (
                          <div className="text-sm space-y-1">
                            {s.champion_squad_ids?.length > 0 && (
                              <p><span className="text-amber-400">Champion:</span> {(s.champion_squad_ids || []).map(getSquadName).join(', ')}</p>
                            )}
                            {s.runner_up_squad_ids?.length > 0 && (
                              <p><span className="text-gray-400">Runner-up:</span> {(s.runner_up_squad_ids || []).map(getSquadName).join(', ')}</p>
                            )}
                            {s.third_place_squad_ids?.length > 0 && (
                              <p><span className="text-gray-400">Third:</span> {(s.third_place_squad_ids || []).map(getSquadName).join(', ')}</p>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
          </div>
        </main>
      )}
    </div>
  );
}

export default function LeagueStandingsHubPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Navbar />
        <div className="border-b border-gray-800 px-4 py-8 text-center text-gray-400">Loading standings…</div>
      </div>
    }>
      <LeagueStandingsHubContent />
    </Suspense>
  );
}
