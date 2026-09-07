'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Download, List, Pencil, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import RulesBody from '@/components/ctf/RulesBody';
import { getLeagues, pickFeatured, type LeagueInfo } from '@/lib/leagues';
import { getLeagueRules, type RuleSection } from '@/lib/rules';

const ALL = '__all__';

function RulesContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const leagueParam = searchParams.get('league');

  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>(leagueParam || '');
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [sections, setSections] = useState<RuleSection[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [active, setActive] = useState<string>(ALL);
  const [isAdmin, setIsAdmin] = useState(false);

  // Leagues from the registry; default to the featured league.
  useEffect(() => {
    (async () => {
      const list = await getLeagues();
      setLeagues(list);
      if (!leagueParam) setSelectedLeague(pickFeatured(list)?.slug || 'ctfpl');
      setLoadingLeagues(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (leagueParam) setSelectedLeague(leagueParam);
  }, [leagueParam]);

  // Rules for the selected league.
  useEffect(() => {
    if (!selectedLeague) return;
    setLoadingRules(true);
    (async () => {
      const rows = await getLeagueRules(selectedLeague);
      setSections(rows);
      setActive(rows.length ? rows[0].id : ALL);
      setLoadingRules(false);
    })();
  }, [selectedLeague]);

  // Admin flag → "Edit rules" link.
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin, ctf_role')
        .eq('id', user.id)
        .maybeSingle();
      setIsAdmin(!!data && (data.is_admin === true || data.ctf_role === 'ctf_admin'));
    })();
  }, [user]);

  const league = leagues.find((l) => l.slug === selectedLeague);
  const leagueName = league?.name || selectedLeague.toUpperCase();
  const visible = useMemo(
    () => (active === ALL ? sections : sections.filter((s) => s.id === active)),
    [sections, active],
  );

  if (loading) {
    return (
      <div className="ctf-theme min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20 text-[#8B98B0]">Loading…</div>
      </div>
    );
  }

  return (
    <div className="ctf-theme min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="font-display text-4xl md:text-5xl text-[#E6EDF7] leading-none">League rules</h1>
            <p className="text-[#8B98B0] mt-2">Official rules and procedures for each CTF league.</p>
          </div>
          <div className="flex items-center gap-2">
            {league?.rules_pdf_url && (
              <a
                href={league.rules_pdf_url}
                download
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-[#E6EDF7] transition-colors"
              >
                <Download className="w-4 h-4" aria-hidden="true" /> PDF
              </a>
            )}
            {isAdmin && (
              <Link
                href={`/admin/rules?league=${selectedLeague}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30 text-sm transition-colors"
              >
                <Pencil className="w-4 h-4" aria-hidden="true" /> Edit rules
              </Link>
            )}
          </div>
        </div>

        {/* League switcher */}
        {!loadingLeagues && (
          <div className="flex flex-wrap gap-2 mb-8">
            {leagues.map((l) => (
              <Link
                key={l.slug}
                href={`/rules?league=${l.slug}`}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedLeague === l.slug
                    ? 'bg-[#22D3EE] text-[#0B0F1A]'
                    : 'bg-[#131A2B] text-[#E6EDF7] hover:bg-[#1B2438]'
                }`}
              >
                {l.name}
                {l.is_featured && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">featured</span>}
              </Link>
            ))}
          </div>
        )}

        {/* Body */}
        {loadingRules ? (
          <div className="text-[#8B98B0] py-16 text-center">Loading rules…</div>
        ) : sections.length === 0 ? (
          <div className="rounded-xl bg-[#131A2B] p-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-[#8B98B0] mb-3" aria-hidden="true" />
            <h2 className="font-display text-2xl text-[#E6EDF7] mb-1">Rules coming soon</h2>
            <p className="text-[#8B98B0]">The {leagueName} rulebook hasn&apos;t been published yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
            {/* Category nav */}
            <nav className="lg:sticky lg:top-24 self-start rounded-xl bg-[#131A2B] p-2">
              <button
                onClick={() => setActive(ALL)}
                className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  active === ALL ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#E6EDF7] hover:bg-white/5'
                }`}
              >
                <List className="w-4 h-4 shrink-0" aria-hidden="true" /> Read all
              </button>
              <div className="my-2 border-t border-white/5" />
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    active === s.id ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#E6EDF7] hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{s.category}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" aria-hidden="true" />
                </button>
              ))}
            </nav>

            {/* Content */}
            <div className="space-y-6 min-w-0">
              {visible.map((s) => (
                <section key={s.id} className="rounded-xl bg-[#131A2B] p-6">
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-wide text-[#8B98B0]">{s.category}</div>
                    <h2 className="font-display text-2xl text-[#E6EDF7]">{s.title}</h2>
                  </div>
                  <RulesBody body={s.body} />
                </section>
              ))}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href={`/league/standings?league=${selectedLeague}`} className="rounded-xl bg-[#131A2B] p-5 hover:bg-[#1B2438] transition-colors">
            <div className="font-display text-lg text-[#E6EDF7]">Standings</div>
            <div className="text-sm text-[#8B98B0]">Current {leagueName} standings and rankings</div>
          </Link>
          <Link href="/tournament-matches" className="rounded-xl bg-[#131A2B] p-5 hover:bg-[#1B2438] transition-colors">
            <div className="font-display text-lg text-[#E6EDF7]">Schedule</div>
            <div className="text-sm text-[#8B98B0]">Upcoming matches and important dates</div>
          </Link>
          <Link href="/squads" className="rounded-xl bg-[#131A2B] p-5 hover:bg-[#1B2438] transition-colors">
            <div className="font-display text-lg text-[#E6EDF7]">Squads</div>
            <div className="text-sm text-[#8B98B0]">Manage your roster and join the league</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RulesPage() {
  return (
    <Suspense
      fallback={
        <div className="ctf-theme min-h-screen bg-gray-900 text-white">
          <div className="flex items-center justify-center pt-20 text-[#8B98B0]">Loading…</div>
        </div>
      }
    >
      <RulesContent />
    </Suspense>
  );
}
