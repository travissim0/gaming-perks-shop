import { supabaseAdmin, isTimeTbd } from '@/lib/match-setup-server';
export { kickoffOf } from '@/lib/match-setup-server';
import { messageUsers, staffUserIds } from '@/lib/site-messages';
import { easternDay } from '@/lib/eastern';
import { getSetting } from '@/lib/site-settings';

/**
 * Late starts (add-match-late-start.sql): a league match waits for the earlier match of either
 * of its squads to finish, instead of kicking off on top of it.
 *
 * Two matches on one night can overlap: on 2026-10-14 the 7:30 FS Green ran 28 minutes and the
 * 8:00 FS Red's timer ran out while it was still going. The schedule is never rewritten for
 * that. Instead:
 *
 *   - From LOOKAHEAD before its scheduled time, a match whose squad (or person) has an earlier
 *     match still running (or due and not yet over) is HELD: the queue carries a `hold` flag and
 *     the zone keeps its own arena timer from running out. The kick-off time in the queue never
 *     moves (moving it is what dropped every client on 2026-10-18).
 *   - When the earlier match's result lands (or it is cancelled), the hold lifts: `effective_at`
 *     becomes now + SETUP, a real 10-minute countdown for everyone to move over, set sides and
 *     lineups, and the ref to open the match chat.
 *   - Staff or the match's referee can lift it by hand (Start now), and a hold lifts on its own
 *     CEILING after the scheduled time, with a note to staff, so a match whose earlier game never
 *     reported in can't wait forever.
 *
 * `scheduled_at` stays what was agreed; `effective_at` is what the automation runs to. Sides are
 * still released 5 minutes before the SCHEDULED time (a hold begins after that), so placement is
 * unchanged; lineups lock at the effective kick-off.
 */

export const LATE_SETUP_MS = 10 * 60_000;
export const LATE_CEILING_MS = 90 * 60_000;
export const LATE_LOOKAHEAD_MS = 3 * 60_000;
/** An earlier match of the same squad counts only if it was due within this long before. */
const SAME_NIGHT_MS = 6 * 3_600_000;

export const LATE_COLS = ['effective_at', 'late_waiting_on', 'late_since', 'late_released_at', 'late_released_by'];

export interface LateState {
  /** Still waiting on this match, and why ("a squad in both" or who is needed in both). */
  waiting_on: { id: string; title: string; because: string | null } | null;
  since: string | null;
  released_at: string | null;
  /** 'result' (the earlier match finished), 'ceiling' (waited the maximum), or the alias who pressed Start now. */
  released_by: string | null;
  setup_min: number;
  /** Minutes the kick-off moved by, once released. */
  moved_min: number | null;
}

const lateInstalled = (m: any) => m && 'effective_at' in m;

/** Public shape of a match's late-start state, or null when it never started late. */
export async function lateStateOf(m: any): Promise<LateState | null> {
  if (!lateInstalled(m) || (!m.late_since && !m.effective_at)) return null;
  let waiting: { id: string; title: string; because: string | null } | null = null;
  if (m.late_waiting_on) {
    const { data } = await supabaseAdmin.from('matches').select('id, title, squad_a_id, squad_b_id').eq('id', m.late_waiting_on).maybeSingle();
    waiting = data ? { id: (data as any).id, title: (data as any).title, because: await overlapReason(data, m) } : { id: m.late_waiting_on, title: 'an earlier match', because: null };
  }
  const moved = m.late_released_at && m.effective_at ? Math.round((new Date(m.effective_at).getTime() - new Date(m.scheduled_at).getTime()) / 60_000) : null;
  return { waiting_on: waiting, since: m.late_since || null, released_at: m.late_released_at || null, released_by: m.late_released_by || null, setup_min: LATE_SETUP_MS / 60_000, moved_min: moved };
}

/**
 * The earlier match of either squad that this one must wait for: due within SAME_NIGHT before
 * it, still scheduled (and past its own kick-off) or in progress. Null when nothing blocks.
 */
/** Everyone a match needs: its two rosters and its crew (referees, commentators, recorders). */
async function peopleOf(m: any): Promise<{ roster: Map<string, string>; crew: Map<string, string> }> {
  const squads = [m.squad_a_id, m.squad_b_id].filter(Boolean);
  const [{ data: members }, { data: crew }] = await Promise.all([
    squads.length ? supabaseAdmin.from('squad_members').select('player_id').in('squad_id', squads).eq('status', 'active') : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('match_participants').select('player_id, role').eq('match_id', m.id),
  ]);
  const rosterIds = ((members || []) as any[]).map((r) => r.player_id).filter(Boolean) as string[];
  const crewIds = ((crew || []) as any[]).filter((r) => r.player_id && r.role !== 'player').map((r) => r.player_id) as string[];
  const ids = [...new Set([...rosterIds, ...crewIds])];
  const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', ids) : { data: [] as any[] };
  const alias = new Map(((profiles || []) as any[]).map((p) => [p.id, p.in_game_alias || 'someone']));
  const roster = new Map<string, string>(rosterIds.map((id) => [id, alias.get(id) || 'a player']));
  const crewMap = new Map<string, string>(crewIds.map((id) => [id, alias.get(id) || 'a crew member']));
  return { roster, crew: crewMap };
}

/**
 * Why the earlier match `a` holds `b`: the squads overlap, or a person in `a` (on a roster or on
 * crew) is needed in `b` (on a roster or on crew). A squad wants its whole roster, and a match
 * wants its referee, so a referee stuck in the earlier match holds the next match they play in,
 * and a player stuck in it holds the next match they referee (John, 2026-10-18). Null = no overlap.
 */
export async function overlapReason(a: any, b: any): Promise<string | null> {
  const squadsA = new Set([a.squad_a_id, a.squad_b_id].filter(Boolean));
  if ([b.squad_a_id, b.squad_b_id].some((s) => s && squadsA.has(s))) return 'a squad in both';
  const [pa, pb] = await Promise.all([peopleOf(a), peopleOf(b)]);
  const names: string[] = [];
  for (const [id, alias] of pa.crew) if (pb.roster.has(id) || pb.crew.has(id)) names.push(`${alias} (${pb.crew.has(id) ? 'on crew' : 'playing'} here, on crew there)`);
  for (const [id, alias] of pa.roster) if (pb.crew.has(id) && !pa.crew.has(id)) names.push(`${alias} (on crew here, playing there)`);
  return names.length ? names.join(', ') : null;
}

async function blockerFor(m: any, now: number): Promise<{ id: string; title: string; because: string } | null> {
  if (!m.squad_a_id || !m.squad_b_id) return null;
  const sched = new Date(m.scheduled_at).getTime();
  // Every earlier league match of the night still running or due: the overlap test decides.
  const { data } = await supabaseAdmin
    .from('matches')
    .select('id, title, status, scheduled_at, time_tbd, fs_status, stage, squad_a_id, squad_b_id')
    .neq('id', m.id)
    .in('status', ['scheduled', 'in_progress'])
    .not('league_slug', 'is', null)
    .gte('scheduled_at', new Date(sched - SAME_NIGHT_MS).toISOString())
    .lt('scheduled_at', m.scheduled_at)
    .order('scheduled_at', { ascending: true });
  for (const r of (data || []) as any[]) {
    if (r.time_tbd === true) continue;
    if (r.stage === 'fs' && r.fs_status && r.fs_status !== 'accepted') continue;
    const running = r.status === 'in_progress' || new Date(r.scheduled_at).getTime() <= now; // due but not reported over
    if (!running) continue;
    const because = await overlapReason(r, m);
    if (because) return { id: r.id, title: r.title, because };
  }
  return null;
}

/**
 * Work out and persist the match's late-start state for this moment. Called wherever the match
 * is loaded for the zone or the setup panel, so every poll re-evaluates it. Returns the match
 * row with the late columns as they now stand.
 */
/**
 * Off by default since 2026-10-18 (see the incident note above): staff turn it on in CTF
 * management → Season → Late starts, after the zone handles the queue's hold flag and a throwaway
 * match has been run through it. The setting is read once a minute, so a flip takes up to that
 * long to reach every poll.
 */
/** site_settings LATE_STARTS = 'on' (CTF management → Season → Late starts). Anything else, or unset, is off. */
export async function lateStartsEnabled(): Promise<boolean> {
  return (await getSetting('LATE_STARTS')).trim().toLowerCase() === 'on';
}

export async function applyLateStart(m: any): Promise<any> {
  if (!(await lateStartsEnabled())) return m;
  if (!lateInstalled(m) || !m?.id) return m; // before add-match-late-start.sql
  if (m.status !== 'scheduled' || isTimeTbd(m) || m.manual_zone === true || !m.league_slug) return m;
  if (m.late_released_at) return m; // the hold is over; effective_at is final
  const now = Date.now();
  const sched = new Date(m.scheduled_at).getTime();
  if (now < sched - LATE_LOOKAHEAD_MS) return m;

  const blocker = await blockerFor(m, now);
  const write = async (patch: Record<string, any>) => {
    const { error } = await supabaseAdmin.from('matches').update(patch).eq('id', m.id);
    if (error) { console.error('late start write failed', error.message); return m; }
    return { ...m, ...patch };
  };

  if (blocker) {
    if (now - sched >= LATE_CEILING_MS) {
      const out = await write({ effective_at: new Date(now + LATE_SETUP_MS).toISOString(), late_waiting_on: null, late_since: m.late_since || new Date(now).toISOString(), late_released_at: new Date(now).toISOString(), late_released_by: 'ceiling' });
      await tellStaff(m, `Late start released after ${LATE_CEILING_MS / 60_000} min: ${m.title}`,
        `${m.title} waited ${LATE_CEILING_MS / 60_000} minutes on ${blocker.title}, which never reported a result, so the site released it: it starts in ${LATE_SETUP_MS / 60_000} minutes. If the earlier match is really still going, a referee can hold things in the arena by hand.`);
      return out;
    }
    // Held: record what it is waiting on, once. The kick-off is NOT moved: the queue carries a
    // `hold` flag and the zone keeps its own timer from running out. (The first version moved the
    // time about once a minute; the zone re-sent a reminder on every move and the oversized text
    // dropped every client, 2026-10-18.)
    if (m.late_waiting_on !== blocker.id) {
      return write({ late_waiting_on: blocker.id, late_since: m.late_since || new Date(now).toISOString() });
    }
    return m;
  }

  if (m.late_waiting_on) {
    // The earlier match is over: a real countdown from here.
    return write({ effective_at: new Date(now + LATE_SETUP_MS).toISOString(), late_waiting_on: null, late_released_at: new Date(now).toISOString(), late_released_by: 'result' });
  }
  return m;
}

/** Start now: staff or the referee lift the hold by hand. The 10-minute setup window still runs. */
export async function releaseLateStart(m: any, byAlias: string): Promise<{ ok: true; effective_at: string } | { ok: false; error: string }> {
  if (!lateInstalled(m)) return { ok: false, error: 'Run add-match-late-start.sql in Supabase first' };
  if (!m.late_waiting_on) return { ok: false, error: 'This match is not being held' };
  const now = Date.now();
  const effective = new Date(now + LATE_SETUP_MS).toISOString();
  const { error } = await supabaseAdmin.from('matches').update({ effective_at: effective, late_waiting_on: null, late_released_at: new Date(now).toISOString(), late_released_by: byAlias || 'staff' }).eq('id', m.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, effective_at: effective };
}

async function tellStaff(m: any, subject: string, content: string) {
  try {
    await messageUsers(await staffUserIds(), subject, `${content}\n\nhttps://www.freeinf.org/matches/${m.id}`);
  } catch (e) {
    console.error('late start staff message failed', e);
  }
}

/**
 * Other league matches of these squads near a proposed kick-off, for the spacing check when a
 * time is set: anything under 30 minutes apart is refused, under 45 warned about. A match and
 * its setup take more than 30 minutes, as Oct 14 showed.
 */
export const SPACING_REFUSE_MIN = 30;
export const SPACING_WARN_MIN = 45;
export async function spacingConflicts(squadIds: string[], atIso: string, excludeId: string | null): Promise<{ id: string; title: string; scheduled_at: string; minutes: number }[]> {
  const ids = squadIds.filter(Boolean);
  if (ids.length === 0) return [];
  const at = new Date(atIso).getTime();
  if (!Number.isFinite(at)) return [];
  let q = supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, time_tbd, fs_status, stage, status')
    .in('status', ['scheduled', 'in_progress'])
    .not('league_slug', 'is', null)
    .or(`squad_a_id.in.(${ids.join(',')}),squad_b_id.in.(${ids.join(',')})`)
    .gte('scheduled_at', new Date(at - SPACING_WARN_MIN * 60_000).toISOString())
    .lte('scheduled_at', new Date(at + SPACING_WARN_MIN * 60_000).toISOString());
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q;
  return ((data || []) as any[])
    .filter((r) => r.time_tbd !== true && !(r.stage === 'fs' && r.fs_status && r.fs_status !== 'accepted'))
    .map((r) => ({ id: r.id, title: r.title, scheduled_at: r.scheduled_at, minutes: Math.round(Math.abs(new Date(r.scheduled_at).getTime() - at) / 60_000) }))
    .sort((x, y) => x.minutes - y.minutes);
}

/** "8:00 PM ET" for a spacing message. */
export const etClock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET';

/** The nth meeting of the same two squads on one league day (1 = first), for the arena name. */
export async function meetingNumber(m: any): Promise<number> {
  if (!m?.squad_a_id || !m?.squad_b_id || !m?.scheduled_at) return 1;
  const day = easternDay(m.scheduled_at);
  const { data } = await supabaseAdmin
    .from('matches')
    .select('id, scheduled_at, status, fs_status, stage, time_tbd')
    .neq('id', m.id)
    .in('status', ['scheduled', 'in_progress', 'completed'])
    .or(`and(squad_a_id.eq.${m.squad_a_id},squad_b_id.eq.${m.squad_b_id}),and(squad_a_id.eq.${m.squad_b_id},squad_b_id.eq.${m.squad_a_id})`)
    .gte('scheduled_at', new Date(new Date(m.scheduled_at).getTime() - 24 * 3_600_000).toISOString())
    .lt('scheduled_at', m.scheduled_at);
  const earlier = ((data || []) as any[]).filter((r) => r.time_tbd !== true && !(r.stage === 'fs' && r.fs_status && r.fs_status !== 'accepted') && easternDay(r.scheduled_at) === day);
  return 1 + earlier.length;
}
