'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { getLeagues } from '@/lib/leagues';
import { useDraft } from '@/components/ctfdl/useDraft';
import { avgRating, type DraftPlayer } from '@/lib/ctfdl-draft';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';
import { Chip, Panel, Modal, Spinner, Empty, StaffShell, HeaderStrip } from '@/components/ctf/AdminBits';

interface SeasonRow { id: string; season_number: number; season_name: string | null; status: string }
interface SquadRow { id: string; name: string; tag: string | null; captain_id: string; captain_alias: string; is_active: boolean }

type Confirm = { title: string; body: string; label: string; danger?: boolean; run: () => void } | null;

const STATUS: Record<string, [string, string]> = {
  setup: ['Not started', 'bg-white/10 text-[#8B98B0]'],
  live: ['Live', 'bg-[#34D399]/15 text-[#34D399]'],
  paused: ['Paused', 'bg-[#F59E0B]/15 text-[#F59E0B]'],
  complete: ['Complete', 'bg-[#22D3EE]/15 text-[#22D3EE]'],
};

const iconBtn = 'rounded p-1 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7] disabled:opacity-30 disabled:cursor-not-allowed';

/**
 * Staff setup for the CTFDL draft: pick the season, settings, participating
 * squads and their pick order, staff ranking, then start/pause/undo/end.
 */
export default function CtfdlDraftAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');

  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const { bundle, loading, refetch, applyBundle, authHeaders } = useDraft({ seasonId });

  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // squad ids in pick order
  const [ranking, setRanking] = useState<string[]>([]);   // player ids in rank order
  const [settings, setSettings] = useState({ order_type: 'snake', roster_size: 5, pick_seconds: '90', auto_pick: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBox, setConfirmBox] = useState<Confirm>(null);

  const draft = bundle?.draft || null;
  const players = bundle?.players || [];

  // Access
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/login?redirect=/admin/ctfdl-draft'); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
      setAccess(data && (data.is_admin || data.ctf_role === 'ctf_admin') ? 'ok' : 'denied');
    })();
  }, [user, authLoading, router]);

  // CTFDL seasons + active squads
  useEffect(() => {
    if (access !== 'ok') return;
    (async () => {
      const league = (await getLeagues()).find((l) => l.slug === 'ctfdl');
      if (league) {
        const { data } = await supabase
          .from('league_seasons')
          .select('id, season_number, season_name, status')
          .eq('league_id', league.id)
          .order('season_number', { ascending: false });
        const rows = (data || []) as SeasonRow[];
        setSeasons(rows);
        const preferred = rows.find((s) => s.status === 'active') || rows.find((s) => s.status === 'upcoming') || rows[0];
        if (preferred) setSeasonId(preferred.id);
      }
      const { data: sq } = await supabase
        .from('squads')
        .select('id, name, tag, captain_id, is_active, is_legacy, profiles!squads_captain_id_fkey(in_game_alias)')
        .eq('is_active', true)
        .order('name');
      setSquads(((sq || []) as any[]).filter((s) => !s.is_legacy).map((s) => ({
        id: s.id, name: s.name, tag: s.tag, captain_id: s.captain_id, captain_alias: s.profiles?.in_game_alias || '—', is_active: s.is_active,
      })));
    })();
  }, [access]);

  // Mirror server state into the editors
  useEffect(() => {
    if (!bundle) return;
    if (draft) {
      setSettings({ order_type: draft.order_type, roster_size: draft.roster_size, pick_seconds: draft.pick_seconds == null ? '' : String(draft.pick_seconds), auto_pick: draft.auto_pick });
      setSelected([...bundle.teams].sort((a, b) => a.pick_order - b.pick_order).map((t) => t.squad_id));
      setRanking([...players].filter((p) => p.staff_rank != null).sort((a, b) => a.staff_rank! - b.staff_rank!).map((p) => p.player_id));
    } else {
      setSelected([]);
      setRanking([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  const post = async (body: Record<string, any>, label: string) => {
    setBusy(label);
    try {
      const res = await fetch('/api/ctfdl/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
      if (json.deleted) { await refetch(); } else if (json.bundle) applyBundle(json.bundle); else await refetch();
      toast.success(typeof json.cleared === 'number' && json.cleared > 0 ? `${label} · ${json.cleared} leftover player${json.cleared === 1 ? '' : 's'} removed from rosters` : label);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const createDraft = () => seasonId && post({ action: 'create', league_season_id: seasonId, ...settings, pick_seconds: settings.pick_seconds === '' ? null : Number(settings.pick_seconds) }, 'Draft created');
  const saveSettings = () => draft && post({ action: 'update', draft_id: draft.id, ...settings, pick_seconds: settings.pick_seconds === '' ? null : Number(settings.pick_seconds) }, 'Settings saved');
  const saveTeams = () => {
    if (!draft) return;
    setConfirmBox({
      title: 'Save these teams?',
      body: 'Any players still on these squads from a previous season, other than the captain, are removed from the roster so the draft can fill it.',
      label: 'Save teams',
      run: () => post({ action: 'set_teams', draft_id: draft.id, squad_ids: selected }, 'Teams saved'),
    });
  };
  const saveRanking = () => draft && post({ action: 'set_rankings', draft_id: draft.id, player_ids: ranking }, 'Ranking saved');
  const action = (a: string, label: string) => draft && post({ action: a, draft_id: draft.id }, label);
  const ask = (c: NonNullable<Confirm>) => setConfirmBox(c);

  const move = (list: string[], set: (v: string[]) => void, id: string, dir: -1 | 1) => {
    const i = list.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; set(next);
  };
  const shuffleTeams = () => setSelected((s) => [...s].sort(() => Math.random() - 0.5));
  const autoRank = () => setRanking([...players].sort((a, b) => avgRating(b) - avgRating(a)).map((p) => p.player_id));

  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.player_id, p])), [players]);
  const unranked = players.filter((p) => !ranking.includes(p.player_id));
  const setupLocked = !!draft && draft.status !== 'setup';
  const season = seasons.find((s) => s.id === seasonId);
  const teamName = (id: string) => {
    const s = squads.find((x) => x.id === id);
    if (s) return { name: s.name, tag: s.tag, captain: s.captain_alias };
    const t = bundle?.teams.find((t) => t.squad_id === id);
    return t ? { name: t.squad_name, tag: t.squad_tag, captain: t.captain_alias } : { name: id, tag: null, captain: null };
  };

  if (authLoading || access === 'checking') {
    return <StaffShell user={user}><Spinner label="Checking staff access…" /></StaffShell>;
  }
  if (access === 'denied') {
    return (
      <StaffShell user={user}>
        <section className="rounded-xl bg-[#131A2B] px-6 py-8 text-center">
          <h1 className="font-display text-3xl text-[#E6EDF7]">Staff only</h1>
          <p className="mt-2 text-sm text-[#8B98B0]">CTF admin privileges are required for this page.</p>
        </section>
      </StaffShell>
    );
  }

  const status = draft ? STATUS[draft.status] : null;
  const picksMade = bundle?.picks.length || 0;

  return (
    <StaffShell user={user} maxWidth="max-w-6xl">
      <HeaderStrip
        title="Draft setup"
        meta={
          <>
            {season && <span className="text-[#E6EDF7]">CTFDL Season {season.season_number}{season.season_name ? ` · ${season.season_name}` : ''}</span>}
            {loading ? (
              <span>Loading…</span>
            ) : status ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status[1]}`}>{status[0]}</span>
            ) : (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B98B0]">No draft yet</span>
            )}
            {draft && draft.status !== 'setup' && <span>Pick {draft.current_pick} · {picksMade} made</span>}
            {season?.status === 'completed' && <span className="text-[#F59E0B]">This season is completed.</span>}
          </>
        }
        actions={
          <>
            <Link href="/league/ctfdl/draft" className={btnPrimary}>Open lobby</Link>
            <Link href="/admin/ctf-management" className={btnQuiet}>CTF management</Link>
          </>
        }
      />

      {/* Season + settings */}
      <Panel
        title={draft ? 'Settings' : 'Create the draft'}
        hint="Captains create their squads first; you activate the ones playing this season in CTF management, then set them up here."
        actions={
          !draft
            ? <button onClick={createDraft} disabled={!seasonId || !!busy || loading} className={btnPrimary}>Create draft</button>
            : <button onClick={saveSettings} disabled={!!busy || draft.status === 'complete'} className={btnPrimary}>Save settings</button>
        }
      >
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className={labelCls}>Season</span>
              <select value={seasonId || ''} onChange={(e) => setSeasonId(e.target.value)} className={inputCls}>
                {seasons.map((s) => <option key={s.id} value={s.id}>Season {s.season_number}{s.season_name ? ` · ${s.season_name}` : ''} ({s.status})</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Pick order</span>
              <select value={settings.order_type} onChange={(e) => setSettings((s) => ({ ...s, order_type: e.target.value }))} className={inputCls}>
                <option value="snake">Snake (1→N, N→1, …)</option>
                <option value="straight">Straight (1→N every round)</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Picks per team (rounds)</span>
              <input type="number" min={1} max={30} value={settings.roster_size} onChange={(e) => setSettings((s) => ({ ...s, roster_size: Number(e.target.value) }))} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Pick clock (seconds)</span>
              <input type="number" min={10} max={3600} value={settings.pick_seconds} onChange={(e) => setSettings((s) => ({ ...s, pick_seconds: e.target.value }))} className={inputCls} placeholder="blank = no clock" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Chip active={settings.auto_pick} onClick={() => setSettings((s) => ({ ...s, auto_pick: !s.auto_pick }))}>
              {settings.auto_pick ? 'Auto-pick on' : 'Auto-pick off'}
            </Chip>
            <span className="text-xs text-[#8B98B0]">When the clock runs out: the captain's own queue, then your staff ranking, then highest self-rating. Captains sit on their own squad and can't be drafted.</span>
          </div>
        </div>
      </Panel>

      {draft && (
        <>
          {/* Teams */}
          <Panel
            title="Teams and pick order"
            hint={setupLocked ? 'Locked once the draft starts.' : `${selected.length} squad${selected.length === 1 ? '' : 's'} in the draft. Tick squads on the left, order them on the right.`}
            actions={
              <>
                <button onClick={shuffleTeams} disabled={setupLocked || selected.length < 2} className={`${btnQuiet} disabled:opacity-40 disabled:cursor-not-allowed`}>Shuffle order</button>
                <button onClick={saveTeams} disabled={setupLocked || !!busy} className={btnPrimary}>Save teams</button>
              </>
            }
          >
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
              <div className="p-4">
                <div className={labelCls}>Active squads</div>
                {squads.length === 0 ? (
                  <p className="text-sm text-[#8B98B0]">No active squads. Activate the participating squads in CTF management first.</p>
                ) : (
                  <ul className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
                    {squads.map((s) => {
                      const on = selected.includes(s.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            disabled={setupLocked}
                            onClick={() => setSelected((cur) => on ? cur.filter((x) => x !== s.id) : [...cur, s.id])}
                            className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-[#22D3EE] bg-[#22D3EE] text-[#0B0F1A]' : 'border-white/20'}`}>{on && '✓'}</span>
                            <span className="w-9 h-9 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">{(s.tag || s.name).slice(0, 4).toUpperCase()}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[#E6EDF7]">{s.name}</span>
                              <span className="block text-xs text-[#8B98B0]">Captain {s.captain_alias}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="p-4">
                <div className={labelCls}>Pick order · round 1</div>
                {selected.length === 0 ? (
                  <p className="text-sm text-[#8B98B0]">Nothing selected yet.</p>
                ) : (
                  <ol className="divide-y divide-white/[0.04]">
                    {selected.map((id, i) => {
                      const t = teamName(id);
                      return (
                        <li key={id} className="flex items-center gap-3 px-2 py-2 text-sm">
                          <span className="w-6 font-display text-lg text-[#22D3EE] tabular-nums">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[#E6EDF7]">{t.tag ? `[${t.tag}] ` : ''}{t.name}</span>
                            {t.captain && <span className="block text-xs text-[#8B98B0]">Captain {t.captain}</span>}
                          </span>
                          <button onClick={() => move(selected, setSelected, id, -1)} disabled={setupLocked || i === 0} className={iconBtn} title="Move up"><ArrowUp className="h-4 w-4" /></button>
                          <button onClick={() => move(selected, setSelected, id, 1)} disabled={setupLocked || i === selected.length - 1} className={iconBtn} title="Move down"><ArrowDown className="h-4 w-4" /></button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </Panel>

          {/* Staff ranking */}
          <Panel
            title="Staff ranking"
            hint={`Shown to captains as "Staff #n" and used for auto-pick when a captain has no queue. ${players.length} registered player${players.length === 1 ? '' : 's'}.`}
            actions={
              <>
                <button onClick={autoRank} className={btnQuiet}>Order by self-rating</button>
                <button onClick={() => setRanking([])} disabled={ranking.length === 0} className={`${btnQuiet} disabled:opacity-40`}>Clear</button>
                <button onClick={saveRanking} disabled={!!busy} className={btnPrimary}>Save ranking</button>
              </>
            }
          >
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
              <div className="p-4">
                <div className={labelCls}>Ranked · {ranking.length}</div>
                {ranking.length === 0 ? (
                  <p className="text-sm text-[#8B98B0]">No ranking yet. Add players from the right, or order everyone by self-rating.</p>
                ) : (
                  <ol className="max-h-[28rem] overflow-y-auto divide-y divide-white/[0.04]">
                    {ranking.map((id, i) => {
                      const p = playerById[id]; if (!p) return null;
                      return (
                        <li key={id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                          <span className="w-6 font-display text-lg text-[#22D3EE] tabular-nums">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="text-[#E6EDF7]">{p.alias}</span>
                            <span className="ml-2 text-xs text-[#8B98B0]">{p.preferred_roles.join(', ')} · ★{avgRating(p).toFixed(1)}</span>
                          </span>
                          <button onClick={() => move(ranking, setRanking, id, -1)} disabled={i === 0} className={iconBtn} title="Move up"><ArrowUp className="h-4 w-4" /></button>
                          <button onClick={() => move(ranking, setRanking, id, 1)} disabled={i === ranking.length - 1} className={iconBtn} title="Move down"><ArrowDown className="h-4 w-4" /></button>
                          <button onClick={() => setRanking((r) => r.filter((x) => x !== id))} className={`${iconBtn} hover:text-[#F87171]`} title="Remove from ranking"><X className="h-4 w-4" /></button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
              <div className="p-4">
                <div className={labelCls}>Unranked · {unranked.length}</div>
                {unranked.length === 0 ? (
                  <p className="text-sm text-[#8B98B0]">Everyone is ranked.</p>
                ) : (
                  <ul className="max-h-[28rem] overflow-y-auto divide-y divide-white/[0.04]">
                    {unranked.map((p: DraftPlayer) => (
                      <li key={p.player_id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="text-[#E6EDF7]">{p.alias}</span>
                          <span className="ml-2 text-xs text-[#8B98B0]">{p.preferred_roles.join(', ')} · ★{avgRating(p).toFixed(1)}</span>
                        </span>
                        <button onClick={() => setRanking((r) => [...r, p.player_id])} className="text-xs text-[#22D3EE] hover:text-[#67E8F9]">Add</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          {/* Controls */}
          <Panel title="Run the draft" hint="Picking for captains happens in the lobby: as staff, every Pick button there picks for whichever team is on the clock.">
            <div className="p-5 flex flex-wrap items-center gap-2">
              {draft.status === 'setup' && <button onClick={() => action('start', 'Draft started')} disabled={!!busy || selected.length < 2} className={btnPrimary}>Start draft</button>}
              {draft.status === 'live' && <button onClick={() => action('pause', 'Paused')} disabled={!!busy} className={`${btnQuiet} text-[#F59E0B]`}>Pause</button>}
              {draft.status === 'paused' && <button onClick={() => action('resume', 'Resumed')} disabled={!!busy} className={btnPrimary}>Resume</button>}
              {draft.status !== 'setup' && draft.current_pick > 1 && (
                <button onClick={() => ask({ title: 'Undo the last pick?', body: 'The player goes back into the pool and the clock returns to the previous team.', label: 'Undo pick', run: () => action('undo', 'Last pick undone') })} disabled={!!busy} className={btnQuiet}>Undo last pick</button>
              )}
              {draft.status === 'live' && <button onClick={() => action('skip', 'Turn skipped')} disabled={!!busy} className={btnQuiet}>Skip turn</button>}
              {(draft.status === 'live' || draft.status === 'paused') && (
                <button onClick={() => ask({ title: 'End the draft now?', body: 'Remaining picks are abandoned. Rosters stay as they are.', label: 'End draft', danger: true, run: () => action('end', 'Draft ended') })} disabled={!!busy} className={btnDanger}>End draft</button>
              )}
              <span className="flex-1" />
              {draft.status !== 'setup' && (
                <button
                  onClick={() => ask({
                    title: 'Reset this draft?',
                    body: `All ${picksMade} pick${picksMade === 1 ? '' : 's'} are pulled back and the players the draft placed on squads are removed from them. Teams, ranking and queues are kept.`,
                    label: 'Reset draft',
                    danger: true,
                    run: () => action('reset', 'Draft reset to not started'),
                  })}
                  disabled={!!busy}
                  className={btnDanger}
                >
                  Reset draft
                </button>
              )}
              {draft.status === 'setup' && (
                <button onClick={() => ask({ title: 'Delete this draft?', body: 'Teams and ranking are lost. The Discord bot tears down any squad channels it built for it.', label: 'Delete draft', danger: true, run: () => action('delete', 'Draft deleted') })} disabled={!!busy} className={btnDanger}>Delete draft</button>
              )}
              <p className="w-full text-xs text-[#8B98B0]">To scrap a draft that has run, for example a test, reset it first, then delete.</p>
            </div>
          </Panel>
        </>
      )}

      {!draft && !loading && (
        <Panel>
          <Empty>No draft for this season yet. Set the options above and press Create draft. Teams and the staff ranking come next.</Empty>
        </Panel>
      )}

      {confirmBox && (
        <Modal title={confirmBox.title} onClose={() => setConfirmBox(null)}>
          <p className="text-sm text-[#8B98B0] mb-4">{confirmBox.body}</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmBox(null)} className={btnQuiet}>Cancel</button>
            <button
              onClick={() => { const run = confirmBox.run; setConfirmBox(null); run(); }}
              className={confirmBox.danger ? `${btnDanger} bg-[#F87171]/10` : btnPrimary}
            >
              {confirmBox.label}
            </button>
          </div>
        </Modal>
      )}
    </StaffShell>
  );
}
