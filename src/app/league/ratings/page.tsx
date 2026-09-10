'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { SquadRatingWithDetails } from '@/types/database';
import { SYSTEM_USER_ID } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Squad ratings — analyst write-ups per squad. Official panel reviews show by
 * default; individual (unofficial) opinions behind a chip. Data from
 * /api/squad-ratings, unchanged.
 */

interface League { id: string; slug: string; name: string }
type Rating = SquadRatingWithDetails & { league_slug?: string | null };

const PAGE = 12;

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const analystName = (r: Rating) => (r.analyst_id === SYSTEM_USER_ID ? 'Anonymous' : r.analyst_alias || 'Anonymous');

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

export default function SquadRatingsPage() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [season, setSeason] = useState('all');
  const [league, setLeague] = useState('all');
  const [showUnofficial, setShowUnofficial] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, { data: ls }] = await Promise.all([
        fetch('/api/squad-ratings'),
        supabase.from('leagues').select('id, slug, name').order('display_order').order('slug'),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load ratings');
      setRatings(json.ratings || []);
      setLeagues((ls || []) as League[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setShown(PAGE); }, [search, season, league, showUnofficial]);

  const seasons = useMemo(() => Array.from(new Set(ratings.map((r) => r.season_name).filter(Boolean))).sort().reverse(), [ratings]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ratings.filter((r) => {
      const official = r.is_official === true;
      if (!official && !showUnofficial) return false;
      if (season !== 'all' && r.season_name !== season) return false;
      if (league !== 'all' && r.league_slug !== league) return false;
      if (q && ![r.squad_name, r.squad_tag, analystName(r)].some((s) => (s || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [ratings, search, season, league, showUnofficial]);
  const unofficialCount = ratings.filter((r) => r.is_official !== true).length;

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Squad ratings</h1>
              <div className="mt-2 text-sm text-[#8B98B0]">
                Analyst write-ups on each squad going into a season.
                {!loading && <> <span className="text-white/20 mx-1">·</span> <span className="text-[#E6EDF7] tabular-nums">{filtered.length}</span> of {ratings.length} shown</>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {user && (
                <Link href="/admin/ratings?tab=create" className="px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] transition-colors">Write a rating</Link>
              )}
              <Link href="/league/standings" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Standings</Link>
              <Link href="/squads" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
                Squads <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
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
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Squad, tag or analyst…" className="w-52 bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 pr-7 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
                {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Clear"><X className="w-3.5 h-3.5" /></button>}
              </div>
              {unofficialCount > 0 && (
                <Chip active={showUnofficial} onClick={() => setShowUnofficial((v) => !v)}>
                  {showUnofficial ? 'Hiding none' : `Show ${unofficialCount} unofficial`}
                </Chip>
              )}
            </div>
          </div>
        </section>

        {showUnofficial && unofficialCount > 0 && (
          <p className="px-1 text-xs text-[#8B98B0]">Unofficial ratings are one person’s opinion, not the panel’s. They carry an amber badge.</p>
        )}

        {error ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-5 text-sm">
            <span className="text-[#F87171]">{error}</span>{' '}
            <button type="button" onClick={load} className="text-[#22D3EE] hover:text-[#67E8F9]">Try again</button>
          </section>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-[#131A2B] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-6 text-sm text-[#8B98B0]">
            {ratings.length === 0 ? 'No squad ratings have been published yet.' : 'Nothing matches those filters.'}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.slice(0, shown).map((r) => (
                <Link key={r.id} href={`/league/ratings/${r.id}`} className="group rounded-xl bg-[#131A2B] p-4 hover:bg-[#161e31] transition-colors flex flex-col">
                  <div className="flex items-start gap-3">
                    <span className="w-12 h-12 rounded-lg bg-[#1B2438] text-[#22D3EE] text-sm font-medium flex items-center justify-center shrink-0">
                      {(r.squad_tag || r.squad_name).slice(0, 4).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-display text-2xl leading-tight text-[#E6EDF7] group-hover:text-[#22D3EE] transition-colors truncate">{r.squad_name}</h2>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${r.is_official ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                          {r.is_official ? 'Official' : 'Unofficial'}
                        </span>
                      </div>
                      <div className="text-xs text-[#8B98B0] mt-0.5">
                        {r.league_slug && <span className="text-[#E6EDF7]">{r.league_slug.toUpperCase()}</span>}
                        {r.league_slug && r.season_name && ' · '}
                        {r.season_name}
                      </div>
                    </div>
                  </div>
                  {r.analyst_quote && (
                    <p className="mt-3 text-sm text-[#E6EDF7] italic leading-snug">“{r.analyst_quote}”</p>
                  )}
                  {r.breakdown_summary && (
                    <p className="mt-2 text-sm text-[#8B98B0] leading-snug line-clamp-3">{r.breakdown_summary}</p>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-[#8B98B0]">
                    <span>{analystName(r)} · {fmt(r.analysis_date || r.created_at)}</span>
                    <span className="inline-flex items-center gap-1 text-[#22D3EE]">Read <ChevronRight className="w-3 h-3" aria-hidden="true" /></span>
                  </div>
                </Link>
              ))}
            </div>
            {filtered.length > shown && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="px-4 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">
                  Show more ({filtered.length - shown} left)
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
