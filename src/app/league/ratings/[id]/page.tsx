'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import type { SquadRatingWithDetails, PlayerRatingWithDetails } from '@/types/database';
import { SYSTEM_USER_ID } from '@/lib/constants';
import { getRatingColor, getStarDisplay } from '@/utils/ratingUtils';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/** One squad rating: the analyst's quote and commentary, then per-player notes. */

type Rating = SquadRatingWithDetails & { league_slug?: string | null; squad_id?: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function SquadRatingPage() {
  const { user } = useAuth();
  const params = useParams();
  const [rating, setRating] = useState<Rating | null>(null);
  const [players, setPlayers] = useState<PlayerRatingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const res = await fetch(`/api/squad-ratings/${params.id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load this rating');
        setRating(json.squad_rating);
        setPlayers(json.player_ratings || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const analyst = rating ? (rating.analyst_id === SYSTEM_USER_ID ? 'Anonymous' : rating.analyst_alias || 'Anonymous') : '';

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-4">
        <Link href="/league/ratings" className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE]">
          <ChevronLeft className="w-3.5 h-3.5" /> Squad ratings
        </Link>
        {children}
      </main>
    </div>
  );

  if (loading) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8 animate-pulse space-y-3">
        <div className="h-3 w-40 rounded bg-white/5" />
        <div className="h-12 w-2/3 rounded bg-white/5" />
        <div className="h-24 rounded bg-white/5" />
      </section>,
    );
  }
  if (error || !rating) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8">
        <h1 className="font-display text-4xl text-[#E6EDF7]">Rating not found</h1>
        <p className="text-sm text-[#8B98B0] mt-2">{error || 'It may have been removed.'}</p>
      </section>,
    );
  }

  const sorted = [...players].sort((a, b) => b.rating - a.rating);

  return shell(
    <>
      {/* Header strip */}
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative px-5 sm:px-6 py-5 flex items-start gap-4">
          <span className="w-16 h-16 rounded-lg bg-[#1B2438] text-[#22D3EE] text-lg font-medium flex items-center justify-center shrink-0">
            {(rating.squad_tag || rating.squad_name).slice(0, 4).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-[11px] mb-1">
              <span className={`px-1.5 py-0.5 rounded uppercase tracking-wide font-medium ${rating.is_official ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                {rating.is_official ? 'Official rating' : 'Unofficial rating'}
              </span>
              {rating.league_slug && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[#8B98B0] uppercase tracking-wide">{rating.league_slug}</span>}
              {rating.season_name && <span className="text-[#8B98B0]">{rating.season_name}</span>}
            </div>
            <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">
              {rating.squad_id ? <Link href={`/squads/${rating.squad_id}`} className="hover:text-[#22D3EE]">{rating.squad_name}</Link> : rating.squad_name}
            </h1>
            <div className="mt-2 text-sm text-[#8B98B0]">
              By <span className="text-[#E6EDF7]">{analyst}</span> · {fmt(rating.analysis_date || rating.created_at)}
              {rating.updated_at && rating.updated_at !== rating.created_at && <> · updated {fmt(rating.updated_at)}</>}
            </div>
            {!rating.is_official && <p className="mt-1.5 text-xs text-[#F59E0B]">One person’s opinion, not the panel’s.</p>}
          </div>
        </div>
      </section>

      {rating.analyst_quote && (
        <blockquote className="rounded-xl bg-[#131A2B] px-5 sm:px-6 py-5 border-l-4 border-[#22D3EE]">
          <p className="font-display text-2xl sm:text-3xl leading-tight text-[#E6EDF7]">“{rating.analyst_quote}”</p>
          <cite className="block mt-2 text-sm text-[#8B98B0] not-italic">{analyst}</cite>
        </blockquote>
      )}

      {rating.analyst_commentary && (
        <section className="rounded-xl bg-[#131A2B] px-5 sm:px-6 py-5">
          <h2 className="font-display text-xl text-[#E6EDF7] mb-3">Commentary</h2>
          <div className="rules-prose whitespace-pre-line">{rating.analyst_commentary}</div>
        </section>
      )}

      {rating.breakdown_summary && (
        <section className="rounded-xl bg-[#131A2B] px-5 sm:px-6 py-5">
          <h2 className="font-display text-xl text-[#E6EDF7] mb-3">Breakdown</h2>
          <div className="rules-prose whitespace-pre-line">{rating.breakdown_summary}</div>
        </section>
      )}

      {sorted.length > 0 && (
        <section className="rounded-xl overflow-hidden bg-[#131A2B]">
          <div className="px-5 sm:px-6 py-3 flex items-center justify-between">
            <h2 className="font-display text-xl text-[#E6EDF7]">Players</h2>
            <span className="text-xs text-[#8B98B0]">Rated out of 6</span>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {sorted.map((p) => (
              <li key={p.id} className="px-5 sm:px-6 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Link href={`/stats/player/${encodeURIComponent(p.player_alias)}`} className="font-display text-xl text-[#E6EDF7] hover:text-[#22D3EE]">{p.player_alias}</Link>
                  <span className="flex items-center gap-1.5">{getStarDisplay(p.rating)}</span>
                  <span className={`text-sm font-medium tabular-nums ${getRatingColor(p.rating)}`}>{p.rating}</span>
                </div>
                {p.notes && <p className="mt-1.5 text-sm text-[#8B98B0] leading-snug whitespace-pre-line">{p.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>,
  );
}
