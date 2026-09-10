'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { getLeagues, pickFeatured, type LeagueInfo } from '@/lib/leagues';
import { CTFPLStandingsContent } from '@/components/league/CTFPLStandingsContent';
import { displayFont, bodyFont } from '@/lib/fonts';

function StandingsHub() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  // No ?league= → the featured league (the one running now).
  const slugParam = searchParams.get('league');

  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setLeagues(await getLeagues());
      setLoaded(true);
    })();
  }, []);

  const league = slugParam ? leagues.find((l) => l.slug === slugParam) || null : pickFeatured(leagues);

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      {!loaded ? (
        <main className="container mx-auto px-4 py-6">
          <div className="rounded-xl bg-[#131A2B] px-6 py-8 animate-pulse space-y-3">
            <div className="h-3 w-40 rounded bg-white/5" />
            <div className="h-12 w-72 rounded bg-white/5" />
          </div>
        </main>
      ) : !league ? (
        <main className="container mx-auto px-4 py-6">
          <div className="rounded-xl bg-[#131A2B] px-6 py-8">
            <h1 className="font-display text-4xl text-[#E6EDF7]">League not found</h1>
            <p className="text-sm text-[#8B98B0] mt-2">Pick a league from the menu.</p>
          </div>
        </main>
      ) : (
        <CTFPLStandingsContent league={league} leagues={leagues} />
      )}
    </div>
  );
}

export default function LeagueStandingsPage() {
  return (
    <Suspense
      fallback={
        <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
          <Navbar user={null} />
        </div>
      }
    >
      <StandingsHub />
    </Suspense>
  );
}
