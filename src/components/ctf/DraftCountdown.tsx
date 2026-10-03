'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getLeagues, pickFeatured, getOpenSeason, getSeasonDraft, registrationClosesAt,
  type LeagueInfo, type LeagueSeason,
} from '@/lib/leagues';

type DraftStatus = 'setup' | 'live' | 'paused' | 'complete';
type Here = 'league' | 'register' | 'mock' | 'draft';

/**
 * Draft-day countdown, driven by the season's draft start time (league_seasons.draft_at).
 *
 *   before the draft   "Draft starts in 11h 02m 41s", with the sign-up cut-off (an hour before)
 *   at the hour        "Starting any moment" until staff start it
 *   draft running      "The draft is live" with a Watch button
 *   draft complete     nothing
 *
 * `variant="strip"` is the row inside the league page's season strip (it is handed the season and
 * draft state it already has). `variant="banner"` stands alone on the register, mock draft and
 * draft lobby pages and loads what it needs. `here` hides the button that would point at the
 * page you are already on.
 */
export default function DraftCountdown({
  variant = 'banner',
  here,
  league: leagueProp,
  season: seasonProp,
  draftStatus: statusProp,
  viewerRegistered,
}: {
  variant?: 'strip' | 'banner';
  here: Here;
  league?: LeagueInfo | null;
  season?: LeagueSeason | null;
  draftStatus?: DraftStatus | null;
  viewerRegistered?: boolean;
}) {
  const selfLoad = leagueProp === undefined;
  const [league, setLeague] = useState<LeagueInfo | null>(leagueProp ?? null);
  const [season, setSeason] = useState<LeagueSeason | null>(seasonProp ?? null);
  const [status, setStatus] = useState<DraftStatus | null>(statusProp ?? null);
  // Clock starts after mount so the server render and the browser never disagree.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => { if (!selfLoad) { setLeague(leagueProp ?? null); setSeason(seasonProp ?? null); setStatus(statusProp ?? null); } }, [selfLoad, leagueProp, seasonProp, statusProp]);

  useEffect(() => {
    if (!selfLoad) return;
    let cancelled = false;
    (async () => {
      try {
        const L = pickFeatured(await getLeagues());
        if (!L || cancelled) return;
        const S = await getOpenSeason(L);
        if (cancelled) return;
        setLeague(L); setSeason(S);
        if (S && L.format === 'draft') {
          const d = await getSeasonDraft(S.id).catch(() => null);
          if (!cancelled) setStatus((d?.status as DraftStatus) ?? null);
        }
      } catch { /* the banner is decoration: stay hidden */ }
    })();
    return () => { cancelled = true; };
  }, [selfLoad]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Around the start, keep checking whether staff have started the draft.
  const draftAt = season?.draft_at ? new Date(season.draft_at).getTime() : NaN;
  const nearStart = now !== null && !Number.isNaN(draftAt) && now > draftAt - 10 * 60_000;
  useEffect(() => {
    if (!selfLoad || !season || !nearStart || status === 'complete') return;
    const t = setInterval(async () => {
      const d = await getSeasonDraft(season.id).catch(() => null);
      if (d?.status) setStatus(d.status as DraftStatus);
    }, 20_000);
    return () => clearInterval(t);
  }, [selfLoad, season, nearStart, status]);

  if (!league || league.format !== 'draft' || !season || Number.isNaN(draftAt) || now === null) return null;
  if (status === 'complete') return null;

  const live = status === 'live' || status === 'paused';
  if (live && here === 'draft') return null; // the lobby itself is the live draft
  const left = draftAt - now;
  const closesAt = registrationClosesAt(season)?.getTime() ?? null;
  const signupsLeft = closesAt !== null ? closesAt - now : null;
  // A draft time long past with the draft never started is stale, not hype.
  if (!live && left < -6 * 3_600_000) return null;

  const parts = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  };
  const short = (ms: number) => {
    const p = parts(ms);
    return p.d > 0 ? `${p.d}d ${p.h}h` : p.h > 0 ? `${p.h}h ${String(p.m).padStart(2, '0')}m` : `${p.m}m ${String(p.s).padStart(2, '0')}s`;
  };
  const p = parts(left);
  const startsLocal = new Date(draftAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  const Unit = ({ value, label }: { value: number; label: string }) => (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="font-display tabular-nums leading-none text-[#F59E0B] text-4xl sm:text-5xl">{String(value).padStart(2, '0')}</span>
      <span className="text-[11px] uppercase tracking-wide text-[#F59E0B]/70">{label}</span>
    </span>
  );

  const btn = 'px-3.5 py-2 rounded-md text-sm transition-colors';
  const primary = `${btn} font-medium bg-[#F59E0B] text-[#0B0F1A] hover:bg-[#FBBF24]`;
  const quiet = `${btn} bg-white/5 text-[#E6EDF7] hover:bg-white/10`;
  const signupsOpen = signupsLeft !== null && signupsLeft > 0;

  const actions = (
    <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
      {live ? (
        here !== 'draft' && <Link href="/league/ctfdl/draft" className={primary}>Watch the draft</Link>
      ) : (
        <>
          {signupsOpen && !viewerRegistered && here !== 'register' && <Link href="/league/register" className={primary}>Register before it closes</Link>}
          {here !== 'mock' && <Link href="/league/ctfdl/mock-draft" className={quiet}>Predict the draft</Link>}
          {here !== 'draft' && <Link href="/league/ctfdl/draft" className={quiet}>Draft lobby</Link>}
        </>
      )}
    </div>
  );

  const body = (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
      <div className="min-w-0 flex-1">
        {live ? (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
              <span className="font-display text-3xl sm:text-4xl leading-none text-[#F59E0B]">The draft is live</span>
            </div>
            <div className="mt-1 text-xs text-[#8B98B0]">{league.name} Season {season.season_number} · {status === 'paused' ? 'paused for a moment' : 'captains are on the clock'}</div>
          </>
        ) : left <= 0 ? (
          <>
            <div className="font-display text-3xl sm:text-4xl leading-none text-[#F59E0B]">Draft starting any moment</div>
            <div className="mt-1 text-xs text-[#8B98B0]">{league.name} Season {season.season_number} · scheduled for {startsLocal}</div>
          </>
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#F59E0B]/80 mb-1">{league.name} Season {season.season_number} · draft starts in</div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-label={`Draft starts in ${short(left)}`}>
              {p.d > 0 && <Unit value={p.d} label={p.d === 1 ? 'day' : 'days'} />}
              <Unit value={p.h} label="hr" />
              <Unit value={p.m} label="min" />
              <Unit value={p.s} label="sec" />
            </div>
            <div className="mt-1 text-xs text-[#8B98B0]">
              {startsLocal}
              {signupsLeft !== null && (
                <>
                  <span className="text-white/20 mx-2">·</span>
                  {signupsOpen ? <>Sign-ups close in <span className="text-[#E6EDF7] tabular-nums">{short(signupsLeft)}</span></> : 'Sign-ups are closed'}
                </>
              )}
            </div>
          </>
        )}
      </div>
      {actions}
    </div>
  );

  if (variant === 'strip') {
    return <div className="relative border-t border-white/[0.06] px-5 sm:px-6 py-3 bg-[#F59E0B]/[0.04]">{body}</div>;
  }
  return (
    <section className="relative overflow-hidden rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 px-5 sm:px-6 py-4 mb-4">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 8% 30%, rgba(245,158,11,0.12), transparent 45%)' }} />
      <div className="relative">{body}</div>
    </section>
  );
}
