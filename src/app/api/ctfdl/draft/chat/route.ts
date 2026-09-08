import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest, resolveDraft, loadTeams, canUseChat } from '@/lib/ctfdl-draft-server';
import type { DraftChatMessage } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * Private draft-room chat (staff + captains in the draft).
 * GET  /api/ctfdl/draft/chat?draft=<id>[&after=<iso>]  → { messages }
 * POST /api/ctfdl/draft/chat { draft_id, body }        → { message }
 */
async function gate(request: NextRequest, draftId: string | null) {
  if (!draftId) return { error: NextResponse.json({ error: 'draft required' }, { status: 400 }) };
  const user = await userFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const draft = await resolveDraft(draftId);
  if (!draft) return { error: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) };
  if (!(await canUseChat(draft.id, user.id))) return { error: NextResponse.json({ error: 'Captains and staff only' }, { status: 403 }) };
  return { user, draft };
}

async function decorate(draftId: string, rows: any[]): Promise<DraftChatMessage[]> {
  const senderIds = Array.from(new Set(rows.map((r) => r.sender_id).filter(Boolean)));
  const [{ data: profs }, teams] = await Promise.all([
    senderIds.length ? supabaseAdmin.from('profiles').select('id, in_game_alias, is_admin, ctf_role').in('id', senderIds) : Promise.resolve({ data: [] as any[] }),
    loadTeams(draftId),
  ]);
  const byId: Record<string, any> = {};
  (profs || []).forEach((p: any) => { byId[p.id] = p; });
  const tagByCaptain: Record<string, string | null> = {};
  teams.forEach((t) => { if (t.captain_id) tagByCaptain[t.captain_id] = t.squad_tag; });
  return rows.map((r) => {
    const p = r.sender_id ? byId[r.sender_id] : null;
    return {
      id: r.id,
      sender_id: r.sender_id,
      sender_alias: p?.in_game_alias || null,
      sender_is_staff: !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin'),
      sender_tag: r.sender_id ? tagByCaptain[r.sender_id] || null : null,
      kind: r.kind,
      body: r.body,
      created_at: r.created_at,
    };
  });
}

export async function GET(request: NextRequest) {
  const g = await gate(request, request.nextUrl.searchParams.get('draft'));
  if ('error' in g) return g.error;
  const after = request.nextUrl.searchParams.get('after');
  let q = supabaseAdmin.from('ctfdl_draft_messages').select('*').eq('draft_id', g.draft.id).order('created_at', { ascending: true }).limit(300);
  if (after) q = q.gt('created_at', after);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: await decorate(g.draft.id, data || []) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const g = await gate(request, body?.draft_id || null);
  if ('error' in g) return g.error;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('ctfdl_draft_messages')
    .insert({ draft_id: g.draft.id, sender_id: g.user.id, kind: 'chat', body: text.slice(0, 1000) })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [message] = await decorate(g.draft.id, [data]);
  return NextResponse.json({ ok: true, message });
}
