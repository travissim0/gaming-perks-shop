'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface League {
  id: string;
  slug: string;
  name: string;
}

interface RulesEntry {
  title: string;
  pdf: string;
}

const LEAGUE_RULES: Record<string, RulesEntry[]> = {
  ctfpl: [],
  ctfdl: [{ title: 'CTFDL Season 3 Rules', pdf: '/CTFDL-S3-Rules.pdf' }],
  ovdl: [],
};

function RulesContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const leagueParam = searchParams.get('league') || 'ctfdl';

  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState(leagueParam);
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('leagues')
        .select('id, slug, name')
        .order('slug');
      if (data) setLeagues(data);
      setLoadingLeagues(false);
    })();
  }, []);

  useEffect(() => {
    setSelectedLeague(leagueParam);
  }, [leagueParam]);

  const rules = LEAGUE_RULES[selectedLeague] || [];
  const leagueName = leagues.find(l => l.slug === selectedLeague)?.name || selectedLeague.toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            League Rules
          </h1>
          <p className="text-gray-400 text-lg">
            Official tournament rules and regulations
          </p>
        </div>

        {/* League Selector */}
        {!loadingLeagues && (
          <div className="mb-8">
            <div className="flex flex-wrap justify-center gap-2">
              {leagues.map(league => (
                <Link
                  key={league.slug}
                  href={`/rules?league=${league.slug}`}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedLeague === league.slug
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {league.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Rules Content */}
        {rules.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-300 mb-2">No Rules Published</h2>
            <p className="text-gray-400">
              No rules have been published for {leagueName} yet.
            </p>
          </div>
        ) : (
          rules.map((rule, index) => (
            <div key={index} className="mb-8">
              {/* PDF Viewer Container */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
                <div className="p-4 bg-gray-800 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">
                      {rule.title}
                    </h2>
                    <a
                      href={rule.pdf}
                      download
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download PDF
                    </a>
                  </div>
                </div>

                {/* PDF Embed */}
                <div className="relative" style={{ height: '80vh' }}>
                  <iframe
                    src={rule.pdf}
                    className="w-full h-full"
                    title={rule.title}
                    style={{ border: 'none' }}
                  >
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <h3 className="text-xl font-bold text-white mb-2">PDF Viewer Not Supported</h3>
                      <p className="text-gray-400 mb-6">
                        Your browser doesn&apos;t support embedded PDF viewing. Please download the file to view the rules.
                      </p>
                      <a
                        href={rule.pdf}
                        download
                        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors font-semibold"
                      >
                        Download {rule.title} PDF
                      </a>
                    </div>
                  </iframe>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">Tournament Schedule</h3>
            <p className="text-gray-400 text-sm mb-4">
              View upcoming tournament matches and important dates
            </p>
            <a href="/tournament-matches" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View Tournament Matches →
            </a>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">League Standings</h3>
            <p className="text-gray-400 text-sm mb-4">
              Check current league standings and rankings
            </p>
            <a href={`/league/standings?league=${selectedLeague}`} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View {leagueName} Standings →
            </a>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Squad Management</h3>
            <p className="text-gray-400 text-sm mb-4">
              Manage your squad roster and participate in the league
            </p>
            <a href="/squads" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View Squads →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RulesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    }>
      <RulesContent />
    </Suspense>
  );
}
