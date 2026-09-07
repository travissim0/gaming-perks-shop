'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { getLeagues, pickFeatured, type LeagueInfo } from '@/lib/leagues';
import { CTFPLStandingsContent } from '@/components/league/CTFPLStandingsContent';

function LeagueStandingsHubContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  // No ?league= param → default to the FEATURED league (the one running now),
  // rather than a hardcoded CTFPL.
  const leagueSlugParam = searchParams.get('league');

  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(leagueSlugParam || '');
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  useEffect(() => {
    if (leagueSlugParam) setSelectedSlug(leagueSlugParam);
  }, [leagueSlugParam]);

  useEffect(() => {
    (async () => {
      setLoadingLeagues(true);
      const list = await getLeagues();
      setLeagues(list);
      if (!leagueSlugParam) {
        setSelectedSlug(pickFeatured(list)?.slug || 'ctfpl');
      }
      setLoadingLeagues(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ctf-theme min-h-screen bg-gray-950 text-gray-100">
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

      {/* Head-to-head squad comparison (was orphaned — now reachable from here) */}
      <div className="px-4 py-2 border-b border-gray-800">
        <div className="max-w-4xl mx-auto text-sm">
          <Link href="/league/compare" className="text-[#22D3EE] hover:underline">
            Compare two squads head-to-head →
          </Link>
        </div>
      </div>

      {/* Show standings for all leagues using the generic component */}
      {selectedSlug && (
        <CTFPLStandingsContent
          leagueSlug={selectedSlug}
          leagueName={leagues.find((l) => l.slug === selectedSlug)?.name || selectedSlug.toUpperCase()}
        />
      )}
    </div>
  );
}

export default function LeagueStandingsHubPage() {
  return (
    <Suspense fallback={
      <div className="ctf-theme min-h-screen bg-gray-950 text-gray-100">
        <Navbar />
        <div className="border-b border-gray-800 px-4 py-8 text-center text-gray-400">Loading standings…</div>
      </div>
    }>
      <LeagueStandingsHubContent />
    </Suspense>
  );
}
