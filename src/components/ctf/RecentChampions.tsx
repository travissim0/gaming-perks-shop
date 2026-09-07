'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Medal } from 'lucide-react';
import { getLeagues, getRecentChampions, type LeagueInfo, type SeasonChampions, type SquadRef } from '@/lib/leagues';

interface LeagueChampions {
  league: LeagueInfo;
  seasons: SeasonChampions[];
}

const names = (list: SquadRef[]) =>
  list.map((s) => (s.tag ? `${s.name} [${s.tag}]` : s.name)).join(', ');

/**
 * Per-league "recent champions" from live season data (ctfpl_seasons /
 * league_seasons). Sits alongside — not instead of — the historical hall.
 */
export default function RecentChampions() {
  const [data, setData] = useState<LeagueChampions[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const leagues = await getLeagues();
        const all = await Promise.all(
          leagues.map(async (league) => ({ league, seasons: await getRecentChampions(league, 5) })),
        );
        setData(all.filter((x) => x.seasons.length > 0));
      } catch (err) {
        console.error('Error loading recent champions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || data.length === 0) return null;

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 pb-16">
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="w-6 h-6 text-[#F59E0B]" aria-hidden="true" />
        <h2 className="font-display text-3xl text-[#E6EDF7]">Recent champions</h2>
        <span className="text-sm text-[#8B98B0] ml-2">from the current leagues</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {data.map(({ league, seasons }) => (
          <section key={league.id} className="rounded-xl bg-[#131A2B] overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="font-display text-2xl text-[#E6EDF7] leading-none">{league.name}</div>
                <div className="text-xs text-[#8B98B0] mt-1">{league.description}</div>
              </div>
              <Link href={`/league/standings?league=${league.slug}`} className="text-xs text-[#22D3EE] hover:underline">
                Standings →
              </Link>
            </div>
            <div className="px-5 pb-4 space-y-3">
              {seasons.map((s) => (
                <div key={s.season_id} className="rounded-lg bg-[#1B2438] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-[#E6EDF7]">
                      {s.season_name || `Season ${s.season_number}`}
                    </span>
                    {s.end_date && (
                      <span className="text-[11px] text-[#8B98B0]">{new Date(s.end_date).getFullYear()}</span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    {s.champions.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Trophy className="w-4 h-4 mt-0.5 text-[#F59E0B] shrink-0" aria-hidden="true" />
                        <span className="text-[#E6EDF7]">{names(s.champions)}</span>
                      </div>
                    )}
                    {s.runners_up.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Medal className="w-4 h-4 mt-0.5 text-[#8B98B0] shrink-0" aria-hidden="true" />
                        <span className="text-[#8B98B0]">{names(s.runners_up)}</span>
                      </div>
                    )}
                    {s.third.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Medal className="w-4 h-4 mt-0.5 text-[#8B98B0]/60 shrink-0" aria-hidden="true" />
                        <span className="text-[#8B98B0]/80">{names(s.third)}</span>
                      </div>
                    )}
                    {s.champions.length === 0 && (
                      <div className="text-[#8B98B0]">Champion not recorded</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
