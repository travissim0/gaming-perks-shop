'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDraft } from '@/components/ctfdl/useDraft';
import { teamIndexForPick, avgRating, type DraftPlayer } from '@/lib/ctfdl-draft';
import { Chip, StaffShell, HeaderStrip, th } from '@/components/ctf/AdminBits';
import { btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface DraftSeasonOption { season_id: string; season_number: number; season_name: string | null; status: string }
type View = 'board' | 'rosters' | 'picks';

const STATUS: Record<string, [string, string]> = {
  setup: ['Not started', 'bg-white/10 text-[#8B98B0]'],
  live: ['Live', 'bg-[#34D399]/15 text-[#34D399]'],
  paused: ['Paused', 'bg-[#F59E0B]/15 text-[#F59E0B]'],
  complete: ['Complete', 'bg-[#22D3EE]/15 text-[#22D3EE]'],
};

function ClassChips({ p, max = 3 }: { p: DraftPlayer; max?: number }) {
  const classes = [...p.preferred_roles, ...p.secondary_roles.filter((c) => !p.preferred_roles.includes(c))].slice(0, max);
  if (classes.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {classes.map((c) => (
        <span key={c} className={`rounded px-1.5 py-0.5 text-[10px] ${p.preferred_roles.includes(c) ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/5 text-[#8B98B0]'}`}>
          {c}{p.class_ratings?.[c] ? ` ★${p.class_ratings[c]}` : ''}
        </span>
      ))}
    </span>
  );
}

/** Draft recap: the board by round, the finished rosters, and the pick-by-pick log for a CTFDL season. */
export default function CtfdlDraftRecapPage() {
  const { user } = useAuth();
  const [options, setOptions] = useState<DraftSeasonOption[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const { bundle, loading } = useDraft({ seasonId });

  // Seasons that have a draft (public read on ctfdl_drafts).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ctfdl_drafts')
        .select('league_season_id, status, league_seasons(season_number, season_name)')
        .order('created_at', { ascending: false });
      const opts: DraftSeasonOption[] = ((data || []) as any[]).map((r) => ({
        season_id: r.league_season_id,
        season_number: r.league_seasons?.season_number ?? 0,
        season_name: r.league_seasons?.season_name ?? null,
        status: r.status,
      }));
      setOptions(opts);
      try {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('season');
        if (q && opts.some((o) => o.season_id === q)) setSeasonId(q);
        const v = params.get('view');
        if (v === 'board' || v === 'rosters' || v === 'picks') setView(v);
      } catch { /* ignore */ }
    })();
  }, []);

  const selectView = (v: View) => {
    setView(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', v);
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  };

  const draft = bundle?.draft;
  const teams = useMemo(() => [...(bundle?.teams || [])].sort((a, b) => a.pick_order - b.pick_order), [bundle]);
  const picks = useMemo(() => [...(bundle?.picks || [])].sort((a, b) => a.overall - b.overall), [bundle]);
  const players = bundle?.players || [];
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.player_id, p])), [players]);
  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const rounds = draft ? draft.roster_size : 0;
  const made = picks.filter((p) => p.pick_type !== 'skip').length;
  const total = rounds * teams.length;

  // Rosters: captain first, then picks in order.
  const rosters = useMemo(
    () => teams.map((t) => ({
      team: t,
      picks: picks.filter((p) => p.team_id === t.id && p.player_id).map((p) => ({ pick: p, player: playerById[p.player_id!] })).filter((x) => x.player),
    })),
    [teams, picks, playerById],
  );

  const nextUp = (() => {
    if (!draft || draft.status === 'complete' || teams.length === 0) return null;
    const idx = teamIndexForPick(draft.current_pick, teams.length, draft.order_type);
    return idx >= 0 ? teams[idx] : null;
  })();

  const cell = (round: number, teamIdx: number) => {
    const t = teams[teamIdx];
    const pk = picks.find((p) => p.round === round && p.team_id === t?.id);
    if (!pk) {
      const isNext = nextUp && t && nextUp.id === t.id && draft && draft.status !== 'setup' && Math.ceil(draft.current_pick / Math.max(teams.length, 1)) === round;
      return <span className={isNext ? 'text-[#F59E0B]' : 'text-[#8B98B0]/40'}>{isNext ? 'on the clock' : '—'}</span>;
    }
    if (pk.pick_type === 'skip') return <span className="italic text-[#8B98B0]">skipped</span>;
    const pl = pk.player_id ? playerById[pk.player_id] : null;
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[11px] tabular-nums text-[#8B98B0]">{pk.overall}</span>
        <span className="text-[#E6EDF7]">{pl?.alias || '—'}</span>
        {pk.pick_type === 'auto' && <span className="text-[10px] text-[#F59E0B]" title="Auto-picked when the clock ran out">auto</span>}
      </span>
    );
  };

  const status = draft ? STATUS[draft.status] : null;
  const seasonNo = bundle?.season?.season_number;

  return (
    <StaffShell user={user}>
      <HeaderStrip
        title={seasonNo ? `Season ${seasonNo} draft` : 'Draft recap'}
        meta={
          draft ? (
            <>
              <span className="text-[#E6EDF7]">CTFDL</span>
              {status && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status[1]}`}>{status[0]}</span>}
              <span>{draft.order_type === 'snake' ? 'Snake' : 'Straight'} order · {teams.length} teams · {rounds} rounds</span>
              <span>{made} of {total} picks</span>
              {draft.completed_at && <span>Completed {new Date(draft.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            </>
          ) : (
            <span>Round-by-round board, finished rosters and every pick.</span>
          )
        }
        actions={
          <>
            {options.length > 1 && (
              <select value={seasonId || options[0]?.season_id || ''} onChange={(e) => setSeasonId(e.target.value)} className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none">
                {options.map((o) => <option key={o.season_id} value={o.season_id}>Season {o.season_number}{o.status !== 'complete' ? ` (${o.status})` : ''}</option>)}
              </select>
            )}
            {draft && draft.status !== 'complete' && <Link href="/league/ctfdl/draft" className={btnPrimary}>Open lobby</Link>}
            <Link href="/league/standings?league=ctfdl" className={btnQuiet}>Standings</Link>
            <Link href="/league" className={btnQuiet}>League page</Link>
          </>
        }
      >
        {draft && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip active={view === 'board'} onClick={() => selectView('board')}>Board</Chip>
            <Chip active={view === 'rosters'} onClick={() => selectView('rosters')}>Rosters</Chip>
            <Chip active={view === 'picks'} onClick={() => selectView('picks')}>Pick by pick <span className="ml-1 tabular-nums opacity-70">{picks.length}</span></Chip>
          </div>
        )}
      </HeaderStrip>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#8B98B0]">Loading…</div>
      ) : !draft ? (
        <section className="rounded-xl bg-[#131A2B] p-8 text-center">
          <h2 className="font-display text-2xl text-[#E6EDF7]">No draft has been run yet</h2>
          <p className="mt-2 text-sm text-[#8B98B0]">The board fills in here live on draft night, and stays as the record afterwards.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/league/register" className={btnPrimary}>Register</Link>
            <Link href="/free-agents" className={btnQuiet}>Player pool</Link>
          </div>
        </section>
      ) : view === 'board' ? (
        <section className="rounded-xl bg-[#131A2B]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className={th}>Round</th>
                  {teams.map((t) => (
                    <th key={t.id} className={`${th} normal-case tracking-normal`}>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">{(t.squad_tag || t.squad_name).slice(0, 4).toUpperCase()}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-display text-base text-[#E6EDF7]">{t.squad_name}</span>
                          <span className="block text-[11px] font-normal text-[#8B98B0]">Captain {t.captain_alias || '—'} · picks #{t.pick_order}</span>
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rounds }).map((_, r) => {
                  const round = r + 1;
                  const reverse = draft.order_type === 'snake' && round % 2 === 0;
                  return (
                    <tr key={round} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-display text-lg text-[#22D3EE] tabular-nums">{round}</span>
                        <span className="ml-1.5 text-[10px] text-[#8B98B0]" title={reverse ? 'Reverse order this round' : 'Forward order'}>{reverse ? '←' : '→'}</span>
                      </td>
                      {teams.map((_, i) => <td key={i} className="px-4 py-2.5 text-sm">{cell(round, i)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-[#8B98B0] border-t border-white/[0.06]">
            Numbers are overall picks. {draft.order_type === 'snake' ? 'Even rounds run in reverse order.' : ''}
            {nextUp ? ` Next up: ${nextUp.squad_name}.` : ''}
          </p>
        </section>
      ) : view === 'rosters' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rosters.map(({ team, picks: tp }) => (
            <section key={team.id} className="rounded-xl bg-[#131A2B]">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
                <span className="w-10 h-10 rounded-md bg-[#1B2438] text-[#22D3EE] text-xs font-medium flex items-center justify-center shrink-0">{(team.squad_tag || team.squad_name).slice(0, 4).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/squads/${team.squad_id}`} className="block truncate font-display text-lg text-[#E6EDF7] hover:text-[#22D3EE]">{team.squad_name}</Link>
                  <div className="text-xs text-[#8B98B0]">Picks #{team.pick_order} · {tp.length} of {rounds} drafted</div>
                </div>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                <li className="flex items-center gap-3 px-5 py-2">
                  <span className="w-7 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">C</span>
                  <span className="flex-1 text-sm text-[#E6EDF7]">{team.captain_alias || '—'}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Captain</span>
                </li>
                {tp.map(({ pick, player }) => (
                  <li key={pick.id} className="flex items-center gap-3 px-5 py-2">
                    <span className="w-7 text-xs tabular-nums text-[#8B98B0]" title={`Overall pick ${pick.overall}, round ${pick.round}`}>{pick.overall}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[#E6EDF7]">{player.alias}{pick.pick_type === 'auto' && <span className="ml-1.5 text-[10px] text-[#F59E0B]">auto</span>}</span>
                      <ClassChips p={player} />
                    </span>
                  </li>
                ))}
                {Array.from({ length: Math.max(0, rounds - tp.length) }).map((_, i) => (
                  <li key={`empty-${i}`} className="flex items-center gap-3 px-5 py-2 text-sm text-[#8B98B0]/40">
                    <span className="w-7">·</span>
                    <span>{draft.status === 'complete' ? 'unfilled' : 'to come'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-xl bg-[#131A2B]">
          {picks.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#8B98B0]">No picks yet.</p>
          ) : (
            <ol className="divide-y divide-white/[0.04]">
              {picks.map((pk) => {
                const t = teamById[pk.team_id];
                const pl = pk.player_id ? playerById[pk.player_id] : null;
                return (
                  <li key={pk.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <span className="w-8 font-display text-lg tabular-nums text-[#22D3EE]">{pk.overall}</span>
                    <span className="w-14 text-xs text-[#8B98B0]">R{pk.round}</span>
                    <span className="w-8 h-8 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0" title={t?.squad_name}>{(t?.squad_tag || t?.squad_name || '?').slice(0, 4).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      {pk.pick_type === 'skip' ? (
                        <span className="text-sm italic text-[#8B98B0]">{t?.squad_name} skipped</span>
                      ) : (
                        <>
                          <span className="block text-sm text-[#E6EDF7]">
                            {pl?.alias || '—'}
                            <span className="ml-2 text-xs text-[#8B98B0]">to {t?.squad_name}</span>
                            {pk.pick_type === 'auto' && <span className="ml-1.5 text-[10px] text-[#F59E0B]">auto</span>}
                            {pk.pick_type === 'staff' && <span className="ml-1.5 text-[10px] text-[#8B98B0]">by staff</span>}
                          </span>
                          {pl && <ClassChips p={pl} max={4} />}
                        </>
                      )}
                    </span>
                    {pl && <span className="text-xs tabular-nums text-[#8B98B0]" title="Average self-rating">★{avgRating(pl).toFixed(1)}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </StaffShell>
  );
}
