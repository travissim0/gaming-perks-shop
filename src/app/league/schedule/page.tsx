'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Pencil } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';
import {
  getLeagues,
  pickFeatured,
  getSeasonStatus,
  getStandings,
  getSeasonDraft,
  seasonPhase,
  formatDateOnly,
  leagueStandingsHref,
  leagueRulesHref,
  type LeagueInfo,
  type LeagueSeason,
  type SeasonStatus,
  type StandingRow,
} from '@/lib/leagues';
import { playoffRoundLabel, type TeamRef } from '@/lib/schedule';
import ScheduleStaffTools, { FixtureEditor } from '@/components/ctf/ScheduleStaffTools';
import type { Fixture } from '@/app/api/league/schedule/route';
import { displayFont, bodyFont } from '@/lib/fonts';

type Filter = 'upcoming' | 'results' | 'all';

const STATUS_PILL: Record<SeasonStatus, string> = {
  active: 'bg-[#34D399]/15 text-[#34D399]',
  upcoming: 'bg-[#F59E0B]/15 text-[#F59E0B]',
  'off-season': 'bg-white/5 text-[#8B98B0]',
};

const tz = () => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
};

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function TeamMark({ tag, name }: { tag: string | null; name: string | null }) {
  return (
    <span className="w-8 h-8 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">
      {(tag || name || '?').slice(0, 4).toUpperCase()}
    </span>
  );
}

function SchedulePage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const slugParam = params.get('league');

  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [season, setSeason] = useState<LeagueSeason | null>(null);
  const [status, setStatus] = useState<SeasonStatus>('off-season');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [pendingSql, setPendingSql] = useState(false);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [draftDone, setDraftDone] = useState<boolean | undefined>(undefined);
  const [isStaff, setIsStaff] = useState(false);
  const [mySquads, setMySquads] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [editing, setEditing] = useState<string | null>(null);
  // Timezone label only after mount (server and browser zones differ → hydration mismatch otherwise).
  const [tzLabel, setTzLabel] = useState('');
  useEffect(() => { setTzLabel(tz()); }, []);

  const league = useMemo(
    () => (slugParam ? leagues.find((l) => l.slug === slugParam) || null : pickFeatured(leagues)),
    [leagues, slugParam],
  );

  useEffect(() => {
    (async () => {
      setLeagues(await getLeagues());
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!user) { setIsStaff(false); setMySquads(new Set()); return; }
    (async () => {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle(),
        supabase.from('squad_members').select('squad_id').eq('user_id', user.id).eq('status', 'active'),
      ]);
      setIsStaff(!!p && (p.is_admin === true || p.ctf_role === 'ctf_admin'));
      setMySquads(new Set((m || []).map((r: any) => r.squad_id)));
    })();
  }, [user]);

  const loadFixtures = useCallback(async (L: LeagueInfo, S: LeagueSeason) => {
    try {
      const res = await fetch(`/api/league/schedule?league=${encodeURIComponent(L.slug)}&season=${S.season_number}`, { cache: 'no-store' });
      const json = await res.json();
      setFixtures(Array.isArray(json.fixtures) ? json.fixtures : []);
      setPendingSql(!!json.pending_sql);
    } catch (e) {
      console.error('schedule load failed', e);
      setFixtures([]);
    }
  }, []);

  useEffect(() => {
    if (!league) return;
    let cancelled = false;
    (async () => {
      const { season: S, status: st } = await getSeasonStatus(league);
      if (cancelled) return;
      setSeason(S);
      setStatus(st);
      if (!S) { setFixtures([]); setTeams([]); setStandings([]); return; }

      const [st50, draft] = await Promise.all([
        getStandings(league, S, 50),
        league.format === 'draft' ? getSeasonDraft(S.id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setStandings(st50);
      setDraftDone(league.format === 'draft' ? draft?.status === 'complete' : undefined);

      if (league.format === 'draft') {
        setTeams((draft?.teams || []).map((t) => ({ id: t.id, name: t.name, tag: t.tag })));
      } else {
        const withLeague = await supabase.from('squads').select('id, name, tag, league_slug, is_legacy').eq('is_active', true).order('name');
        const rows: any[] = withLeague.error
          ? (await supabase.from('squads').select('id, name, tag').eq('is_active', true).order('name')).data || []
          : (withLeague.data || []).filter((s: any) => !s.is_legacy && (s.league_slug === league.slug || !s.league_slug));
        if (!cancelled) setTeams(rows.map((s) => ({ id: s.id, name: s.name, tag: s.tag ?? null })));
      }
      await loadFixtures(league, S);
    })();
    return () => { cancelled = true; };
  }, [league, loadFixtures]);

  const refresh = useCallback(() => { if (league && season) loadFixtures(league, season); }, [league, season, loadFixtures]);

  // ── Derived ─────────────────────────────────────────────────────────
  const phase = league ? seasonPhase(league, season, status, { draftDone }) : null;
  const now = Date.now();
  const isDone = (f: Fixture) => !!f.result || f.status === 'completed';
  const visible = fixtures.filter((f) => (filter === 'all' ? true : filter === 'results' ? isDone(f) : !isDone(f)));
  const myNext = fixtures.find((f) => !isDone(f) && ((f.squad_a_id && mySquads.has(f.squad_a_id)) || (f.squad_b_id && mySquads.has(f.squad_b_id))));

  // Group: regular by week, playoffs by round.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; sub: string; items: Fixture[]; order: number }>();
    for (const f of visible) {
      const key = f.stage === 'playoff' ? `p${f.playoff_round || 1}` : `w${f.week || 0}`;
      if (!map.has(key)) {
        const inRound = fixtures.filter((x) => x.stage === 'playoff' && x.playoff_round === f.playoff_round).length * 2;
        map.set(key, {
          label: f.stage === 'playoff' ? `Playoffs · ${playoffRoundLabel(inRound)}` : `Week ${f.week ?? '–'}`,
          sub: dayLabel(f.scheduled_at),
          items: [],
          order: f.stage === 'playoff' ? 1000 + (f.playoff_round || 1) : f.week || 0,
        });
      }
      map.get(key)!.items.push(f);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [visible, fixtures]);

  const counts = {
    upcoming: fixtures.filter((f) => !isDone(f)).length,
    results: fixtures.filter(isDone).length,
    all: fixtures.length,
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">{league ? `${league.name} schedule` : 'Schedule'}</h1>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
                {!loaded ? (
                  <span className="text-[#8B98B0]">Loading…</span>
                ) : !league ? (
                  <span className="text-[#8B98B0]">League not found</span>
                ) : season ? (
                  <>
                    <span className="text-[#E6EDF7]">Season {season.season_number}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>
                      {status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                      {status === 'active' ? 'Active' : status === 'upcoming' ? 'Upcoming' : 'Off-season'}
                    </span>
                    {phase && <span className="text-[#F59E0B] font-medium">{phase.label}</span>}
                    {season.start_date && <span className="text-[#8B98B0]">Starts {formatDateOnly(season.start_date)}</span>}
                    <span className="text-[#8B98B0]">Times shown in your zone{tzLabel ? ` (${tzLabel})` : ''}</span>
                  </>
                ) : (
                  <span className="text-[#8B98B0]">No season yet</span>
                )}
              </div>
            </div>
            {league && (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <div className="flex rounded-md bg-white/5 p-0.5">
                  {leagues.map((l) => (
                    <Link
                      key={l.id}
                      href={`/league/schedule?league=${encodeURIComponent(l.slug)}`}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${l.id === league.id ? 'bg-[#22D3EE] text-[#0B0F1A] font-medium' : 'text-[#E6EDF7] hover:bg-white/10'}`}
                    >
                      {l.name}
                    </Link>
                  ))}
                </div>
                <Link href={leagueStandingsHref(league)} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Standings</Link>
                <Link href={leagueRulesHref(league)} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Rules</Link>
                <Link href="/matches" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
                  Match log <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Staff tools */}
        {isStaff && league && season && (
          pendingSql ? (
            <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 px-4 py-3 text-sm text-[#E6EDF7]">
              Run <code className="text-[#F59E0B]">add-league-schedule.sql</code> in Supabase to enable the schedule tools.
            </section>
          ) : (
            <ScheduleStaffTools league={league} season={season} teams={teams} fixtures={fixtures} standings={standings} onChanged={refresh} />
          )
        )}

        {/* Your next match */}
        {myNext && (
          <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#22D3EE]/40 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-[#22D3EE]">Your next match</span>
            <span className="text-sm text-[#E6EDF7]">
              {myNext.squad_a_name} <span className="text-[#8B98B0]">vs</span> {myNext.squad_b_name}
            </span>
            <span className="text-sm text-[#8B98B0]">{dayLabel(myNext.scheduled_at)} · {timeLabel(myNext.scheduled_at)}</span>
            <Link href={`/matches/${myNext.id}`} className="ml-auto text-xs text-[#22D3EE] hover:text-[#67E8F9]">Details</Link>
          </section>
        )}

        {/* Filter chips */}
        {fixtures.length > 0 && (
          <div className="flex gap-1">
            {(['upcoming', 'results', 'all'] as Filter[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${filter === k ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}
              >
                {k === 'upcoming' ? 'Upcoming' : k === 'results' ? 'Results' : 'All'} <span className="tabular-nums opacity-70">{counts[k]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Fixtures */}
        {groups.length === 0 ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-6 text-sm text-[#8B98B0]">
            {!loaded || !league ? (
              'Loading…'
            ) : fixtures.length > 0 ? (
              filter === 'upcoming' ? 'Nothing left to play. Switch to Results to see how the season went.' : 'No results yet.'
            ) : league.format === 'draft' && !draftDone ? (
              <>
                The schedule is published once the draft is done.{' '}
                <Link href="/league/register" className="text-[#22D3EE] hover:text-[#67E8F9]">Register for the season</Link>
              </>
            ) : status === 'off-season' ? (
              'No season is running.'
            ) : (
              'The schedule hasn’t been published yet.'
            )}
          </section>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="rounded-xl overflow-hidden bg-[#131A2B]">
              <div className="px-4 py-2.5 flex items-baseline justify-between">
                <h2 className="font-display text-lg text-[#E6EDF7]">{g.label}</h2>
                <span className="text-xs text-[#8B98B0]">{g.sub}</span>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {g.items.map((f) => {
                  const done = isDone(f);
                  const live = !done && f.status === 'in_progress';
                  const soon = !done && !live && new Date(f.scheduled_at).getTime() - now < 3 * 3600 * 1000 && new Date(f.scheduled_at).getTime() > now - 2 * 3600 * 1000;
                  const aWon = f.result ? /win/i.test(f.result.a_result || '') || f.result.a_score > f.result.b_score : false;
                  const bWon = f.result ? /win/i.test(f.result.b_result || '') || f.result.b_score > f.result.a_score : false;
                  const mine = (f.squad_a_id && mySquads.has(f.squad_a_id)) || (f.squad_b_id && mySquads.has(f.squad_b_id));
                  const crew = f.participants.filter((p) => p.role !== 'player');
                  return (
                    <li key={f.id} className={`px-4 py-2.5 ${mine ? 'bg-[#22D3EE]/[0.04]' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-24 shrink-0 text-xs text-[#8B98B0] tabular-nums">
                          <div>{dayLabel(f.scheduled_at)}</div>
                          <div className="text-[#E6EDF7]">{timeLabel(f.scheduled_at)}</div>
                        </div>
                        <Link href={f.squad_a_id ? `/squads/${f.squad_a_id}` : '#'} className={`flex items-center gap-2 min-w-0 flex-1 justify-end text-right ${aWon ? 'text-[#E6EDF7]' : done ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'} hover:text-[#22D3EE]`}>
                          <span className="text-sm truncate">{f.squad_a_name || 'TBD'}</span>
                          <TeamMark tag={f.squad_a_tag} name={f.squad_a_name} />
                        </Link>
                        <div className="w-24 shrink-0 text-center">
                          {f.result ? (
                            <span className="font-display text-2xl tabular-nums">
                              <span className={aWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{f.result.a_score}</span>
                              <span className="text-white/20 mx-1.5">:</span>
                              <span className={bWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{f.result.b_score}</span>
                            </span>
                          ) : live ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#34D399]/15 text-[#34D399]">
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Live
                            </span>
                          ) : done ? (
                            <span className="text-[11px] text-[#8B98B0]">Played</span>
                          ) : soon ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B]">Soon</span>
                          ) : (
                            <span className="text-xs text-[#8B98B0]">vs</span>
                          )}
                        </div>
                        <Link href={f.squad_b_id ? `/squads/${f.squad_b_id}` : '#'} className={`flex items-center gap-2 min-w-0 flex-1 ${bWon ? 'text-[#E6EDF7]' : done ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'} hover:text-[#22D3EE]`}>
                          <TeamMark tag={f.squad_b_tag} name={f.squad_b_name} />
                          <span className="text-sm truncate">{f.squad_b_name || 'TBD'}</span>
                        </Link>
                        <div className="hidden md:flex w-28 shrink-0 items-center justify-end gap-2 text-[11px] text-[#8B98B0]">
                          {crew.length > 0 && <span title={crew.map((c) => `${c.role}: ${c.alias}`).join('\n')}>{crew.length} crew</span>}
                          {f.vod_url && <a href={f.vod_url} target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:text-[#67E8F9]">Video</a>}
                          <Link href={`/matches/${f.id}`} className="hover:text-[#22D3EE]">Details</Link>
                          {isStaff && (
                            <button type="button" onClick={() => setEditing(editing === f.id ? null : f.id)} className="text-[#F59E0B] hover:text-[#FBBF24]" aria-label="Edit match">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="md:hidden mt-1 pl-[6.75rem] flex gap-3 text-[11px] text-[#8B98B0]">
                        <Link href={`/matches/${f.id}`} className="hover:text-[#22D3EE]">Details</Link>
                        {isStaff && <button type="button" onClick={() => setEditing(editing === f.id ? null : f.id)} className="text-[#F59E0B]">Edit</button>}
                      </div>
                      {isStaff && editing === f.id && (
                        <FixtureEditor fixture={f} teams={teams} onDone={() => { setEditing(null); refresh(); }} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {fixtures.length > 0 && (
          <p className="text-[11px] text-[#8B98B0] px-1">
            Results come from the reported league matches. Sign up to ref, cast or record a match from its details page.
          </p>
        )}
      </main>
    </div>
  );
}

export default function LeagueSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
          <Navbar user={null} />
        </div>
      }
    >
      <SchedulePage />
    </Suspense>
  );
}
