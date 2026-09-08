'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { getLeagues } from '@/lib/leagues';
import { useDraft } from '@/components/ctfdl/useDraft';
import { avgRating, type DraftPlayer } from '@/lib/ctfdl-draft';

interface SeasonRow { id: string; season_number: number; season_name: string | null; status: string }
interface SquadRow { id: string; name: string; tag: string | null; captain_id: string; captain_alias: string; is_active: boolean }

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
      toast.success(label);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const createDraft = () => seasonId && post({ action: 'create', league_season_id: seasonId, ...settings, pick_seconds: settings.pick_seconds === '' ? null : Number(settings.pick_seconds) }, 'Draft created');
  const saveSettings = () => draft && post({ action: 'update', draft_id: draft.id, ...settings, pick_seconds: settings.pick_seconds === '' ? null : Number(settings.pick_seconds) }, 'Settings saved');
  const saveTeams = () => draft && post({ action: 'set_teams', draft_id: draft.id, squad_ids: selected }, 'Teams saved');
  const saveRanking = () => draft && post({ action: 'set_rankings', draft_id: draft.id, player_ids: ranking }, 'Ranking saved');
  const action = (a: string, label: string) => draft && post({ action: a, draft_id: draft.id }, label);

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

  if (authLoading || access === 'checking') {
    return <div className="min-h-screen bg-gray-900"><Navbar user={user} /><div className="p-8 text-center text-gray-400">Checking access…</div></div>;
  }
  if (access === 'denied') {
    return <div className="min-h-screen bg-gray-900"><Navbar user={user} /><div className="p-8 text-center text-red-400">Staff only.</div></div>;
  }

  const input = 'bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-purple-500';
  const btn = 'px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-purple-400">CTFDL draft setup</h1>
            <p className="text-sm text-gray-400">Captains create their squads first; you activate the ones playing this season, then set them up here.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/league/ctfdl/draft" className={`${btn} bg-cyan-600 hover:bg-cyan-500 text-white`}>Open lobby</Link>
            <Link href="/admin/ctf-management" className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>CTF management</Link>
          </div>
        </div>

        {/* Season + status */}
        <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-4">
          <label className="text-sm">
            <span className="block text-gray-400 mb-1">Season</span>
            <select value={seasonId || ''} onChange={(e) => setSeasonId(e.target.value)} className={input}>
              {seasons.map((s) => <option key={s.id} value={s.id}>Season {s.season_number}{s.season_name ? ` · ${s.season_name}` : ''} ({s.status})</option>)}
            </select>
          </label>
          <div className="text-sm">
            <span className="block text-gray-400 mb-1">Draft status</span>
            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${!draft ? 'bg-gray-700 text-gray-300' : draft.status === 'live' ? 'bg-green-600 text-white' : draft.status === 'paused' ? 'bg-amber-600 text-white' : draft.status === 'complete' ? 'bg-cyan-700 text-white' : 'bg-gray-600 text-white'}`}>
              {loading ? 'loading…' : !draft ? 'No draft yet' : draft.status}
            </span>
            {draft && draft.status !== 'setup' && <span className="ml-2 text-gray-400">pick {draft.current_pick} · {bundle?.picks.length || 0} made</span>}
          </div>
          {season && season.status === 'completed' && <span className="text-xs text-amber-300">This season is completed.</span>}
        </div>

        {/* Settings */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-white">Settings</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <label className="text-sm"><span className="block text-gray-400 mb-1">Pick order</span>
              <select value={settings.order_type} onChange={(e) => setSettings((s) => ({ ...s, order_type: e.target.value }))} className={input}>
                <option value="snake">Snake (1→N, N→1, …)</option>
                <option value="straight">Straight (1→N every round)</option>
              </select>
            </label>
            <label className="text-sm"><span className="block text-gray-400 mb-1">Picks per team (rounds)</span>
              <input type="number" min={1} max={30} value={settings.roster_size} onChange={(e) => setSettings((s) => ({ ...s, roster_size: Number(e.target.value) }))} className={`${input} w-24`} />
            </label>
            <label className="text-sm"><span className="block text-gray-400 mb-1">Pick clock (seconds, blank = none)</span>
              <input type="number" min={10} max={3600} value={settings.pick_seconds} onChange={(e) => setSettings((s) => ({ ...s, pick_seconds: e.target.value }))} className={`${input} w-28`} placeholder="none" />
            </label>
            <label className="text-sm flex items-center gap-2 pb-2">
              <input type="checkbox" checked={settings.auto_pick} onChange={(e) => setSettings((s) => ({ ...s, auto_pick: e.target.checked }))} style={{ WebkitAppearance: 'checkbox', appearance: 'auto' }} className="h-4 w-4" />
              Auto-pick when the clock runs out
            </label>
            {!draft ? (
              <button onClick={createDraft} disabled={!seasonId || !!busy} className={`${btn} bg-purple-600 hover:bg-purple-500 text-white`}>Create draft</button>
            ) : (
              <button onClick={saveSettings} disabled={!!busy || draft.status === 'complete'} className={`${btn} bg-purple-600 hover:bg-purple-500 text-white`}>Save settings</button>
            )}
          </div>
          <p className="text-xs text-gray-500">Auto-pick order: the captain's own queue, then your staff ranking below, then highest self-rating. Captains are placed on their own squad automatically and can't be drafted.</p>
        </div>

        {draft && (
          <>
            {/* Teams */}
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-white">Teams and pick order {setupLocked && <span className="text-xs text-gray-400 font-normal">(locked once the draft starts)</span>}</h2>
                <div className="flex gap-2">
                  <button onClick={shuffleTeams} disabled={setupLocked || selected.length < 2} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>Shuffle order</button>
                  <button onClick={saveTeams} disabled={setupLocked || !!busy} className={`${btn} bg-purple-600 hover:bg-purple-500 text-white`}>Save teams</button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Active squads (tick to include)</div>
                  <ul className="space-y-1 max-h-72 overflow-y-auto">
                    {squads.map((s) => (
                      <li key={s.id}>
                        <label className="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-gray-700/50 cursor-pointer">
                          <input type="checkbox" checked={selected.includes(s.id)} disabled={setupLocked}
                            onChange={(e) => setSelected((cur) => e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id))}
                            style={{ WebkitAppearance: 'checkbox', appearance: 'auto' }} className="h-4 w-4" />
                          <span className="text-white">{s.tag ? `[${s.tag}] ` : ''}{s.name}</span>
                          <span className="text-gray-400 text-xs">capt. {s.captain_alias}</span>
                        </label>
                      </li>
                    ))}
                    {squads.length === 0 && <li className="text-sm text-gray-500">No active squads. Activate participating squads in CTF management.</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Pick order (round 1)</div>
                  <ol className="space-y-1">
                    {selected.map((id, i) => {
                      const s = squads.find((x) => x.id === id) || bundle?.teams.find((t) => t.squad_id === id) && { name: bundle.teams.find((t) => t.squad_id === id)!.squad_name, tag: bundle.teams.find((t) => t.squad_id === id)!.squad_tag };
                      return (
                        <li key={id} className="flex items-center gap-2 text-sm bg-gray-700/40 rounded px-2 py-1">
                          <span className="w-5 text-gray-400">{i + 1}</span>
                          <span className="flex-1 text-white">{s?.tag ? `[${s.tag}] ` : ''}{s?.name || id}</span>
                          <button onClick={() => move(selected, setSelected, id, -1)} disabled={setupLocked} className="text-gray-400 hover:text-white disabled:opacity-30">↑</button>
                          <button onClick={() => move(selected, setSelected, id, 1)} disabled={setupLocked} className="text-gray-400 hover:text-white disabled:opacity-30">↓</button>
                        </li>
                      );
                    })}
                    {selected.length === 0 && <li className="text-sm text-gray-500">Nothing selected.</li>}
                  </ol>
                </div>
              </div>
            </div>

            {/* Staff ranking */}
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-white">Staff ranking</h2>
                  <p className="text-xs text-gray-400">Shown to captains as "Staff #n" and used for auto-pick when a captain has no queue. {players.length} registered players.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={autoRank} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>Order by self-rating</button>
                  <button onClick={() => setRanking([])} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>Clear</button>
                  <button onClick={saveRanking} disabled={!!busy} className={`${btn} bg-purple-600 hover:bg-purple-500 text-white`}>Save ranking</button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Ranked</div>
                  <ol className="space-y-1 max-h-96 overflow-y-auto">
                    {ranking.map((id, i) => {
                      const p = playerById[id]; if (!p) return null;
                      return (
                        <li key={id} className="flex items-center gap-2 text-sm bg-gray-700/40 rounded px-2 py-1">
                          <span className="w-6 text-gray-400">{i + 1}</span>
                          <span className="flex-1 text-white">{p.alias} <span className="text-gray-400 text-xs">{p.preferred_roles.join(', ')} · ★{avgRating(p).toFixed(1)}</span></span>
                          <button onClick={() => move(ranking, setRanking, id, -1)} className="text-gray-400 hover:text-white">↑</button>
                          <button onClick={() => move(ranking, setRanking, id, 1)} className="text-gray-400 hover:text-white">↓</button>
                          <button onClick={() => setRanking((r) => r.filter((x) => x !== id))} className="text-gray-400 hover:text-red-400">✕</button>
                        </li>
                      );
                    })}
                    {ranking.length === 0 && <li className="text-sm text-gray-500">No ranking yet.</li>}
                  </ol>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Unranked</div>
                  <ul className="space-y-1 max-h-96 overflow-y-auto">
                    {unranked.map((p: DraftPlayer) => (
                      <li key={p.player_id} className="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-gray-700/50">
                        <span className="flex-1 text-white">{p.alias} <span className="text-gray-400 text-xs">{p.preferred_roles.join(', ')} · ★{avgRating(p).toFixed(1)}</span></span>
                        <button onClick={() => setRanking((r) => [...r, p.player_id])} className="text-cyan-400 hover:text-cyan-300 text-xs">Add</button>
                      </li>
                    ))}
                    {unranked.length === 0 && <li className="text-sm text-gray-500">Everyone is ranked.</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-white mr-2">Run the draft</h2>
              {draft.status === 'setup' && <button onClick={() => action('start', 'Draft started')} disabled={!!busy || selected.length < 2} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Start draft</button>}
              {draft.status === 'live' && <button onClick={() => action('pause', 'Paused')} disabled={!!busy} className={`${btn} bg-amber-600 hover:bg-amber-500 text-white`}>Pause</button>}
              {draft.status === 'paused' && <button onClick={() => action('resume', 'Resumed')} disabled={!!busy} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Resume</button>}
              {draft.status !== 'setup' && draft.current_pick > 1 && <button onClick={() => confirm('Undo the last pick?') && action('undo', 'Last pick undone')} disabled={!!busy} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>Undo last pick</button>}
              {draft.status === 'live' && <button onClick={() => action('skip', 'Turn skipped')} disabled={!!busy} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>Skip turn</button>}
              {(draft.status === 'live' || draft.status === 'paused') && <button onClick={() => confirm('End the draft now?') && action('end', 'Draft ended')} disabled={!!busy} className={`${btn} bg-red-700 hover:bg-red-600 text-white`}>End draft</button>}
              {draft.status !== 'setup' && (
                <button
                  onClick={() => confirm(`Reset this draft? All ${bundle?.picks.length || 0} picks are pulled back and the players the draft placed on squads are removed from them. Teams, ranking and queues are kept.`) && action('reset', 'Draft reset to not started')}
                  disabled={!!busy}
                  className={`${btn} bg-gray-700 hover:bg-amber-700 text-white ml-auto`}
                >
                  Reset draft
                </button>
              )}
              {draft.status === 'setup' && <button onClick={() => confirm('Delete this draft? Teams and ranking will be lost.') && action('delete', 'Draft deleted')} disabled={!!busy} className={`${btn} bg-gray-700 hover:bg-red-700 text-white ml-auto`}>Delete draft</button>}
              <span className="text-xs text-gray-500 w-full">Picking for captains happens in the lobby: as staff, every Pick button there picks for whichever team is on the clock. To scrap a draft that has run (e.g. a test), Reset it first, then Delete.</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
