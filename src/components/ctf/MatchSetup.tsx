'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { RoleKey } from '@/lib/ctf-roles';
import { Coverage, PlayerName, RoleTags, SideLean, dimmed, sortByPrefs, type RolesMap, type RosterPrefs } from '@/components/ctf/RosterRoles';

/**
 * Match setup card on the match page: the home team picks Titan or
 * Collective, both teams set their starting lineup and bench.
 *
 * Private: a squad's captain/co-captains see and edit their own lineup; the
 * home team's leads see the side; staff see everything. Everyone else sees
 * only whether each piece has been submitted. Writes go through
 * /api/matches/[id]/setup; the same route feeds the game client.
 *
 * Names are coloured by the class they play (RosterRoles.tsx). Captains can also
 * plan a 10-man: who comes in (usually the infil) and who steps out for them.
 */

type Side = 'titan' | 'collective';
type Slot = 'starting' | 'bench' | 'out';
type TenMan = 'in' | 'out';

interface Member {
  player_id: string; alias: string; role: 'captain' | 'co_captain' | 'player';
  /** FS Green only: false = drafted too early to play this match. */
  green_ok?: boolean;
  draft_round?: number | null;
}
interface Entry { player_id: string; alias: string; ten_man?: TenMan | null }
interface Team {
  squad_id: string; name: string; tag: string;
  side: Side | null; team_starting: string | null; team_bench: string | null;
  roster: Member[];
  /** Only present when the viewer may see this squad's lineup. */
  lineup: { starting: Entry[]; bench: Entry[] } | null;
}
interface Sub { id: string; squad_id: string; out_alias?: string; in_alias?: string; by_alias: string | null; created_at: string }
interface Setup {
  pending_sql?: boolean;
  match: { id: string; scheduled_at: string; time_tbd?: boolean; status: string; locked: boolean; arena?: string | null; game_id?: string | null; fs_color?: 'red' | 'green' | null; green_min_round?: number | null };
  home: Team | null;
  away: Team | null;
  progress: { side_picked: boolean; home_lineup_set: boolean; away_lineup_set: boolean; ready: boolean };
  /** Starters per side (10v10). */
  starters: number;
  side_reveal_at: string;
  side_released: boolean;
  subs?: Sub[];
  /** Whether the zone runs this match. Off: referees open the arena and place players by hand. */
  automation?: { enabled: boolean; reason: 'site' | 'match' | null };
  /** In-game chat for this match's captains and referees. Null for anyone not allowed to see it. */
  match_chat?: string | null;
  can_see_match_chat?: boolean;
  viewer: {
    is_staff: boolean; is_referee?: boolean; leads_home: boolean; leads_away: boolean;
    can_pick_side: boolean; can_edit_home: boolean; can_edit_away: boolean;
    can_sub_home?: boolean; can_sub_away?: boolean; sub_window?: boolean;
    can_set_match_chat?: boolean;
  } | null;
}

const SIDE_LABEL: Record<Side, string> = { titan: 'Titan', collective: 'Collective' };
const btnQuiet = 'px-3 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors disabled:opacity-50';
const btnPrimary = 'px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';

const Flag = ({ on, label }: { on: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${on ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-white/5 text-[#8B98B0]'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-[#34D399]' : 'bg-[#8B98B0]/50'}`} />{label}
  </span>
);

export default function MatchSetup({ matchId, user, roles, prefs }: { matchId: string; user: any; roles: RolesMap; prefs: RosterPrefs }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Local edits per squad: player_id → slot. Absent until the user touches a lineup.
  const [draft, setDraft] = useState<Record<string, Record<string, Slot>>>({});
  // Local 10-man plan edits per squad: player_id → in/out/none. Saved with the lineup.
  const [tenDraft, setTenDraft] = useState<Record<string, Record<string, TenMan | null>>>({});
  // Sub picker per squad: who comes out (a starter) and who goes in (bench or roster).
  const [subPick, setSubPick] = useState<Record<string, { out: string; in: string }>>({});
  // Coverage role highlighted per squad.
  const [focus, setFocus] = useState<Record<string, RoleKey | null>>({});
  // Match chat name being typed by staff / a referee; null = showing the saved one.
  const [chatDraft, setChatDraft] = useState<string | null>(null);

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  // `keepEdits`: a refresh the page does by itself. It must not throw away a lineup someone is
  // halfway through setting, and a failed one leaves the panel as it was.
  const load = useCallback(async (keepEdits = false) => {
    try {
      const r = await fetch(`/api/matches/${encodeURIComponent(matchId)}/setup`, { headers: await headers(), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (keepEdits && !j) return;
      setSetup(j);
      if (!keepEdits) { setDraft({}); setTenDraft({}); }
    } catch (e) {
      console.error('match setup load failed', e);
    } finally {
      setLoading(false);
    }
  }, [matchId, headers]);

  useEffect(() => { load(); }, [load, user?.id]);

  // The panel changes by itself at two moments: five minutes before the match (side revealed, subs
  // open) and at the scheduled time (lineups lock). Reload it then so nobody has to refresh the page.
  // The server decides when those moments are; if this device's clock runs ahead, ask again every
  // 15 seconds for a few minutes rather than hammering it.
  const phaseTries = useRef<{ phase: string; n: number }>({ phase: '', n: 0 });
  const revealIso = setup?.side_reveal_at;
  const kickoffIso = setup?.match.scheduled_at;
  const phase = !setup || setup.match.time_tbd || ['completed', 'cancelled', 'expired'].includes(setup.match.status) ? null
    : !setup.side_released ? 'reveal'
    : !setup.match.locked ? 'lock'
    : null;
  useEffect(() => {
    if (!phase || !revealIso || !kickoffIso) return;
    const at = new Date(phase === 'reveal' ? revealIso : kickoffIso).getTime();
    if (!Number.isFinite(at)) return;
    if (phaseTries.current.phase !== phase) phaseTries.current = { phase, n: 0 };
    const tries = phaseTries.current;
    if (tries.n >= 20) return;
    const wait = Math.max(at - Date.now(), tries.n ? 15_000 : 0) + 1_500 + Math.random() * 2_500;
    if (wait > 12 * 3_600_000) return; // too far off for a timer; the page will be reopened before then
    const t = setTimeout(() => {
      tries.n += 1;
      load(phase === 'reveal');
    }, wait);
    return () => clearTimeout(t);
    // `setup` is here so a refresh that came back too early schedules the next try.
  }, [phase, revealIso, kickoffIso, load, setup]);

  const post = async (body: Record<string, unknown>, label: string): Promise<boolean> => {
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
      const clear = <T,>(d: Record<string, T>) => { const n = { ...d }; if (typeof body.squad_id === 'string') delete n[body.squad_id]; return n; };
      setDraft(clear);
      setTenDraft(clear);
      toast.success(label);
      if (j.warning) toast.error(j.warning);
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const slotsFor = (team: Team, editing = true): Record<string, Slot> => {
    if (draft[team.squad_id]) return draft[team.squad_id];
    const out: Record<string, Slot> = {};
    // Until a lineup is saved, everyone starts on the bench for whoever is setting it: the captain
    // picks the starters and the rest are there as subs. Once one is saved, anyone not in it was left
    // out on purpose. Someone who can only look (or a locked match) sees what is really saved: nothing.
    const nothingSaved = editing && (!team.lineup || (team.lineup.starting.length === 0 && team.lineup.bench.length === 0));
    team.roster.forEach((m) => { out[m.player_id] = nothingSaved ? 'bench' : 'out'; });
    team.lineup?.starting.forEach((p) => { out[p.player_id] = 'starting'; });
    team.lineup?.bench.forEach((p) => { out[p.player_id] = 'bench'; });
    return out;
  };

  const setSlot = (team: Team, playerId: string, slot: Slot) =>
    setDraft((d) => ({ ...d, [team.squad_id]: { ...slotsFor(team), [playerId]: slot } }));

  const tenFor = (team: Team): Record<string, TenMan | null> => {
    if (tenDraft[team.squad_id]) return tenDraft[team.squad_id];
    const out: Record<string, TenMan | null> = {};
    [...(team.lineup?.starting || []), ...(team.lineup?.bench || [])].forEach((p) => { out[p.player_id] = p.ten_man || null; });
    return out;
  };

  // Cycle: none → the natural mark for the slot (starter steps out, bench comes in) → the other → none.
  const cycleTen = (team: Team, playerId: string, slot: Slot) => {
    const cur = tenFor(team)[playerId] || null;
    const first: TenMan = slot === 'starting' ? 'out' : 'in';
    const next: TenMan | null = cur === null ? first : cur === first ? (first === 'in' ? 'out' : 'in') : null;
    setTenDraft((d) => ({ ...d, [team.squad_id]: { ...tenFor(team), [playerId]: next } }));
    // Touching the plan makes the lineup dirty so Save picks it up.
    if (!draft[team.squad_id]) setDraft((d) => ({ ...d, [team.squad_id]: slotsFor(team) }));
  };

  const saveLineup = (team: Team) => {
    const slots = slotsFor(team);
    const order = team.roster.map((m) => m.player_id);
    const starting = order.filter((id) => slots[id] === 'starting');
    const need = setup?.starters ?? 10;
    if (starting.length > need) { toast.error(`Matches are ${need}v${need}: pick at most ${need} starters`); return; }
    const ten = tenFor(team);
    post({
      action: 'set_lineup',
      squad_id: team.squad_id,
      starting,
      bench: order.filter((id) => slots[id] === 'bench'),
      ten_man: Object.fromEntries(order.filter((id) => slots[id] !== 'out' && ten[id]).map((id) => [id, ten[id]])),
    }, starting.length < need ? `${team.tag} lineup saved · ${need - starting.length} starter${need - starting.length === 1 ? '' : 's'} short` : `${team.tag} lineup saved`);
  };

  if (loading) return null;
  if (!setup || !setup.home || !setup.away) return null;
  if (setup.pending_sql) {
    return setup.viewer?.is_staff ? (
      <section className="rounded-xl bg-[#131A2B] px-4 py-3 text-sm text-[#F59E0B]">Match setup needs add-match-setup.sql run in Supabase.</section>
    ) : null;
  }

  const { home, away, viewer, match, progress } = setup;
  const starters = setup.starters ?? 10;
  const locked = match.locked;
  const auto = setup.automation ?? { enabled: true, reason: null };
  // Per-match automation switch: league staff and referees (the people in the arena on match
  // night). Hidden while automation is off site-wide, since only that switch brings it back.
  const manualSwitch = (viewer?.is_staff || viewer?.is_referee) && auto.reason !== 'site' ? (
    auto.enabled ? (
      <button type="button" onClick={() => { if (confirm('Take this match out of the zone queue? The zone will not open its arena, place anyone or apply subs; referees run it by hand.')) post({ action: 'set_manual_zone', manual: true }, 'This match is now run by hand'); }} disabled={busy !== null} className="text-xs text-[#F87171] hover:text-[#FCA5A5] disabled:opacity-50" title="Take this match out of the zone queue">Run by hand</button>
    ) : (
      <button type="button" onClick={() => post({ action: 'set_manual_zone', manual: false }, 'Zone automation is back on for this match')} disabled={busy !== null} className="text-xs text-[#34D399] hover:text-[#6EE7B7] disabled:opacity-50">Automate again</button>
    )
  ) : null;

  // Match chat: the in-game chat the referee opens so both squads' captains can raise things during
  // the match. Shown only to league staff, referees and the two squads' captains / co-captains.
  const saveChat = async () => {
    if (chatDraft === null) return;
    await post({ action: 'set_match_chat', chat: chatDraft }, chatDraft.trim() ? 'Match chat saved' : 'Match chat cleared');
    setChatDraft(null);
  };
  const chatRow = setup.can_see_match_chat ? (
    <div className="rounded-md bg-[#1B2438] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Match chat</span>
        {chatDraft !== null ? (
          <>
            <input
              type="text"
              value={chatDraft}
              maxLength={30}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveChat(); } }}
              placeholder="chat name, e.g. ptifang"
              autoFocus
              className="w-56 rounded-md bg-[#0B0F1A] border border-white/10 px-2 py-1 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
            />
            <button type="button" onClick={saveChat} disabled={busy !== null} className={btnPrimary}>Save</button>
            <button type="button" onClick={() => setChatDraft(null)} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">Cancel</button>
          </>
        ) : (
          <>
            {setup.match_chat ? (
              <>
                <span className="font-mono text-sm text-[#22D3EE]">{setup.match_chat}</span>
                {/* ?chatadd adds one chat and keeps the ones you are already in; ?chat= would replace them. */}
                <span className="text-[11px] text-[#8B98B0]">in game, add it to your chats: <span className="font-mono text-[#E6EDF7]">?chatadd {setup.match_chat}</span></span>
              </>
            ) : (
              <span className="text-sm text-[#8B98B0]">{viewer?.can_set_match_chat ? 'Not set yet.' : 'The referee hasn’t set one yet.'}</span>
            )}
            {viewer?.can_set_match_chat && (
              <button type="button" onClick={() => setChatDraft(setup.match_chat || '')} className="text-xs text-[#F59E0B] hover:text-[#FBBF24]">{setup.match_chat ? 'Change' : 'Set chat name'}</button>
            )}
          </>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#8B98B0]">For raising things with the referees during the match. Only league staff, referees and both squads’ captains and co-captains can see this.</p>
    </div>
  ) : null;

  // FS Green: only the captain and later-round picks may play; everyone else stays on the bench.
  const isGreen = match.fs_color === 'green' && !!match.green_min_round;
  const minRound = match.green_min_round || 4;
  const greenNote = isGreen ? (
    <div className="rounded-md bg-[#34D399]/10 ring-1 ring-[#34D399]/30 px-3 py-2 text-xs text-[#E6EDF7]">
      <span className="font-medium text-[#34D399]">FS Green.</span>{' '}
      Only the captain and round {minRound}+ picks can start or be subbed in. Rounds 1–{minRound - 1} stay in spec and coach. If one of them plays, the match scores as Red for both squads.
    </div>
  ) : null;
  const manualNote = auto.enabled ? null : (
    <div className="rounded-md bg-[#F87171]/10 ring-1 ring-[#F87171]/30 px-3 py-2 text-xs text-[#E6EDF7]">
      <span className="font-medium text-[#F87171]">Zone automation is off{auto.reason === 'match' ? ' for this match' : ' site-wide'}.</span>{' '}
      The arena is not opened and nobody is placed automatically. Referees: open <span className="font-mono">{match.arena || 'the match arena'}</span>, lock it, and move players onto their teams by hand from the lineups below.
    </div>
  );
  const involved = !!viewer && (viewer.is_staff || viewer.leads_home || viewer.leads_away || (!!viewer.is_referee && setup.side_released));
  const subs = setup.subs || [];
  const makeSub = (team: Team) => {
    const pick = subPick[team.squad_id];
    if (!pick?.out || !pick?.in) { toast.error('Pick who comes out and who goes in'); return; }
    const outAlias = team.roster.find((m) => m.player_id === pick.out)?.alias || 'player';
    const inAlias = team.roster.find((m) => m.player_id === pick.in)?.alias || 'player';
    post({ action: 'sub', squad_id: team.squad_id, out_player_id: pick.out, in_player_id: pick.in }, `${team.tag}: ${inAlias} in for ${outAlias}`);
    setSubPick((s) => ({ ...s, [team.squad_id]: { out: '', in: '' } }));
  };

  // The 10-man swap from the saved plan: each starter marked 'out' trades places with a
  // bench player marked 'in', in lineup order. 'back' is the same pairs the other way round.
  const tenPairs = (team: Team) => {
    const st = team.lineup?.starting || [];
    const bn = team.lineup?.bench || [];
    const zip = (outs: Entry[], ins: Entry[]) => outs.slice(0, ins.length).map((o, k) => ({ out: o, in: ins[k] }));
    return {
      go: zip(st.filter((p) => p.ten_man === 'out'), bn.filter((p) => p.ten_man === 'in')),
      back: zip(st.filter((p) => p.ten_man === 'in'), bn.filter((p) => p.ten_man === 'out')),
    };
  };
  const runTen = async (team: Team, pairs: { out: Entry; in: Entry }[]) => {
    for (const p of pairs) {
      const ok = await post({ action: 'sub', squad_id: team.squad_id, out_player_id: p.out.player_id, in_player_id: p.in.player_id }, `${team.tag}: ${p.in.alias} in for ${p.out.alias}`);
      if (!ok) break;
    }
  };
  const revealTime = new Date(setup.side_reveal_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  // While the match time is TBD there is no reveal time to quote yet.
  const revealAt = match.time_tbd ? 'five minutes before the match, once its time is set' : `at ${revealTime}, five minutes before the match`;
  const revealUntil = match.time_tbd ? 'five minutes before the match, once its time is set' : `${revealTime}, five minutes before the match`;
  const sidesLine = home.side ? `${away.tag} · ${SIDE_LABEL[away.side!]}  ·  ${home.tag} · ${SIDE_LABEL[home.side]}` : null;

  // Public / uninvolved view: progress flags, plus the sides once released.
  if (!involved) {
    return (
      <section className="rounded-xl overflow-hidden bg-[#131A2B]">
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-[#E6EDF7]">Match setup</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Flag on={progress.side_picked} label={`${home.tag} side`} />
            <Flag on={progress.home_lineup_set} label={`${home.tag} lineup`} />
            <Flag on={progress.away_lineup_set} label={`${away.tag} lineup`} />
            {/* A referee sees this view until the sides are released; the switch is here too. */}
            {manualSwitch && <span className="ml-2">{manualSwitch}</span>}
          </div>
        </div>
        {sidesLine && <div className="px-4 pb-2 text-sm text-[#E6EDF7]">{sidesLine}</div>}
        {manualNote && <div className="px-4 pb-2">{manualNote}</div>}
        {greenNote && <div className="px-4 pb-2">{greenNote}</div>}
        {/* A referee sees this view until the sides are released; they set the chat here. */}
        {chatRow && <div className="px-4 pb-2">{chatRow}</div>}
        <p className="px-4 pb-3 text-[11px] text-[#8B98B0]">
          {setup.side_released ? 'Sides are out. ' : `Sides are released ${revealAt}. `}
          Lineups stay private to each squad's captains and league staff.
        </p>
      </section>
    );
  }

  const sideText = (() => {
    if (home.side) {
      const base = `${home.tag} picked ${SIDE_LABEL[home.side]} · ${away.tag} plays ${SIDE_LABEL[away.side!]}.`;
      if (viewer?.is_staff) return base;
      if (viewer?.leads_home) return setup.side_released ? `${base} ${away.tag} can see this now.` : `${base} Hidden from ${away.tag} and the public until ${revealUntil}.`;
      return base; // away leads, after release
    }
    if (viewer?.can_pick_side) return `${home.tag} is home: pick your side. Your pick stays hidden from ${away.tag} and the public until ${revealUntil}.`;
    if (viewer?.leads_home) return `${home.tag} is home and picks the side.`;
    // Away leads before release: the pick itself is hidden from them.
    return progress.side_picked
      ? `${home.tag} (home) has picked a side. It is released to you ${revealAt}.`
      : `Waiting on ${home.name} (home) to pick a side. It is released to you ${revealAt}.`;
  })();

  const game = prefs.skin === 'game';
  const src = prefs.color;
  // In-game skin: black panel, small tight type, no row rules. Close to the zone's own player list.
  const gameFont = game ? { fontFamily: 'Tahoma, Verdana, "Segoe UI", sans-serif' } : undefined;
  const rowCls = game ? 'px-2 text-[11px] leading-[15px]' : 'px-3 py-px text-[13px] leading-5';
  const rule = game ? 'border-[#2a2a2a]' : 'border-white/[0.06]';
  const dropSquad = (squadId: string) => <T,>(d: Record<string, T>) => { const n = { ...d }; delete n[squadId]; return n; };

  const TenTag = ({ v }: { v: TenMan | null | undefined }) => v ? (
    <span
      className={`shrink-0 rounded-sm px-1 text-[9px] font-semibold leading-[14px] ${v === 'in' ? 'bg-[#d946ef]/20 text-[#f0abfc]' : 'bg-[#FB923C]/15 text-[#FB923C]'}`}
      title={v === 'in' ? 'Subs in on 10-man' : 'Subs out on 10-man'}
    >10M {v}</span>
  ) : null;

  const renderTeam = (team: Team, canEdit: boolean) => {
    const isHome = team.squad_id === home.squad_id;
    const canSee = !!team.lineup;
    const slots = canSee ? slotsFor(team, canEdit) : {};
    const ten = canSee ? tenFor(team) : {};
    const roster = sortByPrefs(team.roster, (m) => m.player_id, roles, prefs);
    const starting = roster.filter((m) => slots[m.player_id] === 'starting');
    const bench = roster.filter((m) => slots[m.player_id] === 'bench');
    const dirty = !!draft[team.squad_id] || !!tenDraft[team.squad_id];
    const submitted = isHome ? progress.home_lineup_set : progress.away_lineup_set;
    const full = starting.length >= starters;
    const over = starting.length > starters;
    const f = focus[team.squad_id] || null;
    const pool = starting.length ? starting : roster;
    const tenIn = roster.filter((m) => slots[m.player_id] !== 'out' && ten[m.player_id] === 'in');
    const tenOut = roster.filter((m) => slots[m.player_id] !== 'out' && ten[m.player_id] === 'out');
    const pairs = canSee ? tenPairs(team) : { go: [], back: [] };

    return (
      <div className={`rounded-md overflow-hidden ${game ? 'bg-black ring-1 ring-[#2a2a2a]' : 'bg-[#1B2438]'}`} style={gameFont}>
        <div className={`px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-b ${rule}`}>
          <div>
            <div className={`${game ? 'text-[13px] font-bold text-[#F5E27A]' : 'font-display text-lg text-[#E6EDF7]'} leading-tight`}>
              {team.tag} <span className="text-xs font-sans font-normal text-[#8B98B0]">{isHome ? 'home' : 'away'}{team.side ? ` · ${SIDE_LABEL[team.side]}` : ''}</span>
            </div>
            <div className="text-[11px] text-[#8B98B0] leading-tight">
              {team.team_starting
                ? <>Starters on <span className="text-[#34D399]">{team.team_starting}</span> · bench in spec on <span className="text-[#E6EDF7]">{team.team_bench}</span></>
                : canSee ? 'Team names are set once the side is known.' : null}
            </div>
          </div>
          {canSee ? (
            <div className="text-xs tabular-nums text-[#8B98B0]"><span className={over ? 'text-[#F87171]' : full ? 'text-[#34D399]' : 'text-[#F59E0B]'}>{starting.length}/{starters}</span> starting · {bench.length} bench</div>
          ) : (
            <Flag on={submitted} label={submitted ? 'Lineup submitted' : 'No lineup yet'} />
          )}
        </div>

        {team.roster.length > 0 && (
          <div className={`px-3 py-0.5 flex flex-wrap items-center justify-between gap-x-3 border-b ${rule}`}>
            <Coverage
              ids={pool.map((m) => m.player_id)}
              roles={roles}
              src={src}
              label={starting.length ? 'Starters' : 'Roster'}
              focus={f}
              onFocus={(k) => setFocus((x) => ({ ...x, [team.squad_id]: k }))}
            />
            {(tenIn.length > 0 || tenOut.length > 0) && (
              <span className="text-[10px] text-[#8B98B0]" title="Planned 10-man swap">
                10-man: <span className="text-[#f0abfc]">{tenIn.map((m) => m.alias).join(', ') || '?'}</span> in for <span className="text-[#FB923C]">{tenOut.map((m) => m.alias).join(', ') || '?'}</span>
              </span>
            )}
          </div>
        )}

        {!canSee ? (
          <p className="px-3 py-2 text-xs text-[#8B98B0]">{team.tag}&apos;s lineup is private to their captains and staff.</p>
        ) : team.roster.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[#8B98B0]">No players on the roster yet.</p>
        ) : canEdit ? (
          <ul className={game ? 'py-0.5' : 'divide-y divide-white/[0.04]'}>
            {roster.map((m) => {
              const s = slots[m.player_id];
              const r = roles[m.player_id];
              const t = ten[m.player_id] || null;
              return (
                <li key={m.player_id} className={`flex items-center gap-1.5 ${rowCls} ${dimmed(r, f, src) ? 'opacity-25' : s === 'out' ? 'opacity-60' : ''}`}>
                  <span className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
                    <PlayerName alias={m.alias} roles={r} src={src} className="min-w-0 truncate" />
                    {m.role !== 'player' && <span className="shrink-0 text-[9px] uppercase tracking-wide text-[#F59E0B]">{m.role === 'captain' ? 'C' : 'Co-C'}</span>}
                    {isGreen && m.green_ok === false && <span className="shrink-0 rounded-sm bg-[#F87171]/15 px-1 text-[9px] uppercase tracking-wide text-[#F87171]" title={`Drafted in round ${m.draft_round ?? '1–' + (minRound - 1)}: can't play an FS Green match`}>R{m.draft_round ?? `1–${minRound - 1}`} · bench only</span>}
                    <SideLean roles={r} />
                    <RoleTags roles={r} src={src} max={3} className="hidden sm:inline-flex shrink-0" />
                  </span>
                  {s !== 'out' && (
                    <button
                      type="button"
                      onClick={() => cycleTen(team, m.player_id, s)}
                      title={t === 'in' ? 'Subs in on 10-man. Click to switch to sub out.' : t === 'out' ? 'Subs out on 10-man. Click to clear.' : s === 'starting' ? 'Mark to sub out on 10-man' : 'Mark to sub in on 10-man (e.g. your 10-man infil)'}
                      className={`shrink-0 rounded-sm px-1 text-[9px] font-semibold leading-[16px] transition-colors ${t === 'in' ? 'bg-[#d946ef]/20 text-[#f0abfc]' : t === 'out' ? 'bg-[#FB923C]/15 text-[#FB923C]' : 'text-[#8B98B0]/40 hover:text-[#8B98B0]'}`}
                    >
                      10M{t ? ` ${t}` : ''}
                    </button>
                  )}
                  <span className="flex shrink-0 gap-px">
                    {(['starting', 'bench', 'out'] as Slot[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSlot(team, m.player_id, k)}
                        disabled={k === 'starting' && ((s !== 'starting' && full) || (isGreen && m.green_ok === false))}
                        title={k === 'starting' && isGreen && m.green_ok === false ? `FS Green: only the captain and round ${minRound}+ picks can start` : k === 'starting' && s !== 'starting' && full ? `${starters} starters already picked` : undefined}
                        className={`rounded-sm px-1.5 text-[10px] leading-[16px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${s === k
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
          <div className="px-3 py-1.5 space-y-1.5">
            {([['Starting', starting, team.team_starting], ['Bench', bench, team.team_bench]] as const).map(([label, list, teamName]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide text-[#8B98B0] leading-4">{label}{teamName ? ` · ${teamName}` : ''}</div>
                <div className={game ? 'text-[11px] leading-[15px]' : 'text-[13px] leading-5'}>
                  {list.length === 0 ? <span className="text-xs text-[#8B98B0]/60">{label === 'Starting' ? 'Not set yet' : 'Nobody'}</span> : list.map((m) => (
                    <div key={m.player_id} className={`flex items-center gap-1.5 whitespace-nowrap ${dimmed(roles[m.player_id], f, src) ? 'opacity-25' : ''}`}>
                      <PlayerName alias={m.alias} roles={roles[m.player_id]} src={src} className="min-w-0 truncate" />
                      <SideLean roles={roles[m.player_id]} />
                      <RoleTags roles={roles[m.player_id]} src={src} max={3} className="hidden sm:inline-flex shrink-0" />
                      <TenTag v={ten[m.player_id]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Subs: from side release until the result is in. Captains, staff and referees. */}
        {canSee && (isHome ? viewer?.can_sub_home : viewer?.can_sub_away) && (
          <div className={`px-3 py-1.5 border-t space-y-1 ${rule}`}>
            <div className="text-[10px] uppercase tracking-wide text-[#F59E0B]">Sub</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <select
                value={subPick[team.squad_id]?.out || ''}
                onChange={(e) => setSubPick((s) => ({ ...s, [team.squad_id]: { out: e.target.value, in: s[team.squad_id]?.in || '' } }))}
                className="rounded-md bg-[#0B0F1A] border border-white/10 px-2 py-1 text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
                aria-label="Player coming out"
              >
                <option value="">Out…</option>
                {starting.map((m) => <option key={m.player_id} value={m.player_id}>{m.alias}</option>)}
              </select>
              <span className="text-[#8B98B0]">→</span>
              <select
                value={subPick[team.squad_id]?.in || ''}
                onChange={(e) => setSubPick((s) => ({ ...s, [team.squad_id]: { out: s[team.squad_id]?.out || '', in: e.target.value } }))}
                className="rounded-md bg-[#0B0F1A] border border-white/10 px-2 py-1 text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
                aria-label="Player going in"
              >
                <option value="">In…</option>
                {/* FS Green: early-round picks can't be subbed in, so they aren't offered. */}
                {bench.filter((m) => !(isGreen && m.green_ok === false)).map((m) => <option key={m.player_id} value={m.player_id}>{m.alias} (bench)</option>)}
                {roster.filter((m) => slots[m.player_id] === 'out' && !(isGreen && m.green_ok === false)).map((m) => <option key={m.player_id} value={m.player_id}>{m.alias}</option>)}
              </select>
              <button type="button" onClick={() => makeSub(team)} disabled={busy !== null || !subPick[team.squad_id]?.out || !subPick[team.squad_id]?.in} className={btnPrimary}>Make sub</button>
              {pairs.go.length > 0 && (
                <button type="button" onClick={() => runTen(team, pairs.go)} disabled={busy !== null} className="px-3 py-2 rounded-md text-sm bg-[#d946ef]/20 text-[#f0abfc] hover:bg-[#d946ef]/30 disabled:opacity-50 transition-colors" title={pairs.go.map((p) => `${p.in.alias} in for ${p.out.alias}`).join('\n')}>
                  Go 10-man
                </button>
              )}
              {pairs.back.length > 0 && (
                <button type="button" onClick={() => runTen(team, pairs.back)} disabled={busy !== null} className={btnQuiet} title={pairs.back.map((p) => `${p.in.alias} back in for ${p.out.alias}`).join('\n')}>
                  Undo 10-man
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#8B98B0]">
              {auto.enabled
                ? <>The zone moves them within a minute: the sub is unspecced onto {team.team_starting || 'the team'}, the player coming out goes to spec on {team.team_bench || 'the bench team'}.</>
                : <>Zone automation is off: a referee moves them by hand. The sub goes onto {team.team_starting || 'the team'}, the player coming out to spec on {team.team_bench || 'the bench team'}.</>}
            </p>
          </div>
        )}
        {canSee && subs.some((s) => s.squad_id === team.squad_id) && (
          <ul className={`px-3 py-1.5 border-t space-y-0.5 text-[11px] text-[#8B98B0] ${rule}`}>
            {subs.filter((s) => s.squad_id === team.squad_id).map((s) => (
              <li key={s.id}><span className="text-[#E6EDF7]">{s.in_alias}</span> in for <span className="text-[#E6EDF7]">{s.out_alias}</span> · {new Date(s.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{s.by_alias ? ` · by ${s.by_alias}` : ''}</li>
            ))}
          </ul>
        )}

        {canEdit && canSee && team.roster.length > 0 && (
          <div className={`px-3 py-1.5 flex items-center justify-between gap-2 border-t ${rule}`}>
            <span className="text-[11px] text-[#8B98B0]">
              {over ? <span className="text-[#F87171]">Too many starters · matches are {starters}v{starters}</span>
                : dirty ? (full ? 'Unsaved changes' : `Unsaved · ${starters - starting.length} starter${starters - starting.length === 1 ? '' : 's'} short`)
                : submitted ? (full ? 'Saved' : `Saved · ${starters - starting.length} starter${starters - starting.length === 1 ? '' : 's'} short`)
                : 'Nothing saved yet · pick your starters, then Save lineup'}
            </span>
            <div className="flex gap-2">
              {dirty && <button type="button" onClick={() => { setDraft(dropSquad(team.squad_id)); setTenDraft(dropSquad(team.squad_id)); }} className={btnQuiet}>Discard</button>}
              <button type="button" onClick={() => saveLineup(team)} disabled={!dirty || over || busy !== null} className={btnPrimary}>Save lineup</button>
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
          {match.arena && <span className="font-mono text-[#E6EDF7]" title="The in-game arena the zone opens for this match">{match.arena}</span>}
          {locked ? <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase tracking-wide">{viewer?.sub_window ? 'Live · subs open' : 'Locked'}</span> : progress.ready ? <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 uppercase tracking-wide text-[#34D399]">Ready</span> : null}
          {viewer?.is_staff && (
            <button type="button" onClick={() => post({ action: 'swap_home' }, 'Home and away swapped')} disabled={busy !== null} className="text-[#F59E0B] hover:text-[#FBBF24] disabled:opacity-50">Swap home/away</button>
          )}
          {manualSwitch}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {manualNote}
        {greenNote}
        {chatRow}
        {/* Side */}
        <div className="rounded-md bg-[#1B2438] px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[#E6EDF7]">{sideText}</div>
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
          {/* Away first, home second: the rulebook's arena order. */}
          {renderTeam(away, !!viewer?.can_edit_away)}
          {renderTeam(home, !!viewer?.can_edit_home)}
        </div>

        <p className="text-[11px] text-[#8B98B0]">
          Matches are {starters}v{starters}. Everyone starts on the bench: click Start for your {starters} starters, and set Out only for players who won't be at the match. Mark 10M on a bench player to sub them in when you go 10-man (your 10-man infil) and on the starter they replace; Go 10-man then makes those subs. Save when you're done. Lineups are private to your own captains and league staff. The home side is released to everyone five minutes before the match. Captains and co-captains can change things until the scheduled time; staff any time.
          From side release until the result is recorded, captains, staff and referees can make subs instead. The zone opens the arena named above, places starters on their team and keeps the bench in spec on the other team name, and applies subs as they come in.
        </p>
      </div>
    </section>
  );
}
