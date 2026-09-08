import { NextRequest, NextResponse } from 'next/server';
import {
  supabaseAdmin,
  userFromRequest,
  isStaff,
  resolveDraft,
  loadBundle,
  loadTeams,
  makePick,
  undoPick,
  postSystemMessage,
} from '@/lib/ctfdl-draft-server';
import { secondsLeft, teamOnClock } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ctfdl/draft?draft=<id>|season=<league_season_id>
 * Public board state. Send a Bearer token to get viewer info (staff flag,
 * your team, your private queue).
 */
export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  const draft = await resolveDraft(request.nextUrl.searchParams.get('draft'), request.nextUrl.searchParams.get('season'));
  const bundle = await loadBundle(draft, user?.id || null);
  return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/ctfdl/draft — staff actions.
 * { action: 'create', league_season_id, order_type?, roster_size?, pick_seconds?, auto_pick? }
 * { action: 'update', draft_id, order_type?, roster_size?, pick_seconds?, auto_pick? }
 * { action: 'set_teams', draft_id, squad_ids: [] }        (in pick order; setup only)
 * { action: 'set_rankings', draft_id, player_ids: [] }    (staff ranking, any time)
 * { action: 'start' | 'pause' | 'resume' | 'undo' | 'skip' | 'end' | 'reset' | 'delete', draft_id }
 *   reset  = pull back every pick (and the memberships it created), back to setup
 *   delete = only while in setup (reset first if it has run)
 */
export async function POST(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isStaff(user.id))) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  try {
    if (body.action === 'create') {
      if (!body.league_season_id) return NextResponse.json({ error: 'league_season_id required' }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from('ctfdl_drafts')
        .insert({
          league_season_id: body.league_season_id,
          order_type: body.order_type === 'straight' ? 'straight' : 'snake',
          roster_size: clampInt(body.roster_size, 1, 30, 5),
          pick_seconds: body.pick_seconds == null || body.pick_seconds === '' ? null : clampInt(body.pick_seconds, 10, 3600, 90),
          auto_pick: body.auto_pick !== false,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draft: data });
    }

    const draftId: string | undefined = body.draft_id;
    if (!draftId) return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
    const draft = await resolveDraft(draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    switch (body.action) {
      case 'update': {
        if (draft.status === 'complete') return NextResponse.json({ error: 'Draft is complete' }, { status: 409 });
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (body.order_type) patch.order_type = body.order_type === 'straight' ? 'straight' : 'snake';
        if (body.roster_size != null) patch.roster_size = clampInt(body.roster_size, 1, 30, draft.roster_size);
        if ('pick_seconds' in body) patch.pick_seconds = body.pick_seconds == null || body.pick_seconds === '' ? null : clampInt(body.pick_seconds, 10, 3600, 90);
        if ('auto_pick' in body) patch.auto_pick = body.auto_pick !== false;
        // Changing the clock mid-draft restarts the current turn so nobody gets shorted.
        if (draft.status === 'live' && 'pick_seconds' in body) patch.turn_started_at = new Date().toISOString();
        const { error } = await supabaseAdmin.from('ctfdl_drafts').update(patch).eq('id', draftId);
        if (error) throw new Error(error.message);
        break;
      }
      case 'set_teams': {
        if (draft.status !== 'setup') return NextResponse.json({ error: 'Teams can only change before the draft starts' }, { status: 409 });
        const squadIds: string[] = Array.isArray(body.squad_ids) ? body.squad_ids.filter(Boolean) : [];
        if (new Set(squadIds).size !== squadIds.length) return NextResponse.json({ error: 'Duplicate squad' }, { status: 400 });
        const { error: delErr } = await supabaseAdmin.from('ctfdl_draft_teams').delete().eq('draft_id', draftId);
        if (delErr) throw new Error(delErr.message);
        if (squadIds.length > 0) {
          const { error } = await supabaseAdmin
            .from('ctfdl_draft_teams')
            .insert(squadIds.map((squad_id, i) => ({ draft_id: draftId, squad_id, pick_order: i + 1 })));
          if (error) throw new Error(error.message);
        }
        break;
      }
      case 'set_rankings': {
        const playerIds: string[] = Array.isArray(body.player_ids) ? body.player_ids.filter(Boolean) : [];
        const { error: delErr } = await supabaseAdmin.from('ctfdl_draft_rankings').delete().eq('draft_id', draftId);
        if (delErr) throw new Error(delErr.message);
        if (playerIds.length > 0) {
          const { error } = await supabaseAdmin
            .from('ctfdl_draft_rankings')
            .insert(playerIds.map((player_id, i) => ({ draft_id: draftId, player_id, rank: i + 1 })));
          if (error) throw new Error(error.message);
        }
        break;
      }
      case 'start': {
        if (draft.status !== 'setup' && draft.status !== 'paused') return NextResponse.json({ error: 'Draft already started' }, { status: 409 });
        const teams = await loadTeams(draftId);
        if (teams.length < 2) return NextResponse.json({ error: 'Add at least two teams first' }, { status: 409 });
        const { error } = await supabaseAdmin
          .from('ctfdl_drafts')
          .update({ status: 'live', started_at: draft.started_at || new Date().toISOString(), turn_started_at: new Date().toISOString(), paused_remaining: null, updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (error) throw new Error(error.message);
        const first = teamOnClock({ ...draft, status: 'live' }, teams);
        await postSystemMessage(draftId, `Draft started. ${first ? `${first.squad_name} is on the clock.` : ''}`);
        break;
      }
      case 'pause': {
        if (draft.status !== 'live') return NextResponse.json({ error: 'Draft is not live' }, { status: 409 });
        const remaining = secondsLeft(draft, Date.now());
        const { error } = await supabaseAdmin
          .from('ctfdl_drafts')
          .update({ status: 'paused', paused_remaining: remaining, updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (error) throw new Error(error.message);
        await postSystemMessage(draftId, 'Staff paused the draft.');
        break;
      }
      case 'resume': {
        if (draft.status !== 'paused') return NextResponse.json({ error: 'Draft is not paused' }, { status: 409 });
        // Restore the remaining time by back-dating the turn start.
        const remaining = draft.paused_remaining ?? draft.pick_seconds ?? 0;
        const elapsed = draft.pick_seconds != null ? Math.max(0, draft.pick_seconds - remaining) : 0;
        const { error } = await supabaseAdmin
          .from('ctfdl_drafts')
          .update({ status: 'live', turn_started_at: new Date(Date.now() - elapsed * 1000).toISOString(), paused_remaining: null, updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (error) throw new Error(error.message);
        await postSystemMessage(draftId, 'Staff resumed the draft.');
        break;
      }
      case 'undo': {
        const undone = await undoPick(draftId);
        const after = await loadBundle(await resolveDraft(draftId), null);
        const who = undone?.player_id ? after.players.find((p) => p.player_id === undone.player_id)?.alias : null;
        const team = after.teams.find((t) => t.id === undone?.team_id);
        await postSystemMessage(draftId, `Staff undid pick #${undone?.undone_overall ?? '?'}${who ? ` (${who} is back in the pool)` : ''}. ${team ? `${team.squad_name} is back on the clock.` : ''}`);
        break;
      }
      case 'skip': {
        if (draft.status !== 'live') return NextResponse.json({ error: 'Draft is not live' }, { status: 409 });
        const teams = await loadTeams(draftId);
        const skipped = teamOnClock(draft, teams);
        await makePick(draftId, null, 'skip', user.id);
        await postSystemMessage(draftId, `Staff skipped ${skipped?.squad_name || 'the current'} turn.`);
        break;
      }
      case 'end': {
        const { error } = await supabaseAdmin
          .from('ctfdl_drafts')
          .update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (error) throw new Error(error.message);
        await postSystemMessage(draftId, 'Staff ended the draft.');
        break;
      }
      case 'reset': {
        // Pull every pick back: remove only the squad memberships the draft
        // created, delete the picks, and return to setup. Teams, ranking,
        // queues and chat history are kept.
        const { data: picks, error: pErr } = await supabaseAdmin
          .from('ctfdl_draft_picks')
          .select('id, membership_id')
          .eq('draft_id', draftId);
        if (pErr) throw new Error(pErr.message);
        const memberIds = (picks || []).map((p: any) => p.membership_id).filter(Boolean);
        if (memberIds.length > 0) {
          const { error } = await supabaseAdmin.from('squad_members').delete().in('id', memberIds);
          if (error) throw new Error(error.message);
        }
        const { error: dErr } = await supabaseAdmin.from('ctfdl_draft_picks').delete().eq('draft_id', draftId);
        if (dErr) throw new Error(dErr.message);
        const { error } = await supabaseAdmin
          .from('ctfdl_drafts')
          .update({ status: 'setup', current_pick: 1, turn_started_at: null, paused_remaining: null, started_at: null, completed_at: null, updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (error) throw new Error(error.message);
        await postSystemMessage(draftId, `Staff reset the draft — ${picks?.length || 0} pick${(picks?.length || 0) === 1 ? '' : 's'} pulled back, players returned to the pool.`);
        break;
      }
      case 'delete': {
        if (draft.status !== 'setup') return NextResponse.json({ error: 'Only a draft that has not started can be deleted' }, { status: 409 });
        const { error } = await supabaseAdmin.from('ctfdl_drafts').delete().eq('id', draftId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, deleted: true });
      }
      default:
        return NextResponse.json({ error: `Unknown action ${body.action}` }, { status: 400 });
    }

    const bundle = await loadBundle(await resolveDraft(draftId), user.id);
    return NextResponse.json({ ok: true, bundle });
  } catch (e: any) {
    console.error('ctfdl draft action failed:', body.action, e);
    return NextResponse.json({ error: e.message || 'Action failed' }, { status: 500 });
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
