import { supabaseAdmin } from '@/lib/match-setup-server';
import { messageUsers, squadLeaderIds, staffUserIds } from '@/lib/site-messages';
import { announceMatchTime, SITE_URL } from '@/lib/notices-server';
import { easternDay, EASTERN_TZ } from '@/lib/eastern';

/**
 * Captains agree a league match's kick-off time on the site (create-match-time-proposals.sql).
 *
 * The league sets the DAY of each fixture; the two squads' leads (captain or co-captain) pick
 * what time that day to play. One side proposes, the other accepts or declines. A proposal
 * from the other side while one is open counts as a counter: the open one is declined. On
 * acceptance the fixture's time is set (and a "Time TBD" fixture becomes timed), the referees'
 * channel hears about it as when staff set a time, and both squads' leads get a site message.
 * Staff may act for either side and can always set or move the time directly.
 *
 * Nothing changes once the match is within ARENA_LEAD_MS of its kick-off (the zone is opening
 * the arena), or after it is played or cancelled.
 */

const ARENA_LEAD_MS = 30 * 60_000;

export interface TimeProposal {
  id: string;
  squad_id: string;
  squad_name: string;
  squad_tag: string | null;
  proposed_by: string;
  proposed_by_alias: string;
  proposed_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  note: string | null;
  decided_by_alias: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface TimeState {
  installed: boolean;
  match: {
    id: string;
    scheduled_at: string;
    time_tbd: boolean;
    status: string;
    /** The league day, "2026-10-14" in Eastern time: the date proposals must fall on. */
    day: string;
    day_label: string;
    squads: { id: string; name: string; tag: string | null }[];
    /** Proposals are closed: played, cancelled, or the arena is already opening. */
    closed: string | null;
  };
  pending: TimeProposal | null;
  history: TimeProposal[];
  me: {
    staff: boolean;
    /** The squad in this match the viewer leads, if any. */
    squad_id: string | null;
    can_propose: boolean;
    can_decide: boolean;
    can_withdraw: boolean;
  };
}

type Viewer = { id: string | null; alias: string; staff: boolean };
type SquadLite = { id: string; name: string; tag: string | null; captain_id: string | null };

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: EASTERN_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(', ', ' ') + ' ET';
const dayLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
};
const label = (s: SquadLite) => `${s.tag ? `[${s.tag}] ` : ''}${s.name}`;

class TimeError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const isTimeError = (e: unknown): e is TimeError => e instanceof TimeError;

async function loadFixture(matchId: string) {
  const { data: m, error } = await supabaseAdmin.from('matches').select('id, title, scheduled_at, time_tbd, status, league_slug, season_number, squad_a_id, squad_b_id').eq('id', matchId).maybeSingle();
  if (error) throw new TimeError(error.message, 500);
  if (!m) throw new TimeError('Match not found', 404);
  if (!(m as any).league_slug || !(m as any).squad_a_id || !(m as any).squad_b_id) throw new TimeError('Only league matches with both squads set agree a time this way');
  const { data: squads } = await supabaseAdmin.from('squads').select('id, name, tag, captain_id').in('id', [(m as any).squad_a_id, (m as any).squad_b_id]);
  const list = ((squads || []) as SquadLite[]);
  const a = list.find((s) => s.id === (m as any).squad_a_id), b = list.find((s) => s.id === (m as any).squad_b_id);
  if (!a || !b) throw new TimeError('Squads not found', 404);
  return { m: m as any, a, b };
}

/** Which of these squads the user leads (captain or co-captain). */
async function ledBy(userId: string | null, squads: SquadLite[]): Promise<string | null> {
  if (!userId) return null;
  const own = squads.find((s) => s.captain_id === userId);
  if (own) return own.id;
  const { data } = await supabaseAdmin.from('squad_members').select('squad_id, role').in('squad_id', squads.map((s) => s.id)).eq('player_id', userId).eq('status', 'active').in('role', ['captain', 'co_captain']).limit(1);
  return (data as any[])?.[0]?.squad_id || null;
}

function closedReason(m: any): string | null {
  if (m.status !== 'scheduled') return m.status === 'completed' ? 'The match has been played.' : `The match is ${m.status}.`;
  if (m.time_tbd !== true) {
    const kickoff = new Date(m.scheduled_at).getTime();
    if (kickoff <= Date.now()) return 'The scheduled time has passed.';
    if (kickoff - Date.now() <= ARENA_LEAD_MS) return 'The arena is already being set up for the current time.';
  }
  return null;
}

async function loadProposals(matchId: string): Promise<{ installed: boolean; rows: TimeProposal[] }> {
  const { data, error } = await supabaseAdmin.from('match_time_proposals').select('id, squad_id, proposed_by, proposed_at, status, note, decided_by, decided_at, created_at').eq('match_id', matchId).order('created_at', { ascending: false }).limit(20);
  if (error) {
    if (/match_time_proposals/.test(error.message)) return { installed: false, rows: [] };
    throw new TimeError(error.message, 500);
  }
  const rows = (data || []) as any[];
  const ids = [...new Set(rows.flatMap((r) => [r.proposed_by, r.decided_by]).filter(Boolean))] as string[];
  const [{ data: profiles }, { data: squads }] = await Promise.all([
    ids.length ? supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    rows.length ? supabaseAdmin.from('squads').select('id, name, tag').in('id', [...new Set(rows.map((r) => r.squad_id))]) : Promise.resolve({ data: [] as any[] }),
  ]);
  const alias = new Map(((profiles || []) as any[]).map((p) => [p.id, p.in_game_alias || 'Unknown']));
  const squad = new Map(((squads || []) as any[]).map((s) => [s.id, s]));
  return {
    installed: true,
    rows: rows.map((r) => ({
      id: r.id, squad_id: r.squad_id, squad_name: squad.get(r.squad_id)?.name || '?', squad_tag: squad.get(r.squad_id)?.tag || null,
      proposed_by: r.proposed_by, proposed_by_alias: alias.get(r.proposed_by) || 'Unknown', proposed_at: r.proposed_at, status: r.status, note: r.note || null,
      decided_by_alias: r.decided_by ? alias.get(r.decided_by) || 'Unknown' : null, decided_at: r.decided_at || null, created_at: r.created_at,
    })),
  };
}

export async function loadTimeState(matchId: string, viewer: Viewer): Promise<TimeState> {
  const { m, a, b } = await loadFixture(matchId);
  const [{ installed, rows }, mine] = await Promise.all([loadProposals(matchId), ledBy(viewer.id, [a, b])]);
  const pending = rows.find((r) => r.status === 'pending') || null;
  const closed = closedReason(m);
  const day = easternDay(m.scheduled_at);
  const acts = !closed && installed && (viewer.staff || !!mine);
  return {
    installed,
    match: { id: m.id, scheduled_at: m.scheduled_at, time_tbd: m.time_tbd === true, status: m.status, day, day_label: dayLabel(day), squads: [a, b].map((s) => ({ id: s.id, name: s.name, tag: s.tag })), closed },
    pending,
    history: rows.filter((r) => r.status !== 'pending'),
    me: {
      staff: viewer.staff,
      squad_id: mine,
      can_propose: acts,
      can_decide: acts && !!pending && (viewer.staff || pending.squad_id !== mine),
      can_withdraw: acts && !!pending && (viewer.staff || pending.squad_id === mine),
    },
  };
}

/** Site messages to the leads of these squads and to staff, minus the person acting. */
async function tell(squadIds: string[], exceptUserId: string | null, subject: string, content: string) {
  const [leads, staff] = await Promise.all([squadLeaderIds(squadIds), staffUserIds()]);
  await messageUsers([...leads, ...staff].filter((id) => id !== exceptUserId), subject, content);
}

export async function proposeTime(matchId: string, viewer: Viewer, atIso: string, note: string | null, forSquadId?: string | null): Promise<TimeState> {
  if (!viewer.id) throw new TimeError('Sign in first', 401);
  const { m, a, b } = await loadFixture(matchId);
  const closed = closedReason(m);
  if (closed) throw new TimeError(`Time proposals are closed. ${closed}`, 409);

  let mine = await ledBy(viewer.id, [a, b]);
  if (!mine && viewer.staff) {
    if (forSquadId !== a.id && forSquadId !== b.id) throw new TimeError('Pick which squad you are proposing for', 400);
    mine = forSquadId;
  }
  if (!mine) throw new TimeError('Only the captains and co-captains of these squads can propose a time', 403);
  const my = mine === a.id ? a : b, other = mine === a.id ? b : a;

  const at = new Date(atIso);
  if (Number.isNaN(at.getTime())) throw new TimeError('Invalid time');
  const day = easternDay(m.scheduled_at);
  if (easternDay(at) !== day) throw new TimeError(`The league set this match for ${dayLabel(day)} (Eastern time). Captains pick the time that day; staff can move the day.`);
  if (at.getTime() <= Date.now() + ARENA_LEAD_MS) throw new TimeError('Pick a time at least 30 minutes from now');
  if (m.time_tbd !== true && at.getTime() === new Date(m.scheduled_at).getTime()) throw new TimeError('That is already the match time');

  const { rows, installed } = await loadProposals(matchId);
  if (!installed) throw new TimeError('Run create-match-time-proposals.sql in Supabase first', 503);
  const open = rows.find((r) => r.status === 'pending');
  let countered: TimeProposal | null = null;
  if (open) {
    // Mine again: replaced. Theirs: this is a counter-offer, which turns theirs down.
    const status = open.squad_id === mine ? 'withdrawn' : 'declined';
    const { error } = await supabaseAdmin.from('match_time_proposals').update({ status, decided_by: viewer.id, decided_at: new Date().toISOString(), note: open.squad_id === mine ? open.note : `Countered with ${fmtEt(at.toISOString())}` }).eq('id', open.id).eq('status', 'pending');
    if (error) throw new TimeError(error.message, 500);
    if (open.squad_id !== mine) countered = open;
  }
  const { error } = await supabaseAdmin.from('match_time_proposals').insert({ match_id: matchId, squad_id: mine, proposed_by: viewer.id, proposed_at: at.toISOString(), note: note || null });
  if (error) throw new TimeError(error.message, 500);

  const url = `${SITE_URL}/matches/${matchId}`;
  const when = fmtEt(at.toISOString());
  await tell([other.id], viewer.id,
    `Match time proposed: ${label(my)} vs ${label(other)}`,
    `${viewer.alias} (${label(my)}) proposes ${when} for ${label(my)} vs ${label(other)}${countered ? `, instead of the ${fmtEt(countered.proposed_at)} ${label(other)} proposed` : ''}.${note ? `\n\n"${note}"` : ''}\n\nAccept or decline it on the match page: ${url}`);
  return loadTimeState(matchId, viewer);
}

export async function decideTime(matchId: string, viewer: Viewer, action: 'accept' | 'decline' | 'withdraw', note: string | null): Promise<TimeState> {
  if (!viewer.id) throw new TimeError('Sign in first', 401);
  const { m, a, b } = await loadFixture(matchId);
  const { rows } = await loadProposals(matchId);
  const open = rows.find((r) => r.status === 'pending');
  if (!open) throw new TimeError('There is no open proposal', 409);
  const mine = await ledBy(viewer.id, [a, b]);
  const proposer = open.squad_id === a.id ? a : b, other = open.squad_id === a.id ? b : a;

  if (action === 'withdraw') {
    if (!viewer.staff && mine !== open.squad_id) throw new TimeError('Only the squad that proposed it (or staff) can withdraw it', 403);
    const { error } = await supabaseAdmin.from('match_time_proposals').update({ status: 'withdrawn', decided_by: viewer.id, decided_at: new Date().toISOString() }).eq('id', open.id).eq('status', 'pending');
    if (error) throw new TimeError(error.message, 500);
    await tell([other.id], viewer.id, `Match time proposal withdrawn: ${label(proposer)} vs ${label(other)}`, `${viewer.alias} withdrew the ${fmtEt(open.proposed_at)} proposal for ${label(proposer)} vs ${label(other)}.\n\n${SITE_URL}/matches/${matchId}`);
    return loadTimeState(matchId, viewer);
  }

  if (!viewer.staff && mine !== other.id) throw new TimeError(`Only ${label(other)}'s captain or co-captains (or staff) can ${action} this`, 403);
  const closed = closedReason(m);
  if (action === 'accept' && closed) throw new TimeError(`Time proposals are closed. ${closed}`, 409);

  const { error } = await supabaseAdmin.from('match_time_proposals').update({ status: action === 'accept' ? 'accepted' : 'declined', decided_by: viewer.id, decided_at: new Date().toISOString(), note: action === 'decline' && note ? note : open.note }).eq('id', open.id).eq('status', 'pending');
  if (error) throw new TimeError(error.message, 500);

  const url = `${SITE_URL}/matches/${matchId}`;
  if (action === 'decline') {
    await tell([proposer.id], viewer.id, `Match time declined: ${label(proposer)} vs ${label(other)}`, `${viewer.alias} (${label(other)}) declined the ${fmtEt(open.proposed_at)} proposal for ${label(proposer)} vs ${label(other)}.${note ? `\n\n"${note}"` : ''}\n\nPropose another time on the match page: ${url}`);
    return loadTimeState(matchId, viewer);
  }

  const wasTbd = m.time_tbd === true;
  const { error: setErr } = await supabaseAdmin.from('matches').update({ scheduled_at: open.proposed_at, time_tbd: false }).eq('id', matchId);
  if (setErr) throw new TimeError(setErr.message, 500);
  await announceMatchTime(matchId, !wasTbd); // the referees' channel, as when staff set a time
  await tell([a.id, b.id], viewer.id, `Match time set: ${label(a)} vs ${label(b)}`, `${viewer.alias} (${label(other)}) accepted ${fmtEt(open.proposed_at)} for ${label(proposer)} vs ${label(other)}. The match page and schedule now show it.\n\n${url}`);
  return loadTimeState(matchId, viewer);
}
