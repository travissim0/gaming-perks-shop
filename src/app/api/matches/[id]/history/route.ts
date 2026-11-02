import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, viewerFor, missingTable } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/[id]/history   staff only (Bearer)
 * The match's setup history (match_setup_log): side picks and clears, lineup saves (starters
 * before / after), subs, home swaps, oldest first, with who did it. Lets staff settle a dispute
 * over who changed a lineup or a side. `pending_sql` until add-match-setup-log.sql has run.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.staff || viewer.runs_match) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from('match_setup_log')
    .select('id, at, by_alias, action, squad_id, detail')
    .eq('match_id', id)
    .order('at', { ascending: true })
    .limit(500);
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ pending_sql: true, rows: [] }, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const squadIds = [...new Set((data || []).map((r: any) => r.squad_id).filter(Boolean))] as string[];
  const tags = new Map<string, string>();
  if (squadIds.length) {
    const { data: sq } = await supabaseAdmin.from('squads').select('id, tag, name').in('id', squadIds);
    (sq || []).forEach((s: any) => tags.set(s.id, s.tag || s.name));
  }
  const rows = (data || []).map((r: any) => ({ id: r.id, at: r.at, by: r.by_alias || 'Unknown', action: r.action, squad: r.squad_id ? tags.get(r.squad_id) || null : null, detail: r.detail || {} }));
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
