'use client';

import Link from 'next/link';
import { Trophy, Shield, Users, Swords, ChevronRight, type LucideIcon } from 'lucide-react';
import type { LeagueInfo, LeagueSeason, SeasonStatus, StandingRow } from '@/lib/leagues';
import { leagueStandingsHref, leagueRulesHref } from '@/lib/leagues';

export interface LeagueStatusEntry {
  league: LeagueInfo;
  status: SeasonStatus;
  season: LeagueSeason | null;
}

export interface LeagueStatusData {
  entries: LeagueStatusEntry[];
  featured: LeagueStatusEntry | null;
  standings: StandingRow[];
}

const FORMAT_ICON: Record<string, LucideIcon> = {
  squad: Shield,
  draft: Users,
  ovd: Swords,
};

const STATUS: Record<SeasonStatus, { label: string; cls: string; dot: boolean }> = {
  active: { label: 'Active', cls: 'bg-[#34D399]/15 text-[#34D399]', dot: true },
  upcoming: { label: 'Upcoming', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]', dot: false },
  'off-season': { label: 'Off-season', cls: 'bg-white/5 text-[#8B98B0]', dot: false },
};

function StatusPill({ status }: { status: SeasonStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {s.label}
    </span>
  );
}

const seasonLabel = (s: LeagueSeason | null) =>
  s ? s.season_name || `Season ${s.season_number}` : null;

/**
 * "League status" — the featured (currently running) league up top with a
 * standings snippet and CTAs, then a strip of every league with its status.
 * Presentational: the page fetches via the league adapters and passes data in.
 */
export default function LeagueStatusSection({ data }: { data: LeagueStatusData | null }) {
  if (!data || !data.featured) return null;
  const { featured, entries, standings } = data;
  const L = featured.league;
  const label = seasonLabel(featured.season);

  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#22D3EE]" aria-hidden="true" />
          <h3 className="font-display text-xl text-[#E6EDF7]">League status</h3>
        </div>
        <Link
          href="/league/standings"
          className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE] transition-colors"
        >
          All standings <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Featured league */}
        <div className="rounded-lg bg-[#1B2438] p-4">
          <div className="flex items-start justify-between gap-5 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-display text-3xl leading-none text-[#E6EDF7]">{L.name}</span>
                <StatusPill status={featured.status} />
              </div>
              <div className="text-sm text-[#8B98B0]">
                {L.description}
                {L.tagline ? ` · ${L.tagline}` : ''}
              </div>
              {label && <div className="text-sm text-[#E6EDF7] mt-1">{label}</div>}
              <div className="flex gap-2 mt-3 flex-wrap">
                <Link
                  href={leagueStandingsHref(L)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] transition-colors"
                >
                  Standings
                </Link>
                <Link
                  href={leagueRulesHref(L)}
                  className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors"
                >
                  Rules
                </Link>
                <Link
                  href="/league/register"
                  className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors"
                >
                  Register
                </Link>
              </div>
            </div>

            {standings.length > 0 && (
              <div className="flex-1 min-w-[220px]">
                <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1.5">
                  Top {standings.length}
                </div>
                <div className="space-y-1">
                  {standings.map((row) => (
                    <Link
                      key={row.squad_id}
                      href={`/squads/${row.squad_id}`}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                    >
                      <span className="w-5 text-xs text-[#8B98B0] tabular-nums">{row.rank}</span>
                      <span className="w-7 h-7 rounded-md bg-[#131A2B] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">
                        {(row.squad_tag || row.squad_name).slice(0, 3).toUpperCase()}
                      </span>
                      <span className="flex-1 text-sm text-[#E6EDF7] truncate">{row.squad_name}</span>
                      <span className="text-sm text-[#8B98B0] tabular-nums">
                        {row.wins}-{row.losses}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* All leagues */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {entries.map((e) => {
            const Icon = FORMAT_ICON[e.league.format || ''] || Shield;
            const isFeatured = e.league.id === L.id;
            return (
              <Link
                key={e.league.id}
                href={leagueStandingsHref(e.league)}
                className={`rounded-lg p-3 transition-colors ${
                  isFeatured
                    ? 'bg-[#1B2438] ring-1 ring-[#22D3EE]/50'
                    : 'bg-[#1B2438]/60 hover:bg-[#1B2438]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isFeatured ? 'text-[#22D3EE]' : 'text-[#8B98B0]'}`}
                      aria-hidden="true"
                    />
                    <span className="font-display text-lg leading-none text-[#E6EDF7] truncate">
                      {e.league.name}
                    </span>
                  </div>
                  <StatusPill status={e.status} />
                </div>
                <div className="text-xs text-[#8B98B0] mt-1.5 truncate">
                  {e.league.tagline || e.league.description}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
