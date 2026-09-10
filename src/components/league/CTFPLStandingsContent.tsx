'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getSeasonDraft,
  formatDateOnly,
  leagueRulesHref,
  type LeagueInfo,
  type SeasonDraft,
} from '@/lib/leagues';

/*
 * Standings for one league. Data paths are unchanged from the original
 * CTFPL-only version: CTFPL reads ctfpl_seasons / ctfpl_standings_with_rankings /
 * ctfpl_matches, every other league reads league_seasons /
 * league_standings_with_rankings / league_matches by league_season_id.
 */

interface Standing {
  id: string;
  squad_id: string;
  matches_played: number;
  wins: number;
  losses: number;
  no_shows: number;
  overtime_wins: number;
  overtime_losses: number;
  points: number;
  kill_death_difference: number;
  win_percentage: number;
  regulation_wins: number;
  rank: number;
  points_behind: number;
  squad_name: string;
  squad_tag: string | null;
  banner_url?: string | null;
  captain_alias: string | null;
}

interface Season {
  id?: string;
  season_number: number;
  season_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  champion_squad_ids?: string[];
  runner_up_squad_ids?: string[];
}

interface MatchRow {
  id: string;
  match_type: string;
  team_a_name: string;
  team_b_name: string;
  team_a_kills: number;
  team_b_kills: number;
  team_a_result: string;
  team_b_result: string;
  match_date: string;
}

const MATCH_COLS =
  'id, match_type, team_a_name, team_b_name, team_a_kills, team_b_kills, team_a_result, team_b_result, match_date';

/** Scoring footnotes. Only leagues whose wording has been confirmed are listed. */
const SCORING: Record<string, string[]> = {
  ctfpl: [
    '3 points for a win (regulation or overtime)',
    '1 point for participation (loss)',
    '0 points for a no-show',
    'Tiebreakers: points, win %, regulation wins, overtime wins, K/D',
  ],
};

const seasonTitle = (s: Season | null) => {
  if (!s) return '';
  const name = s.season_name?.trim();
  const generic = `Season ${s.season_number}`;
  return name && name.toLowerCase() !== generic.toLowerCase() ? `${generic} · ${name}` : generic;
};

const STATUS_PILL: Record<string, string> = {
  active: 'bg-[#34D399]/15 text-[#34D399]',
  upcoming: 'bg-[#F59E0B]/15 text-[#F59E0B]',
  completed: 'bg-white/5 text-[#8B98B0]',
};

function TeamMark({ tag, name, banner }: { tag: string | null; name: string; banner?: string | null }) {
  if (banner) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={banner} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />;
  }
  return (
    <span className="w-8 h-8 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">
      {(tag || name).slice(0, 4).toUpperCase()}
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#131A2B] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-[#8B98B0]">{label}</div>
      <div className="font-display text-3xl leading-none text-[#E6EDF7] mt-1 truncate">{value}</div>
      {sub && <div className="text-xs text-[#8B98B0] mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function CTFPLStandingsContent({
  league,
  leagues,
}: {
  league: LeagueInfo;
  /** Every league, for the switcher. */
  leagues: LeagueInfo[];
}) {
  const isCTFPL = league.data_source === 'ctfpl';
  const isDraft = league.format === 'draft';

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [draft, setDraft] = useState<SeasonDraft | null>(null);
  const [squadNames, setSquadNames] = useState<Map<string, { name: string; tag: string | null }>>(new Map());
  const [dataLoading, setDataLoading] = useState(false);

  // Reset when the league changes.
  useEffect(() => {
    setSeasons([]);
    setSelected(null);
    setStandings([]);
    setMatches([]);
    setDraft(null);
  }, [league.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSeasonsLoading(true);
      try {
        const q = isCTFPL
          ? supabase.from('ctfpl_seasons').select('*')
          : supabase.from('league_seasons').select('*').eq('league_id', league.id);
        const { data, error } = await q.order('season_number', { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        const list = (data || []) as Season[];
        setSeasons(list);
        // Default: the running season; otherwise the last completed one (an
        // upcoming season has nothing to show yet).
        const pick = list.find((s) => s.status === 'active') || list.find((s) => s.status === 'completed') || list[0];
        setSelected(pick ? pick.season_number : null);
      } catch (e) {
        console.error('Error loading seasons:', e);
      } finally {
        if (!cancelled) setSeasonsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [league.id, isCTFPL]);

  const season = useMemo(() => seasons.find((s) => s.season_number === selected) || null, [seasons, selected]);
  const current = useMemo(() => seasons.find((s) => s.status === 'active') || null, [seasons]);

  const load = useCallback(async () => {
    if (!season) return;
    setDataLoading(true);
    try {
      let standingsRows: any[] = [];
      let matchRows: any[] = [];
      if (isCTFPL) {
        const [s, m] = await Promise.all([
          supabase.from('ctfpl_standings_with_rankings').select('*').eq('season_number', season.season_number).order('rank'),
          supabase.from('ctfpl_matches').select(MATCH_COLS).eq('season_number', season.season_number).order('match_date', { ascending: true }),
        ]);
        standingsRows = s.data || [];
        matchRows = m.data || [];
      } else if (season.id) {
        const [s, m] = await Promise.all([
          supabase.from('league_standings_with_rankings').select('*').eq('league_season_id', season.id).order('rank'),
          supabase.from('league_matches').select(MATCH_COLS).eq('league_season_id', season.id).order('match_date', { ascending: true }),
        ]);
        standingsRows = s.data || [];
        matchRows = m.data || [];
      }
      setStandings(standingsRows as Standing[]);
      setMatches(matchRows as MatchRow[]);
      setDraft(isDraft && season.id ? await getSeasonDraft(season.id) : null);

      // Names for champion ids on completed seasons that pre-date the standings view.
      const ids = [...(season.champion_squad_ids || []), ...(season.runner_up_squad_ids || [])];
      if (ids.length) {
        const { data } = await supabase.from('squads').select('id, name, tag').in('id', ids);
        setSquadNames(new Map((data || []).map((s: any) => [s.id, { name: s.name, tag: s.tag ?? null }])));
      }
    } catch (e) {
      console.error('Error loading standings:', e);
    } finally {
      setDataLoading(false);
    }
  }, [season, isCTFPL, isDraft]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ─────────────────────────────────────────────────────────
  const idx = seasons.findIndex((s) => s.season_number === selected);
  const older = idx >= 0 && idx < seasons.length - 1 ? seasons[idx + 1] : null;
  const newer = idx > 0 ? seasons[idx - 1] : null;

  const played = matches.filter((m) => m.match_date && (m.team_a_result || m.team_b_result));
  const lastMatch = played.length ? played[played.length - 1] : null;
  const leader = standings.find((s) => s.matches_played > 0) || null;

  /** Last five results per team name, oldest → newest. */
  const form = useMemo(() => {
    const map = new Map<string, ('W' | 'L')[]>();
    for (const m of played) {
      const push = (team: string, r: string) => {
        const arr = map.get(team) || [];
        arr.push(/win/i.test(r) ? 'W' : 'L');
        map.set(team, arr);
      };
      if (m.team_a_name) push(m.team_a_name, m.team_a_result || '');
      if (m.team_b_name) push(m.team_b_name, m.team_b_result || '');
    }
    map.forEach((v, k) => map.set(k, v.slice(-5)));
    return map;
  }, [played]);

  const semis = played.filter((m) => m.match_type === 'Playoffs');
  const finals = played.filter((m) => m.match_type === 'Finals');
  const showBracket = season?.status === 'completed' && (semis.length > 0 || finals.length > 0);
  const showChampionCard = season?.status === 'completed' && !showBracket && !!season.champion_squad_ids?.length;
  const nameOf = (id: string) => {
    const s = standings.find((r) => r.squad_id === id);
    if (s) return `${s.squad_tag ? `[${s.squad_tag}] ` : ''}${s.squad_name}`;
    const q = squadNames.get(id);
    return q ? `${q.tag ? `[${q.tag}] ` : ''}${q.name}` : 'Unknown squad';
  };

  const hasStandings = standings.length > 0;
  const scoring = SCORING[league.slug];

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <main className="container mx-auto px-4 py-6 space-y-4">
      {/* Header strip: league, season, actions */}
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }}
        />
        <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
            <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">{league.name} standings</h1>
            <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
              {season ? (
                <>
                  <span className="text-[#E6EDF7]">{seasonTitle(season)}</span>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[season.status] || STATUS_PILL.completed}`}>
                    {season.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                    {season.status === 'active' ? 'Active' : season.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                  </span>
                  {(season.start_date || season.end_date) && (
                    <span className="text-[#8B98B0]">
                      {season.start_date ? formatDateOnly(season.start_date) : '…'} – {season.end_date ? formatDateOnly(season.end_date) : 'present'}
                    </span>
                  )}
                </>
              ) : seasonsLoading ? (
                <span className="text-[#8B98B0]">Loading seasons…</span>
              ) : (
                <span className="text-[#8B98B0]">No seasons yet</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* League switcher */}
            <div className="flex rounded-md bg-white/5 p-0.5">
              {leagues.map((l) => (
                <Link
                  key={l.id}
                  href={`/league/standings?league=${encodeURIComponent(l.slug)}`}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    l.id === league.id ? 'bg-[#22D3EE] text-[#0B0F1A] font-medium' : 'text-[#E6EDF7] hover:bg-white/10'
                  }`}
                >
                  {l.name}
                </Link>
              ))}
            </div>
            {/* Season picker */}
            {seasons.length > 0 && (
              <div className="flex items-center rounded-md bg-white/5">
                <button
                  type="button"
                  onClick={() => older && setSelected(older.season_number)}
                  disabled={!older || dataLoading}
                  className="p-2 text-[#8B98B0] hover:text-[#E6EDF7] disabled:opacity-30"
                  aria-label="Older season"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selected ?? ''}
                  onChange={(e) => setSelected(Number(e.target.value))}
                  disabled={dataLoading}
                  className="bg-transparent text-sm text-[#E6EDF7] py-1.5 pr-2 focus:outline-none"
                  style={{ colorScheme: 'dark' }}
                >
                  {seasons.map((s) => (
                    <option key={s.season_number} value={s.season_number} className="bg-[#131A2B]">
                      {seasonTitle(s)}{s.status === 'active' ? ' · current' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => newer && setSelected(newer.season_number)}
                  disabled={!newer || dataLoading}
                  className="p-2 text-[#8B98B0] hover:text-[#E6EDF7] disabled:opacity-30"
                  aria-label="Newer season"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <Link href="/league/compare" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">
              Compare squads
            </Link>
            <Link href={leagueRulesHref(league)} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">
              Rules
            </Link>
          </div>
        </div>
      </section>

      {/* Champion / bracket for completed seasons */}
      {showChampionCard && season && (
        <section className="rounded-xl bg-[#131A2B] px-5 py-4 flex items-center gap-4">
          <Crown className="w-8 h-8 text-[#F59E0B] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-[#F59E0B]">Champion</div>
            <div className="font-display text-2xl text-[#E6EDF7] leading-tight">
              {season.champion_squad_ids!.map(nameOf).join(' & ')}
            </div>
            {!!season.runner_up_squad_ids?.length && (
              <div className="text-sm text-[#8B98B0]">Runner-up · {season.runner_up_squad_ids.map(nameOf).join(', ')}</div>
            )}
          </div>
        </section>
      )}

      {showBracket && <Bracket semis={semis} finals={finals} />}

      {/* Tiles */}
      {hasStandings && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Teams" value={standings.length} />
          <Tile label="Matches played" value={played.length || Math.floor(standings.reduce((n, s) => n + s.matches_played, 0) / 2)} />
          <Tile
            label="Leader"
            value={leader ? leader.squad_tag || leader.squad_name : '—'}
            sub={leader ? `${leader.squad_name} · ${leader.wins}-${leader.losses} · ${leader.points} pts` : 'No matches yet'}
          />
          <Tile
            label="Last match"
            value={lastMatch ? formatDateOnly(lastMatch.match_date.slice(0, 10)) : '—'}
            sub={lastMatch ? `${lastMatch.team_a_name} ${lastMatch.team_a_kills} : ${lastMatch.team_b_kills} ${lastMatch.team_b_name}` : undefined}
          />
        </div>
      )}

      {/* Standings table */}
      <section className="rounded-xl overflow-hidden bg-[#131A2B]">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-[#E6EDF7]">{season ? seasonTitle(season) : 'Standings'}</h2>
          {dataLoading && <span className="text-xs text-[#8B98B0]">Updating…</span>}
        </div>

        {hasStandings ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0]">
                  <th className="text-left font-normal px-4 py-2 w-10">#</th>
                  <th className="text-left font-normal px-2 py-2">Team</th>
                  <th className="text-left font-normal px-2 py-2 hidden md:table-cell">Captain</th>
                  <th className="text-center font-normal px-2 py-2">MP</th>
                  <th className="text-center font-normal px-2 py-2">W</th>
                  <th className="text-center font-normal px-2 py-2">L</th>
                  {isCTFPL && <th className="text-center font-normal px-2 py-2">NS</th>}
                  {isCTFPL && <th className="text-center font-normal px-2 py-2">RW</th>}
                  {isCTFPL && <th className="text-center font-normal px-2 py-2">OTW</th>}
                  <th className="text-center font-normal px-2 py-2">Win %</th>
                  <th className="text-right font-normal px-2 py-2">Pts</th>
                  {isCTFPL && <th className="text-right font-normal px-2 py-2">K/D</th>}
                  <th className="text-left font-normal px-4 py-2">Form</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const playedAny = s.matches_played > 0;
                  const f = form.get(s.squad_name) || [];
                  return (
                    <tr key={s.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-medium tabular-nums ${
                            !playedAny
                              ? 'text-[#8B98B0]'
                              : s.rank === 1
                                ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                                : s.rank <= 3
                                  ? 'bg-[#22D3EE]/15 text-[#22D3EE]'
                                  : 'text-[#E6EDF7]'
                          }`}
                        >
                          {playedAny ? s.rank : '–'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <Link href={`/squads/${s.squad_id}`} className="flex items-center gap-2.5 min-w-0 hover:text-[#22D3EE] transition-colors">
                          <TeamMark tag={s.squad_tag} name={s.squad_name} banner={s.banner_url} />
                          <span className="min-w-0">
                            <span className="block text-[#E6EDF7] truncate">{s.squad_name}</span>
                            {s.squad_tag && <span className="block text-[11px] text-[#8B98B0]">[{s.squad_tag}]</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-[#8B98B0] hidden md:table-cell truncate max-w-[140px]">{s.captain_alias || '—'}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-[#E6EDF7]">{s.matches_played}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-[#34D399]">{s.wins}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-[#F87171]">{s.losses}</td>
                      {isCTFPL && <td className="px-2 py-2.5 text-center tabular-nums text-[#F59E0B]">{s.no_shows}</td>}
                      {isCTFPL && <td className="px-2 py-2.5 text-center tabular-nums text-[#E6EDF7]">{s.regulation_wins}</td>}
                      {isCTFPL && <td className="px-2 py-2.5 text-center tabular-nums text-[#E6EDF7]">{s.overtime_wins}</td>}
                      <td className="px-2 py-2.5 text-center tabular-nums text-[#E6EDF7]">{playedAny ? `${Math.round(s.win_percentage)}%` : '–'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <span className="text-[#F59E0B] font-medium">{s.points}</span>
                        {s.points_behind > 0 && <span className="text-[11px] text-[#8B98B0] ml-1">−{s.points_behind}</span>}
                      </td>
                      {isCTFPL && (
                        <td className={`px-2 py-2.5 text-right tabular-nums ${s.kill_death_difference >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'}`}>
                          {s.kill_death_difference >= 0 ? '+' : ''}{s.kill_death_difference}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <span className="inline-flex gap-1">
                          {f.length === 0 ? (
                            <span className="text-[#8B98B0] text-xs">–</span>
                          ) : (
                            f.map((r, i) => (
                              <span
                                key={i}
                                className={`w-4 h-4 rounded-sm text-[10px] font-medium flex items-center justify-center ${
                                  r === 'W' ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-[#F87171]/20 text-[#F87171]'
                                }`}
                              >
                                {r}
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : dataLoading || seasonsLoading ? (
          <div className="px-4 pb-4 space-y-2 animate-pulse">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-md bg-white/5" />)}
          </div>
        ) : isDraft && draft && draft.teams.length > 0 ? (
          <div className="px-4 pb-4">
            <p className="text-sm text-[#8B98B0] mb-3">
              {draft.status === 'complete'
                ? 'Teams are drafted. Standings fill in as matches are reported.'
                : 'Standings start once the draft is done and play begins. These are the captains so far.'}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {draft.teams.map((t) => (
                <li key={t.id}>
                  <Link href={`/squads/${t.id}`} className="flex items-center gap-3 rounded-lg bg-[#1B2438] px-3 py-2.5 hover:bg-[#222d45] transition-colors">
                    <TeamMark tag={t.tag} name={t.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[#E6EDF7] truncate">{t.name}</span>
                      <span className="block text-[11px] text-[#8B98B0] truncate">
                        Captain {t.captain_alias}{draft.status === 'complete' ? ` · ${t.member_count} players` : ''}
                      </span>
                    </span>
                    <span className="text-[11px] text-[#8B98B0] tabular-nums">Pick {t.pick_order}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {draft.status === 'complete' && (
              <Link href="/league/ctfdl/draft/recap" className="inline-block mt-3 text-xs text-[#22D3EE] hover:text-[#67E8F9]">Draft recap</Link>
            )}
          </div>
        ) : (
          <div className="px-4 pb-6 pt-2 text-sm text-[#8B98B0]">
            {!season
              ? 'No seasons have been created for this league yet.'
              : season.status === 'completed'
                ? 'No standings were recorded for this season.'
                : isDraft
                  ? 'Standings start once the draft is done and play begins. Captains are announced when the draft is set up.'
                  : 'Standings appear once matches are reported.'}
            {season && season.status !== 'completed' && (
              <>
                {' '}
                <Link href="/league/register" className="text-[#22D3EE] hover:text-[#67E8F9]">Register for the season</Link>
              </>
            )}
          </div>
        )}
      </section>

      {/* Footnote */}
      {hasStandings && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#8B98B0]">
          <div className="rounded-xl bg-[#131A2B] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide mb-1.5">Columns</div>
            <p>
              MP matches played · W wins · L losses
              {isCTFPL && ' · NS no-shows · RW regulation wins · OTW overtime wins · K/D kill/death difference'}
              {' · Form last five results, oldest first'}
            </p>
          </div>
          {scoring && (
            <div className="rounded-xl bg-[#131A2B] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide mb-1.5">Scoring</div>
              <ul className="space-y-0.5">
                {scoring.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ── Playoff bracket (completed seasons with playoff/finals matches) ────────

function Bracket({ semis, finals }: { semis: MatchRow[]; finals: MatchRow[] }) {
  const final = finals[0] || null;
  const winner = (m: MatchRow) => (/win/i.test(m.team_a_result) ? m.team_a_name : m.team_b_name);
  const champion = final ? winner(final) : null;

  const Card = ({ match, label, highlight }: { match: MatchRow | null; label: string; highlight?: boolean }) => (
    <div className={`rounded-lg p-3 min-w-[190px] ${highlight ? 'bg-[#F59E0B]/10 ring-1 ring-[#F59E0B]/40' : 'bg-[#1B2438]'}`}>
      <div className={`text-[11px] uppercase tracking-wide mb-2 ${highlight ? 'text-[#F59E0B]' : 'text-[#8B98B0]'}`}>{label}</div>
      {!match ? (
        <div className="text-sm text-[#8B98B0] text-center py-2">TBD</div>
      ) : (
        [
          { name: match.team_a_name, score: match.team_a_kills, won: /win/i.test(match.team_a_result) },
          { name: match.team_b_name, score: match.team_b_kills, won: /win/i.test(match.team_b_result) },
        ].map((t) => (
          <div key={t.name} className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${t.won ? 'bg-[#34D399]/10' : ''}`}>
            <span className={`text-sm truncate ${t.won ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{t.name}</span>
            <span className={`text-sm tabular-nums ${t.won ? 'text-[#34D399]' : 'text-[#8B98B0]'}`}>{t.score}</span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <section className="rounded-xl bg-[#131A2B] px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-[#F59E0B]" aria-hidden="true" />
        <h2 className="font-display text-xl text-[#E6EDF7]">Playoffs</h2>
      </div>
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {semis.length > 0 && (
          <div className="flex flex-col gap-3">
            {semis.map((m, i) => <Card key={m.id} match={m} label={`Semi-final ${i + 1}`} />)}
          </div>
        )}
        {semis.length > 0 && <div className="hidden md:block w-6 border-t border-white/10" />}
        <Card match={final} label="Final" highlight />
        {champion && (
          <>
            <div className="hidden md:block w-6 border-t border-[#F59E0B]/40" />
            <div className="rounded-lg bg-[#F59E0B]/10 ring-1 ring-[#F59E0B]/40 px-5 py-4 text-center min-w-[170px]">
              <Crown className="w-6 h-6 text-[#F59E0B] mx-auto mb-1" aria-hidden="true" />
              <div className="text-[11px] uppercase tracking-wide text-[#F59E0B]">Champion</div>
              <div className="font-display text-2xl text-[#E6EDF7] leading-tight">{champion}</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
