'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { LeagueInfo, LeagueSeason, SeasonStatus, SeasonPhase } from '@/lib/leagues';
import { formatDateOnly, leagueRulesHref, leagueStandingsHref } from '@/lib/leagues';

const STATUS: Record<SeasonStatus, { label: string; cls: string; dot: boolean }> = {
  active: { label: 'Active', cls: 'bg-[#34D399]/15 text-[#34D399]', dot: true },
  upcoming: { label: 'Upcoming', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]', dot: false },
  'off-season': { label: 'Off-season', cls: 'bg-white/5 text-[#8B98B0]', dot: false },
};

export interface SeasonHeroProps {
  league: LeagueInfo;
  season: LeagueSeason | null;
  status: SeasonStatus;
  phase: SeasonPhase;
  /** Registered players in the pool for this season (draft/OvD leagues). */
  registered?: number | null;
  /** Squads/teams entered so far. */
  teams?: number | null;
  /** Live draft state for draft leagues, drives the Draft button. */
  draft?: { status: 'setup' | 'live' | 'paused' | 'complete' } | null;
  /** The signed-in viewer's registration for this season. */
  viewerRegistered?: boolean;
}

/**
 * Compact season strip that replaces the carousel: what league is running,
 * where the season is, what's next, and the four things a player wants to do.
 */
export default function SeasonHero({
  league,
  season,
  status,
  phase,
  registered,
  teams,
  draft,
  viewerRegistered,
}: SeasonHeroProps) {
  const s = STATUS[status];
  const seasonName = season
    ? season.season_name && season.season_name.toLowerCase() !== `season ${season.season_number}`
      ? `Season ${season.season_number} · ${season.season_name}`
      : `Season ${season.season_number}`
    : null;
  const next = phase.milestones.find((m) => !m.past);
  const isDraft = league.format === 'draft';
  const registrationOpen = status !== 'off-season' && !phase.milestones.some((m) => m.label === 'Registration closes' && m.past);

  const draftHref = isDraft
    ? draft?.status === 'complete'
      ? '/league/ctfdl/draft/recap'
      : '/league/ctfdl/draft'
    : null;
  const draftLabel =
    draft?.status === 'live' || draft?.status === 'paused'
      ? 'Draft is live'
      : draft?.status === 'complete'
        ? 'Draft recap'
        : 'Draft room';

  const facts: { label: string; value: string }[] = [];
  if (typeof registered === 'number') facts.push({ label: 'Registered', value: String(registered) });
  if (typeof teams === 'number' && teams > 0) facts.push({ label: isDraft ? 'Captains' : 'Squads', value: String(teams) });

  return (
    <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 20%, rgba(34,211,238,0.14), transparent 40%), radial-gradient(circle at 88% 90%, rgba(245,158,11,0.09), transparent 45%)',
        }}
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none select-none overflow-hidden">
        <span className="font-display leading-none tracking-tight text-white/[0.035] whitespace-nowrap text-[7rem] sm:text-[9rem]">
          {league.name}
        </span>
      </div>

      <div className="relative px-5 py-5 sm:px-6 flex flex-col lg:flex-row lg:items-end gap-5">
        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-5xl sm:text-6xl leading-none text-[#E6EDF7]">{league.name}</h1>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
              {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {s.label}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
            {seasonName && <span className="text-[#E6EDF7]">{seasonName}</span>}
            {seasonName && <span className="text-white/20">·</span>}
            <span className="text-[#F59E0B] font-medium">{phase.label}</span>
            {next && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[#8B98B0]">
                  {next.label} <span className="text-[#E6EDF7]">{formatDateOnly(next.date)}</span>
                </span>
              </>
            )}
            {facts.map((f) => (
              <span key={f.label} className="text-[#8B98B0]">
                <span className="text-white/20 mr-3">·</span>
                <span className="text-[#E6EDF7] tabular-nums">{f.value}</span> {f.label.toLowerCase()}
              </span>
            ))}
          </div>
          {league.description && (
            <p className="mt-1.5 text-sm text-[#8B98B0] max-w-xl">
              {league.description}
              {league.tagline ? ` · ${league.tagline}` : ''}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
          {status !== 'off-season' && (
            <Link
              href={viewerRegistered ? '/free-agents' : '/league/register'}
              className={`px-3.5 py-2 rounded-md text-sm font-medium transition-colors ${
                registrationOpen && !viewerRegistered
                  ? 'bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9]'
                  : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'
              }`}
            >
              {viewerRegistered ? 'You’re registered' : registrationOpen ? 'Register' : 'Player pool'}
            </Link>
          )}
          <Link
            href={leagueStandingsHref(league)}
            className="px-3.5 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors"
          >
            Standings
          </Link>
          {draftHref && (
            <Link
              href={draftHref}
              className={`px-3.5 py-2 rounded-md text-sm transition-colors ${
                draft?.status === 'live' || draft?.status === 'paused'
                  ? 'bg-[#F59E0B] text-[#0B0F1A] hover:bg-[#FBBF24]'
                  : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'
              }`}
            >
              {draftLabel}
            </Link>
          )}
          <Link
            href={leagueRulesHref(league)}
            className="px-3.5 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors"
          >
            Rules
          </Link>
          <Link
            href="/league/standings"
            className="inline-flex items-center gap-1 px-2 py-2 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors"
          >
            All leagues <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Milestone rail */}
      {phase.milestones.length > 0 && (
        <div className="relative border-t border-white/[0.06] px-5 sm:px-6 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {phase.milestones.map((m) => (
            <span key={`${m.label}-${m.date}`} className={m.past ? 'text-[#8B98B0]/60 line-through decoration-white/20' : 'text-[#8B98B0]'}>
              {m.label} <span className={m.past ? '' : 'text-[#E6EDF7]'}>{formatDateOnly(m.date)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
