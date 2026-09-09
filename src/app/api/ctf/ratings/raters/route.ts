import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { resolveAccess } from '@/lib/ctfRatings/access';

export const dynamic = 'force-dynamic';

/** Only an admin may hand out or take back rater access. */
async function requireAdmin(request: NextRequest) {
  const access = await resolveAccess(request);
  if (!access.userId) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!access.isAdmin) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: access.userId };
}

/**
 * GET /api/ctf/ratings/raters          current grant holders
 * GET /api/ctf/ratings/raters?q=alias  search profiles to grant someone
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;

  const supabase = getServiceSupabase();
  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (q) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, in_game_alias, email')
      .ilike('in_game_alias', `%${q}%`)
      .not('in_game_alias', 'is', null)
      .limit(15);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, results: data ?? [] });
  }

  const { data: grants, error } = await supabase
    .from('ctf_rater_grants')
    .select('user_id, note, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach aliases in one lookup rather than a query per grant.
  const ids = (grants ?? []).map((g) => g.user_id);
  const aliases = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, in_game_alias')
      .in('id', ids);
    for (const p of profiles ?? []) aliases.set(p.id, p.in_game_alias ?? '(no alias)');
  }

  return NextResponse.json({
    success: true,
    raters: (grants ?? []).map((g) => ({
      ...g,
      in_game_alias: aliases.get(g.user_id) ?? '(unknown user)',
    })),
  });
}

/** POST { userId, note } - grant rater access. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || '').trim();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from('ctf_rater_grants').upsert(
    {
      user_id: userId,
      granted_by: auth.userId,
      note: body.note ? String(body.note).slice(0, 200) : null,
    },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** DELETE ?userId=... - revoke. Their past votes stay on record. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;

  const userId = request.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from('ctf_rater_grants').delete().eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
