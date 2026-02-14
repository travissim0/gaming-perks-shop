'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';

export default function LeagueRegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasActiveSeason, setHasActiveSeason] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const [ctfplRes, leagueRes] = await Promise.all([
          supabase.from('ctfpl_seasons').select('id').eq('status', 'active').limit(1),
          supabase.from('league_seasons').select('id').eq('status', 'active').limit(1),
        ]);
        if (cancelled) return;
        const ctfplActive = !ctfplRes.error && ctfplRes.data && ctfplRes.data.length > 0;
        const leagueActive = !leagueRes.error && leagueRes.data && leagueRes.data.length > 0;
        setHasActiveSeason(ctfplActive || leagueActive);
        if (ctfplActive || leagueActive) {
          router.replace('/free-agents');
          return;
        }
      } catch (e) {
        if (!cancelled) setHasActiveSeason(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <main className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className="text-gray-400">Checking for active season…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">No active league/season</h1>
          <p className="text-gray-400 mb-6">
            There is no active league or season open for registration right now. Please check back when a season is running to join the free agent pool or register for the league.
          </p>
          <a
            href="/league"
            className="inline-block px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
          >
            Back to League
          </a>
        </div>
      </main>
    </div>
  );
}
