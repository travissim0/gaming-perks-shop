'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  applyPicks,
  draftStamp,
  secondsLeft,
  type DraftBoard,
  type DraftBundle,
  type DraftMe,
  type DraftPick,
  type DraftPresence,
  type DraftRow,
  type DraftState,
} from '@/lib/ctfdl-draft';

/** How often the room asks for the small shared state while a draft runs. */
const STATE_POLL_MS = 2000;
/** The full board is only re-read this often during a draft (late registrations, roster edits). */
const BOARD_POLL_MS = 30000;
/** Before the draft starts nothing moves fast: the board is enough. */
const SETUP_POLL_MS = 10000;
/** Captains and staff check in this often so the room can show them as present. */
const CHECK_IN_MS = 20000;
/** Everyone else re-checks who they are this often (e.g. made co-captain mid-draft). */
const ME_REFRESH_MS = 60000;
/** A hidden tab polls this many times slower. */
const HIDDEN_SLOWDOWN = 3;

const ANON: DraftBundle['viewer'] = { user_id: null, alias: null, is_staff: false, my_team_id: null };

type Core = { draft: DraftRow | null; picks: DraftPick[] };
type RoomEntry = DraftPresence & { key: string };

/** Picks and pick number agree (one pick row per turn taken). A read that straddles a pick can disagree. */
const consistent = (c: Core) => !c.draft || c.picks.length === c.draft.current_pick - 1;
const samePicks = (a: DraftPick[], b: DraftPick[]) => a.length === b.length && a[a.length - 1]?.id === b[b.length - 1]?.id;

/** Everything on the board except the parts the live state owns (draft row, picks, drafted flags). */
const boardSignature = (b: DraftBoard) =>
  JSON.stringify([b.teams, b.players.map((p) => ({ ...p, picked_team_id: null, picked_overall: null })), b.season, b.league, b.staff_adp_boards]);

/**
 * Live draft state for the lobby / recap / admin pages.
 *
 * The room is built from three separate reads so a full audience costs about the same as one viewer:
 * - the BOARD (/board: teams, pool, picks) is the same for everybody and briefly cached. Loaded once,
 *   then refreshed slowly;
 * - the STATE (/state: draft row + picks, a few kB) is what changes during a draft. Polled every
 *   couple of seconds, also the same for everybody and cached for a second;
 * - ME (/me: staff flag, your team, your private queue) is the only personal read, and a failed
 *   one never downgrades you to "not a captain".
 * Realtime is only a nudge to ask for the state sooner; nothing depends on it arriving.
 *
 * Also runs a 1s clock corrected by the server's timestamp, pokes /tick once per turn when the clock
 * hits zero (server decides whether to auto-pick), and tracks who is in the room: captains and staff
 * by a server check-in, everyone by Realtime presence.
 */
export function useDraft(opts: { draftId?: string | null; seasonId?: string | null; presence?: boolean } = {}) {
  const { draftId, seasonId, presence = false } = opts;
  const [board, setBoard] = useState<DraftBoard | null>(null);
  const [core, setCore] = useState<Core | null>(null);
  const [me, setMe] = useState<DraftMe | null>(null);
  const [here, setHere] = useState<DraftPresence[] | null>(null);
  const [room, setRoom] = useState<RoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const gen = useRef(0);
  const boardSig = useRef('');
  const coreRef = useRef<Core | null>(null);
  const coreTime = useRef(0);
  const meRef = useRef<DraftMe | null>(null);
  const hereSig = useRef('');
  const offsetRef = useRef<number | null>(null);
  const lastTicked = useRef<string | null>(null);
  const stateInflight = useRef<{ v: number; run: Promise<void> } | null>(null);
  const channelRef = useRef<{ channel: ReturnType<typeof supabase.channel>; joined: boolean } | null>(null);
  const tabKey = useRef(`tab-${Math.random().toString(36).slice(2)}`);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch {
      return {};
    }
  }, []);

  /**
   * A shared answer may be a second or two old, so its timestamp can only be BEHIND the server's
   * clock, never ahead: the freshest sample seen is the best estimate of the offset.
   */
  const noteServerTime = useCallback((iso: string | undefined) => {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return 0;
    const sample = t - Date.now();
    offsetRef.current = offsetRef.current == null ? sample : Math.max(offsetRef.current, sample);
    return t;
  }, []);

  /** Take a draft row + picks only if it is newer than what the room already shows. */
  const acceptCore = useCallback((draft: DraftRow | null, picks: DraftPick[], at: number) => {
    const cur = coreRef.current;
    const next: Core = { draft, picks: draft ? picks : [] };
    let take: boolean;
    if (!cur) take = true;
    else if (cur.draft && draft && cur.draft.id === draft.id && draftStamp(draft) && draftStamp(cur.draft)) {
      const a = draftStamp(draft), b = draftStamp(cur.draft);
      take = a > b || (a === b && !samePicks(next.picks, cur.picks) && consistent(next));
    } else if (!cur.draft && !draft) take = false;
    else take = at >= coreTime.current;
    if (!take) return;
    coreRef.current = next;
    coreTime.current = at;
    setCore(next);
  }, []);

  const acceptBoard = useCallback((b: DraftBoard) => {
    const at = noteServerTime(b.server_time);
    const sig = boardSignature(b);
    if (sig !== boardSig.current) {
      boardSig.current = sig;
      setBoard(b);
    }
    acceptCore(b.draft, b.picks, at);
  }, [noteServerTime, acceptCore]);

  const acceptMe = useCallback((m: DraftMe) => {
    if (JSON.stringify(m) === JSON.stringify(meRef.current)) return;
    meRef.current = m;
    setMe(m);
  }, []);

  const applyState = useCallback((s: DraftState) => {
    const at = noteServerTime(s.server_time);
    acceptCore(s.draft, s.picks || [], at);
    const sig = JSON.stringify(s.here);
    if (sig !== hereSig.current) {
      hereSig.current = sig;
      setHere(s.here);
    }
  }, [noteServerTime, acceptCore]);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (draftId) params.set('draft', draftId);
    else if (seasonId) params.set('season', seasonId);
    return params;
  }, [draftId, seasonId]);

  /** The shared board. `fresh` skips the cached copy (after a staff action or a failed one). */
  const loadBoard = useCallback(async (fresh = false) => {
    const mine = gen.current;
    try {
      const params = query();
      if (fresh) { params.set('fresh', '1'); params.set('t', String(Date.now())); }
      // No sign-in token here on purpose: that is what lets one copy be served to everybody.
      const res = await fetch(`/api/ctfdl/draft/board?${params.toString()}`, fresh ? { cache: 'no-store' } : undefined);
      if (!res.ok) throw new Error(`Failed to load draft (${res.status})`);
      const json: DraftBoard = await res.json();
      if (mine !== gen.current) return;
      acceptBoard(json);
      setError(null);
    } catch (e: any) {
      // A failed refresh keeps the room as it was; only a room with nothing to show reports it.
      if (mine === gen.current && !boardSig.current) setError(e.message || 'Failed to load draft');
    }
  }, [query, acceptBoard]);

  /** Who am I here. `checkIn` also marks a captain / staff member as in the room. Returns false if it failed. */
  const loadMe = useCallback(async (checkIn = false) => {
    const mine = gen.current;
    try {
      const headers = await authHeaders();
      const res = checkIn
        ? await fetch('/api/ctfdl/draft/me', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ draft_id: draftId || null, season_id: seasonId || null }) })
        : await fetch(`/api/ctfdl/draft/me?${query().toString()}`, { headers, cache: 'no-store' });
      if (!res.ok) return false;
      const json: DraftMe = await res.json();
      if (mine === gen.current) acceptMe(json);
      return true;
    } catch {
      return false;
    }
  }, [authHeaders, draftId, seasonId, query, acceptMe]);

  /**
   * Ask for the shared state. `hint` is a change this tab has just heard about (updated_at in ms):
   * the answer is at least that new. Without one, viewers on the same pick share a cached answer.
   */
  const pollState = useCallback((hint = 0): Promise<void> => {
    const id = coreRef.current?.draft?.id;
    if (!id) return Promise.resolve();
    const v = Math.max(hint, draftStamp(coreRef.current?.draft));
    if (stateInflight.current && stateInflight.current.v >= v) return stateInflight.current.run;
    const mine = gen.current;
    // Say which picks this tab already holds, so only the new ones come back.
    const held = coreRef.current?.picks || [];
    const lastId = held.length ? held[held.length - 1].id : '';
    const since = lastId ? `&after=${held.length}&last=${lastId.slice(0, 8)}` : '';
    const run = (async () => {
      try {
        const res = await fetch(`/api/ctfdl/draft/state?draft=${encodeURIComponent(id)}&v=${v}${since}`);
        if (!res.ok) return;
        const json: DraftState = await res.json();
        if (mine !== gen.current) return;
        let picks = json.picks || [];
        if (json.base) {
          // Only the newer picks came back: join them to the ones held, unless those changed meanwhile.
          const cur = coreRef.current?.picks || [];
          if (cur[json.base - 1]?.id !== lastId) return;
          picks = [...cur.slice(0, json.base), ...picks];
        }
        applyState({ ...json, picks });
      } catch { /* the next poll will catch up */ } finally {
        if (stateInflight.current?.run === run) stateInflight.current = null;
      }
    })();
    stateInflight.current = { v, run };
    return run;
  }, [applyState]);

  const refetch = useCallback(async () => {
    await Promise.all([loadBoard(true), loadMe(false)]);
  }, [loadBoard, loadMe]);

  /** Apply a bundle returned by an action response without waiting for a refetch. */
  const applyBundle = useCallback((b: DraftBundle | undefined | null) => {
    if (!b) return;
    const { viewer, my_queue, ...rest } = b;
    acceptBoard(rest);
    if (viewer) acceptMe({ viewer, draft_id: b.draft?.id || null, ...(my_queue ? { my_queue } : {}) });
  }, [acceptBoard, acceptMe]);

  // First load (and again when the page switches to another draft / season)
  useEffect(() => {
    gen.current += 1;
    boardSig.current = '';
    coreRef.current = null;
    coreTime.current = 0;
    meRef.current = null;
    hereSig.current = '';
    setBoard(null);
    setCore(null);
    setMe(null);
    setHere(null);
    setError(null);
    setLoading(true);
    const mine = gen.current;
    let retry: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const [, meOk] = await Promise.all([loadBoard(false), loadMe(false)]);
      if (mine !== gen.current) return;
      setLoading(false);
      // Sign-in couldn't be checked just now: the room opens as a viewer and asks again shortly.
      const again = (n: number) => {
        retry = setTimeout(async () => {
          if (mine !== gen.current || (await loadMe(false)) || n >= 5) return;
          again(n + 1);
        }, Math.min(5000 * (n + 1), 30000));
      };
      if (!meOk) again(0);
    })();
    return () => { if (retry) clearTimeout(retry); };
  }, [loadBoard, loadMe]);

  // Signing in or out on this page changes who "me" is.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id || null;
      if (meRef.current && uid !== meRef.current.viewer.user_id) setTimeout(() => { loadMe(false); }, 0);
    });
    return () => { data.subscription.unsubscribe(); };
  }, [loadMe]);

  const liveId = core?.draft?.id || null;
  const status = core?.draft?.status;
  const viewer = me?.viewer || ANON;

  // Polling. Live: the small state every couple of seconds, the board slowly. Setup: just the board.
  useEffect(() => {
    if (!liveId || !status || status === 'complete') return;
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const every = (ms: number, job: () => Promise<unknown>, slot: number) => {
      const loop = async () => {
        if (stopped) return;
        await job();
        if (!stopped) timers[slot] = setTimeout(loop, hidden() ? ms * HIDDEN_SLOWDOWN : ms);
      };
      timers[slot] = setTimeout(loop, ms);
    };
    if (status === 'setup') every(SETUP_POLL_MS, () => loadBoard(false), 0);
    else {
      every(STATE_POLL_MS, () => pollState(), 0);
      // Spread out so a room that opened together doesn't refresh the board together.
      every(BOARD_POLL_MS + Math.random() * 5000, () => loadBoard(false), 1);
    }
    const onVisible = () => { if (!hidden()) { if (status === 'setup') loadBoard(false); else pollState(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [liveId, status, loadBoard, pollState]);

  // A pick for someone this tab's board doesn't have yet (registered after it loaded): get the board.
  const lastUnknown = useRef('');
  useEffect(() => {
    if (!board || !core) return;
    const known = new Set(board.players.map((p) => p.player_id));
    const unknown = core.picks.filter((p) => p.player_id && !known.has(p.player_id)).map((p) => p.player_id).join(',');
    if (!unknown || unknown === lastUnknown.current) return;
    lastUnknown.current = unknown;
    loadBoard(false);
  }, [board, core, loadBoard]);

  // Realtime: a change to the draft row is a nudge to fetch the state now instead of at the next poll.
  // The channel is created once per draft; who I am is sent with track() and updated in place.
  useEffect(() => {
    if (!liveId) return;
    // `enabled: true` is required — this supabase-js version leaves presence off
    // otherwise, so no join/sync events ever arrive (verified against live).
    const channel = supabase.channel(`ctfdl-draft-${liveId}`, {
      config: { presence: { key: tabKey.current, enabled: true } as any },
    });
    const entry = { channel, joined: false };
    channelRef.current = entry;
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'ctfdl_drafts', filter: `id=eq.${liveId}` }, (payload: any) => {
      const stamp = payload?.new?.updated_at ? Date.parse(payload.new.updated_at) : NaN;
      pollState(Number.isFinite(stamp) ? stamp : 0);
    });
    if (presence) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<DraftPresence>();
        const people: RoomEntry[] = [];
        for (const key of Object.keys(state)) {
          // One tab can hold more than one entry (tracked before and after sign-in was known).
          // Any entry that says who it is wins; a tab with none counts once, as a viewer.
          const named = state[key].filter((e) => e.user_id);
          for (const e of named.length ? named : state[key].slice(0, 1)) {
            people.push({ key, user_id: e.user_id || null, alias: e.alias || null, is_staff: !!e.is_staff, team_id: e.team_id || null });
          }
        }
        setRoom(people);
      });
    }
    channel.subscribe((s) => {
      if (s !== 'SUBSCRIBED') return;
      entry.joined = true;
      const v = meRef.current?.viewer || ANON;
      if (presence) channel.track({ user_id: v.user_id, alias: v.alias, is_staff: v.is_staff, team_id: v.my_team_id, at: Date.now() });
    });
    return () => {
      entry.joined = false;
      if (channelRef.current === entry) channelRef.current = null;
      setRoom([]);
      supabase.removeChannel(channel);
    };
  }, [liveId, presence, pollState]);

  // Who I am became known (or changed) after the channel was joined: update the tracked entry in place.
  useEffect(() => {
    const entry = channelRef.current;
    if (!presence || !entry?.joined) return;
    entry.channel.track({ user_id: viewer.user_id, alias: viewer.alias, is_staff: viewer.is_staff, team_id: viewer.my_team_id, at: Date.now() });
  }, [presence, liveId, viewer.user_id, viewer.alias, viewer.is_staff, viewer.my_team_id]);

  // Captains and staff check in while the room is open, so their light doesn't depend on Realtime.
  // Everyone else signed in re-checks who they are now and then.
  const signedIn = !!viewer.user_id;
  const leadsOrStaff = signedIn && (viewer.is_staff || !!viewer.my_team_id);
  const running = !!liveId && status !== 'complete';
  useEffect(() => {
    if (!presence || !running || !signedIn) return;
    if (leadsOrStaff) loadMe(true);
    const t = setInterval(() => { loadMe(leadsOrStaff); }, leadsOrStaff ? CHECK_IN_MS : ME_REFRESH_MS);
    return () => clearInterval(t);
  }, [presence, running, signedIn, leadsOrStaff, loadMe]);

  // 1s clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + (offsetRef.current || 0);
  const clock = secondsLeft(core?.draft || null, serverNow);

  // Poke the server when the clock expires (once per turn). Every open room sees zero at the same
  // moment, so each waits a random beat first and stays quiet if the pick has landed by then.
  useEffect(() => {
    const d = core?.draft;
    if (!d || d.status !== 'live' || d.pick_seconds == null || clock == null || clock > 0) return;
    const turn = `${d.id}:${d.current_pick}:${d.turn_started_at}`;
    if (lastTicked.current === turn) return;
    lastTicked.current = turn;
    const poke = (attempt: number) => setTimeout(async () => {
      const cur = coreRef.current?.draft;
      if (!cur || cur.status !== 'live' || `${cur.id}:${cur.current_pick}:${cur.turn_started_at}` !== turn) return;
      try {
        const res = await fetch('/api/ctfdl/draft/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id: d.id }) });
        const json = await res.json().catch(() => null);
        if (json?.state) { applyState(json.state); return; }
        // This tab's clock ran a touch ahead of the server's: ask again when the server says it is due.
        if (json && json.acted === false && typeof json.seconds_left === 'number' && json.seconds_left > 0 && attempt < 2) {
          setTimeout(() => poke(attempt + 1), json.seconds_left * 1000);
          return;
        }
      } catch { /* polling will catch up */ }
      pollState();
    }, 100 + Math.random() * 1200);
    poke(0);
  }, [core, clock, applyState, pollState]);

  const bundle = useMemo<DraftBundle | null>(() => {
    if (!board) return null;
    const draft = core ? core.draft : board.draft;
    const picks = core ? core.picks : board.picks;
    const out: DraftBundle = { ...board, draft, picks, players: applyPicks(board.players, picks), viewer: me?.viewer || ANON };
    if (me?.my_queue) out.my_queue = me.my_queue;
    return out;
  }, [board, core, me]);

  // Who's in the room: captain / staff check-ins, plus Realtime presence, plus this tab's own viewer.
  const present = useMemo<DraftPresence[]>(() => {
    const byUser = new Map<string, DraftPresence>();
    const anonTabs = new Set<string>();
    const add = (p: DraftPresence, key?: string) => {
      if (!p.user_id) { if (key) anonTabs.add(key); return; }
      const cur = byUser.get(p.user_id);
      byUser.set(p.user_id, cur
        ? { user_id: p.user_id, alias: cur.alias || p.alias, is_staff: cur.is_staff || p.is_staff, team_id: cur.team_id || p.team_id }
        : { user_id: p.user_id, alias: p.alias, is_staff: p.is_staff, team_id: p.team_id });
    };
    if (presence && viewer.user_id) add({ user_id: viewer.user_id, alias: viewer.alias, is_staff: viewer.is_staff, team_id: viewer.my_team_id });
    (here || []).forEach((p) => add(p));
    room.forEach((p) => add(p, p.key));
    return [...byUser.values(), ...[...anonTabs].map(() => ({ user_id: null, alias: null, is_staff: false, team_id: null }))];
  }, [presence, here, room, viewer.user_id, viewer.alias, viewer.is_staff, viewer.my_team_id]);
  const viewers = present.length;

  return { bundle, loading, error, refetch, applyBundle, clock, serverNow, viewers, present, authHeaders };
}
