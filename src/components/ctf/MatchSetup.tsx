'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

/**
 * Match setup card on the match page: the home team picks Titan or
 * Collective, both teams set their starting lineup and bench. Writes go
 * through /api/matches/[id]/setup; the same data feeds the game client.
 */

type Side = 'titan' | 'collective';
type Slot = 'starting' | 'bench' | 'out';

interface Member { player_id: string; alias: string; role: 'captain' | 'co_captain' | 'player' }
interface Team { squad_id: string; name: string; tag: string; side: Side | null; team_starting: string | null; team_bench: string | null; roster: Member[] }
interface Setup {
  pending_sql?: boolean;
  match: { id: string; scheduled_at: string; status: string; locked: boolean };
  home: Team | null;
  away: Team | null;
  side_chosen_at: string | null;
  lineups: Record<string, { starting: { player_id: string; alias: string }[]; bench: { player_id: string; alias: string }[] }>;
  client: { ready: boolean; teams: string[]; players: { alias: string; team: string; spec: boolean }[] };
  viewer: { is_staff: boolean; leads_home: boolean; leads_away: boolean; can_pick_side: boolean; can_edit_home: boolean; can_edit_away: boolean } | null;
}

const SIDE_LABEL: Record<Side, string> = { titan: 'Titan', collective: 'Collective' };
const btnQuiet = 'px-3 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors disabled:opacity-50';
const btnPrimary = 'px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';

export default function MatchSetup({ matchId, user }: { matchId: string; user: any }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Local edits per squad: player_id → slot. Null until the user touches a lineup.
  const [draft, setDraft] = useState<Record<string, Record<string, Slot>>>({});

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches/${encodeURIComponent(matchId)}/setup`, { headers: await headers(), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      setSetup(j);
      setDraft({});
    } catch (e) {
      console.error('match setup load failed', e);
    } finally {
      setLoading(false);
    }
  }, [matchId, headers]);

  useEffect(() => { load(); }, [load, user?.id]);

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const r = await fetch(`/api/matches/${encodeURIComponent(matchId)}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setSetup(j);
      setDraft((d) => { const n = { ...d }; if (typeof body.squad_id === 'string') delete n[body.squad_id]; return n; });
      toast.success(label);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const slotsFor = (team: Team): Record<string, Slot> => {
    if (draft[team.squad_id]) return draft[team.squad_id];
    const l = setup?.lineups[team.squad_id];
    const out: Record<string, Slot> = {};
    team.roster.forEach((m) => { out[m.player_id] = 'out'; });
    l?.starting.forEach((p) => { out[p.player_id] = 'starting'; });
    l?.bench.forEach((p) => { out[p.player_id] = 'bench'; });
    return out;
  };

  const setSlot = (team: Team, playerId: string, slot: Slot) => {
    setDraft((d) => ({ ...d, [team.squad_id]: { ...slotsFor(team), [playerId]: slot } }));
  };

  const saveLineup = (team: Team) => {
    const slots = slotsFor(team);
    const order = team.roster.map((m) => m.player_id);
    post({
      action: 'set_lineup',
      squad_id: team.squad_id,
      starting: order.filter((id) => slots[id] === 'starting'),
      bench: order.filter((id) => slots[id] === 'bench'),
    }, `${team.tag} lineup saved`);
  };

  const summary = useMemo(() => {
    if (!setup?.home || !setup.away) return null;
    const { home, away, viewer } = setup;
    if (!home.side) {
      if (viewer?.can_pick_side) return `${home.tag} is home: pick your side below.`;
      return `Waiting on ${home.name} (home) to pick a side.`;
    }
    return `${home.tag} picked ${SIDE_LABEL[home.side]} · ${away.tag} plays ${SIDE_LABEL[away.side!]}.`;
  }, [setup]);

  if (loading) return null;
  if (!setup || !setup.home || !setup.away) return null;
  if (setup.pending_sql) {
    return setup.viewer?.is_staff ? (
      <section className="rounded-xl bg-[#131A2B] px-4 py-3 text-sm text-[#F59E0B]">Match setup needs add-match-setup.sql run in Supabase.</section>
    ) : null;
  }

  const { home, away, viewer, match } = setup;
  const locked = match.locked;

  const renderTeam = (team: Team, canEdit: boolean) => {
    const slots = slotsFor(team);
    const starting = team.roster.filter((m) => slots[m.player_id] === 'starting');
    const bench = team.roster.filter((m) => slots[m.player_id] === 'bench');
    const dirty = !!draft[team.squad_id];
    const isHome = team.squad_id === home.squad_id;
    return (
      <div className="rounded-md bg-[#1B2438] overflow-hidden">
        <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06]">
          <div>
            <div className="font-display text-lg text-[#E6EDF7] leading-tight">
              {team.tag} <span className="text-xs font-sans text-[#8B98B0]">{isHome ? 'home' : 'away'}{team.side ? ` · ${SIDE_LABEL[team.side]}` : ''}</span>
            </div>
            <div className="text-[11px] text-[#8B98B0]">
              {team.team_starting
                ? <>Starters on <span className="text-[#34D399]">{team.team_starting}</span> · bench in spec on <span className="text-[#E6EDF7]">{team.team_bench}</span></>
                : 'Team names are set once the side is picked.'}
            </div>
          </div>
          <div className="text-xs tabular-nums text-[#8B98B0]">
            <span className="text-[#34D399]">{starting.length}</span> starting · {bench.length} bench
          </div>
        </div>

        {team.roster.length === 0 ? (
          <p className="px-3 py-3 text-sm text-[#8B98B0]">No players on the roster yet.</p>
        ) : canEdit ? (
          <ul className="divide-y divide-white/[0.04]">
            {team.roster.map((m) => {
              const s = slots[m.player_id];
              return (
                <li key={m.player_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#E6EDF7]">
                    {m.alias}
                    {m.role !== 'player' && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">{m.role === 'captain' ? 'C' : 'Co-C'}</span>}
                  </span>
                  <span className="flex gap-1">
                    {(['starting', 'bench', 'out'] as Slot[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSlot(team, m.player_id, k)}
                        className={`rounded px-2 py-0.5 text-[11px] transition-colors ${s === k
                          ? k === 'starting' ? 'bg-[#34D399]/20 text-[#34D399]' : k === 'bench' ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/10 text-[#E6EDF7]'
                          : 'text-[#8B98B0] hover:bg-white/5'}`}
                      >
                        {k === 'starting' ? 'Start' : k === 'bench' ? 'Bench' : 'Out'}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-3 py-2 space-y-2 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#8B98B0] mb-1">Starting{team.team_starting ? ` · ${team.team_starting}` : ''}</div>
              <div className="flex flex-wrap gap-1">
                {starting.length === 0 ? <span className="text-xs text-[#8B98B0]/60">Not set yet</span> : starting.map((m) => <span key={m.player_id} className="rounded bg-[#34D399]/15 px-1.5 py-0.5 text-xs text-[#34D399]">{m.alias}</span>)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#8B98B0] mb-1">Bench{team.team_bench ? ` · ${team.team_bench}` : ''}</div>
              <div className="flex flex-wrap gap-1">
                {bench.length === 0 ? <span className="text-xs text-[#8B98B0]/60">Nobody</span> : bench.map((m) => <span key={m.player_id} className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-[#E6EDF7]">{m.alias}</span>)}
              </div>
            </div>
          </div>
        )}

        {canEdit && team.roster.length > 0 && (
          <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-white/[0.06]">
            <span className="text-[11px] text-[#8B98B0]">{dirty ? 'Unsaved changes' : 'Saved'}</span>
            <div className="flex gap-2">
              {dirty && <button type="button" onClick={() => setDraft((d) => { const n = { ...d }; delete n[team.squad_id]; return n; })} className={btnQuiet}>Discard</button>}
              <button type="button" onClick={() => saveLineup(team)} disabled={!dirty || busy !== null} className={btnPrimary}>Save lineup</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-[#E6EDF7]">Match setup</h2>
        <div className="flex items-center gap-3 text-xs text-[#8B98B0]">
          {locked ? <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase tracking-wide">Locked</span> : setup.client.ready ? <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 uppercase tracking-wide text-[#34D399]">Ready</span> : null}
          {viewer?.is_staff && (
            <button type="button" onClick={() => post({ action: 'swap_home' }, 'Home and away swapped')} disabled={busy !== null} className="text-[#F59E0B] hover:text-[#FBBF24] disabled:opacity-50">Swap home/away</button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Side */}
        <div className="rounded-md bg-[#1B2438] px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[#E6EDF7]">{summary}</div>
          {viewer?.can_pick_side && (
            <div className="flex gap-1.5">
              {(['titan', 'collective'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => post({ action: 'set_side', side: s }, `${home.tag} takes ${SIDE_LABEL[s]}`)}
                  disabled={busy !== null || home.side === s}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${home.side === s ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'} disabled:opacity-70`}
                >
                  {SIDE_LABEL[s]}
                </button>
              ))}
              {home.side && viewer.is_staff && (
                <button type="button" onClick={() => post({ action: 'set_side', side: null }, 'Side cleared')} disabled={busy !== null} className="text-xs text-[#8B98B0] hover:text-[#F87171] px-2">Clear</button>
              )}
            </div>
          )}
        </div>

        {/* Lineups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderTeam(home, !!viewer?.can_edit_home)}
          {renderTeam(away, !!viewer?.can_edit_away)}
        </div>

        <p className="text-[11px] text-[#8B98B0]">
          Captains and co-captains set their side and lineup until the scheduled time; staff can change them any time.
          When the game client is connected, starters are placed on their team and unspecced, and the bench stays in spec on the other team name.
        </p>
      </div>
    </section>
  );
}
