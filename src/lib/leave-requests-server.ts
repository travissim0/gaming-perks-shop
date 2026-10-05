/**
 * Squad leave requests — server-side helpers (service role). Import only from API routes.
 *
 * In a draft league (CTFDL) the roster is set by the draft, so a player asks to leave instead of
 * leaving. League staff are told, and approve or deny it with a reason. See
 * create-squad-leave-requests.sql.
 */
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { SYSTEM_USER_ID } from '@/lib/constants';
import { SITE_URL, queueNotice } from '@/lib/notices-server';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const REVIEW_URL = `${SITE_URL}/admin/ctf-management?tab=squads`;

/**
 * Leave requests stay on the site for now (John, 2026-10-05): staff and players get site messages
 * only. Set to true to also post new requests in the Discord staff channel and DM the player the
 * outcome; the bot already knows both notice kinds (leave_request, leave_decided).
 */
const FORWARD_TO_DISCORD = false;

export interface LeaveRequest {
  id: string;
  squad_id: string | null;
  squad_name: string | null;
  squad_tag: string | null;
  player_id: string;
  player_alias: string | null;
  league_slug: string | null;
  season_number: number | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  created_at: string;
  decided_by: string | null;
  decided_by_alias: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface Caller { id: string; alias: string; staff: boolean }

export async function callerFrom(request: NextRequest): Promise<Caller | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('in_game_alias, is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return { id: user.id, alias: (p as any)?.in_game_alias || 'Unknown', staff: !!p && ((p as any).is_admin === true || (p as any).ctf_role === 'ctf_admin') };
}

/** The table arrives with create-squad-leave-requests.sql. Until then leaving works as it always did. */
export const tableMissing = (error: { message?: string; code?: string } | null | undefined) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || ''));

export async function requestsInstalled(): Promise<boolean> {
  const { error } = await supabaseAdmin.from('squad_leave_requests').select('id', { head: true, count: 'exact' }).limit(1);
  return !tableMissing(error);
}

export interface SquadLeague { id: string; name: string; tag: string | null; captain_id: string | null; league_slug: string | null; league_name: string | null; draft: boolean }

/** The squad and whether its league sets rosters by draft (anything but a plain squad league). */
export async function squadLeague(squadId: string): Promise<SquadLeague | null> {
  const { data: sq } = await supabaseAdmin.from('squads').select('id, name, tag, captain_id, league_slug').eq('id', squadId).maybeSingle();
  if (!sq) return null;
  const s = sq as any;
  let league: { name: string; format: string | null } | null = null;
  if (s.league_slug) {
    const { data } = await supabaseAdmin.from('leagues').select('name, format').eq('slug', s.league_slug).maybeSingle();
    league = (data as any) || null;
  }
  return { id: s.id, name: s.name, tag: s.tag ?? null, captain_id: s.captain_id ?? null, league_slug: s.league_slug ?? null, league_name: league?.name ?? null, draft: !!league?.format && league.format !== 'squad' };
}

/** A draft-league squad, with the request table in place: leaving goes through a request. */
export async function leaveNeedsRequest(squadId: string): Promise<boolean> {
  const sq = await squadLeague(squadId);
  return !!sq?.draft && (await requestsInstalled());
}

async function latestSeasonNumber(leagueSlug: string | null): Promise<number | null> {
  if (!leagueSlug) return null;
  const { data: lg } = await supabaseAdmin.from('leagues').select('id').eq('slug', leagueSlug).maybeSingle();
  if (!lg) return null;
  const { data } = await supabaseAdmin.from('league_seasons').select('season_number').eq('league_id', (lg as any).id).order('season_number', { ascending: false }).limit(1).maybeSingle();
  return (data as any)?.season_number ?? null;
}

const squadLabel = (r: Pick<LeaveRequest, 'squad_name' | 'squad_tag'>) => `${r.squad_tag ? `[${r.squad_tag}] ` : ''}${r.squad_name || 'their squad'}`;

/** Create the request and tell every league staff member (site message) plus the Discord staff channel. */
export async function createLeaveRequest(caller: Caller, sq: SquadLeague, reason: string): Promise<{ request?: LeaveRequest; error?: string; status?: number }> {
  const { data: member } = await supabaseAdmin.from('squad_members').select('id, role').eq('squad_id', sq.id).eq('player_id', caller.id).eq('status', 'active').maybeSingle();
  if (!member) return { error: 'You are not on this squad', status: 404 };
  if ((member as any).role === 'captain' || sq.captain_id === caller.id) return { error: 'You are the captain. Hand the captaincy to someone else first, or ask league staff.', status: 409 };

  const { data: open } = await supabaseAdmin.from('squad_leave_requests').select('id').eq('squad_id', sq.id).eq('player_id', caller.id).eq('status', 'pending').maybeSingle();
  if (open) return { error: 'You already have a request waiting for league staff', status: 409 };

  const { data, error } = await supabaseAdmin
    .from('squad_leave_requests')
    .insert({
      squad_id: sq.id,
      squad_name: sq.name,
      squad_tag: sq.tag,
      player_id: caller.id,
      player_alias: caller.alias,
      league_slug: sq.league_slug,
      season_number: await latestSeasonNumber(sq.league_slug),
      reason: reason || null,
    })
    .select('*')
    .single();
  if (error) return { error: error.message, status: 500 };
  const request = data as LeaveRequest;

  const league = [sq.league_name, request.season_number ? `Season ${request.season_number}` : null].filter(Boolean).join(' ');
  const text = `${caller.alias} has asked to leave ${squadLabel(request)}${league ? ` (${league})` : ''}.\n\nReason: ${reason || 'none given'}\n\nThey stay on the roster until league staff approve or deny the request: ${REVIEW_URL}`;
  try {
    const { data: staff } = await supabaseAdmin.from('profiles').select('id').or('is_admin.eq.true,ctf_role.eq.ctf_admin');
    const rows = ((staff || []) as any[]).filter((p) => p.id !== SYSTEM_USER_ID).map((p) => ({ sender_id: SYSTEM_USER_ID, recipient_id: p.id, subject: `Leave request: ${caller.alias} · ${squadLabel(request)}`, content: text }));
    if (rows.length) await supabaseAdmin.from('private_messages').insert(rows);
  } catch (e) {
    console.error('leave request: staff messages failed', e);
  }
  if (FORWARD_TO_DISCORD) await queueNotice({
    channel: 'staff',
    kind: 'leave_request',
    payload: { target_id: caller.id, target_alias: caller.alias, squad: squadLabel(request), league, reason: reason || null, url: REVIEW_URL },
    text,
  });
  return { request };
}

/** Staff decision. Approving takes the player off the squad; either way the decision is recorded and the player is told. */
export async function decideLeaveRequest(caller: Caller, id: string, approve: boolean, note: string): Promise<{ request?: LeaveRequest; error?: string; status?: number }> {
  const { data: row } = await supabaseAdmin.from('squad_leave_requests').select('*').eq('id', id).maybeSingle();
  const req = row as LeaveRequest | null;
  if (!req) return { error: 'Request not found', status: 404 };
  if (req.status !== 'pending') return { error: `This request was already ${req.status}${req.decided_by_alias ? ` by ${req.decided_by_alias}` : ''}`, status: 409 };

  if (approve && req.squad_id) {
    const { data: member } = await supabaseAdmin.from('squad_members').select('id, role').eq('squad_id', req.squad_id).eq('player_id', req.player_id).maybeSingle();
    if ((member as any)?.role === 'captain') return { error: 'This player is now the squad captain. Change the captain first, then approve.', status: 409 };
    if (member) {
      const { error: delErr } = await supabaseAdmin.from('squad_members').delete().eq('id', (member as any).id);
      if (delErr) return { error: delErr.message, status: 500 };
    }
  }

  const { data: saved, error } = await supabaseAdmin
    .from('squad_leave_requests')
    .update({ status: approve ? 'approved' : 'denied', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: new Date().toISOString(), decision_note: note || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!saved) return { error: 'Someone else has just decided this request', status: 409 };
  const request = saved as LeaveRequest;

  const verdict = approve ? 'approved' : 'denied';
  const subject = `Your request to leave ${squadLabel(request)} was ${verdict}`;
  const text = `Your request to leave ${squadLabel(request)} was ${verdict} by ${caller.alias}.${note ? `\n\nReason: ${note}` : ''}${approve ? '\n\nYou are no longer on the roster.' : '\n\nYou are still on the roster.'}`;
  if (FORWARD_TO_DISCORD) {
    await queueNotice({
      user_id: request.player_id,
      kind: 'leave_decided',
      payload: { target_id: request.player_id, target_alias: request.player_alias, squad: squadLabel(request), approved: approve, by_alias: caller.alias, note: note || null, url: request.squad_id ? `${SITE_URL}/squads/${request.squad_id}` : SITE_URL },
      subject,
      text,
    });
  } else {
    const { error: pmErr } = await supabaseAdmin.from('private_messages').insert({ sender_id: SYSTEM_USER_ID, recipient_id: request.player_id, subject, content: text });
    if (pmErr) console.error('leave request: could not message the player', pmErr.message);
  }
  return { request };
}
