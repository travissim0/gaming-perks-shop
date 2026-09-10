'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MatchReportWithDetails } from '@/types/database';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Match reports — analyst write-ups on played matches with per-player ratings.
 * Data from /api/match-reports, unchanged. Analysts, CTF admins and site admins
 * get a "Write a report" button.
 */

interface League { id: string; slug: string; name: string }
type Report = MatchReportWithDetails & { league_slug?: string | null };

const PAGE = 12;
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

function TeamMark({ name, tag, banner }: { name: string; tag?: string | null; banner?: string | null }) {
  if (banner) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={banner} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />;
  }
  return <span className="w-10 h-10 rounded-lg bg-[#1B2438] text-[#22D3EE] text-xs font-medium flex items-center justify-center shrink-0">{(tag || name).slice(0, 4).toUpperCase()}</span>;
}

export default function MatchReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [search, setSearch] = useState('');
  const [season, setSeason] = useState('all');
  const [league, setLeague] = useState('all');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    (async () => {
      try {
        const [res, { data: ls }] = await Promise.all([
          fetch('/api/match-reports'),
          supabase.from('leagues').select('id, slug, name').order('display_order').order('slug'),
        ]);
        if (!res.ok) throw new Error('Could not load match reports');
        setReports(((await res.json()).reports || []) as Report[]);
        setLeagues((ls || []) as League[]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) { setCanWrite(false); return; }
    supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle().then(({ data: p }) => {
      const role = (p as any)?.ctf_role || '';
      setCanWrite(!!p && ((p as any).is_admin === true || role === 'ctf_admin' || role.includes('analyst')));
    });
  }, [user]);

  useEffect(() => { setShown(PAGE); }, [search, season, league]);

  const seasons = useMemo(() => Array.from(new Set(reports.map((r) => r.season_name).filter(Boolean))).sort().reverse(), [reports]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (season !== 'all' && r.season_name !== season) return false;
      if (league !== 'all' && r.league_slug !== league) return false;
      if (q && ![r.title, r.squad_a_name, r.squad_b_name, r.creator_alias].some((s) => (s || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [reports, search, season, league]);
  const analysts = useMemo(() => new Set(reports.map((r) => r.creator_alias)).size, [reports]);

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Match reports</h1>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
                {!loading && (
                  <>
                    <span><span className="text-[#E6EDF7] tabular-nums">{reports.length}</span> report{reports.length === 1 ? '' : 's'}</span>
                    <span className="text-white/20">·</span>
                    <span><span className="text-[#E6EDF7] tabular-nums">{seasons.length}</span> season{seasons.length === 1 ? '' : 's'}</span>
                    <span className="text-white/20">·</span>
                    <span><span className="text-[#E6EDF7] tabular-nums">{analysts}</span> analyst{analysts === 1 ? '' : 's'}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-sm text-[#8B98B0] max-w-xl">Write-ups on played matches with a rating for each player who featured.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {canWrite && <Link href="/league/match-reports/create" className="px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] transition-colors">Write a report</Link>}
              <Link href="/league/schedule" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Schedule</Link>
              <Link href="/league/ratings" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
                Squad ratings <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex gap-1 flex-wrap">
              <Chip active={league === 'all'} onClick={() => setLeague('all')}>All leagues</Chip>
              {leagues.map((l) => <Chip key={l.slug} active={league === l.slug} onClick={() => setLeague(l.slug)}>{l.name}</Chip>)}
            </div>
            {seasons.length > 0 && (
              <>
                <span className="hidden sm:block w-px h-5 bg-white/10" />
                <select value={season} onChange={(e) => setSeason(e.target.value)} className="bg-transparent text-sm text-[#E6EDF7] py-1.5 focus:outline-none" style={{ colorScheme: 'dark' }}>
                  <option value="all" className="bg-[#131A2B]">All seasons</option>
                  {seasons.map((s) => <option key={s} value={s} className="bg-[#131A2B]">{s}</option>)}
                </select>
              </>
            )}
            <div className="ml-auto relative">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, squad or analyst…" className="w-56 bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 pr-7 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Clear"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-5 text-sm text-[#F87171]">{error}</section>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-36 rounded-xl bg-[#131A2B] animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-6 text-sm text-[#8B98B0]">
            {reports.length === 0 ? 'No match reports yet. They appear here as analysts write them.' : 'Nothing matches those filters.'}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.slice(0, shown).map((r) => (
                <Link key={r.id} href={`/league/match-reports/${r.id}`} className="group rounded-xl bg-[#131A2B] p-4 hover:bg-[#161e31] transition-colors flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#8B98B0]">
                    {r.league_slug && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[#E6EDF7] uppercase tracking-wide">{r.league_slug}</span>}
                    {r.season_name && <span>{r.season_name}</span>}
                    <span className="ml-auto">{fmt(r.match_date)}</span>
                  </div>
                  <h2 className="mt-1.5 font-display text-2xl leading-tight text-[#E6EDF7] group-hover:text-[#22D3EE] transition-colors">{r.title}</h2>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TeamMark name={r.squad_a_name} banner={r.squad_a_banner_url} />
                      <span className="text-sm text-[#E6EDF7] truncate">{r.squad_a_name}</span>
                    </div>
                    <span className="text-xs text-white/30">vs</span>
                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                      <span className="text-sm text-[#E6EDF7] truncate">{r.squad_b_name}</span>
                      <TeamMark name={r.squad_b_name} banner={r.squad_b_banner_url} />
                    </div>
                  </div>
                  {r.match_summary && <p className="mt-3 text-sm text-[#8B98B0] leading-snug line-clamp-3">{r.match_summary}</p>}
                  <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[#8B98B0]">
                    <span>By {r.creator_alias}</span>
                    <span className="inline-flex items-center gap-1 text-[#22D3EE]">Read <ChevronRight className="w-3 h-3" aria-hidden="true" /></span>
                  </div>
                </Link>
              ))}
            </div>
            {filtered.length > shown && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="px-4 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Show more ({filtered.length - shown} left)</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
