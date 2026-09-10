import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Staff-only season/league settings used by the /league hero.
 *
 * PATCH /api/league/season
 *   { action: 'season_dates', league_slug, season_id,
 *     start_date?, end_date?, registration_closes_on?, draft_on?, playoffs_start_on? }
 *   { action: 'league_discord', league_slug, discord_url }
 *
 * Service role because RLS on league_seasons / ctfpl_seasons / leagues only
 * allows reads from the browser (an UPDATE there "succeeds" with 0 rows).
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DATE_FIELDS = ['start_date', 'end_date', 'registration_closes_on', 'draft_on', 'playoffs_start_on'] as const;

async function requireStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, ctf_role')
    .eq('id', user.id)
    .maybeSingle();
  const isStaff = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');
  return isStaff ? user : null;
}

const cleanDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Dates must be YYYY-MM-DD');
  return v;
};

export async function PATCH(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body?.league_slug === 'string' ? body.league_slug : null;
  if (!slug) return NextResponse.json({ error: 'league_slug required' }, { status: 400 });

  const { data: league } = await supabaseAdmin
    .from('leagues')
    .select('id, slug, data_source')
    .eq('slug', slug)
    .maybeSingle();
  if (!league) return NextResponse.json({ error: 'Unknown league' }, { status: 404 });

  if (body.action === 'league_discord') {
    const url = typeof body.discord_url === 'string' ? body.discord_url.trim() : '';
    if (url && !/^https:\/\/(discord\.gg|discord\.com\/invite)\//i.test(url)) {
      return NextResponse.json({ error: 'Discord URL must start with https://discord.gg/ or https://discord.com/invite/' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('leagues').update({ discord_url: url || null }).eq('id', league.id);
    if (error) {
      console.error('league_discord: update failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, discord_url: url || null });
  }

  if (body.action === 'season_dates') {
    const seasonId = typeof body.season_id === 'string' ? body.season_id : null;
    if (!seasonId) return NextResponse.json({ error: 'season_id required' }, { status: 400 });

    const patch: Record<string, string | null> = {};
    try {
      for (const f of DATE_FIELDS) {
        if (f in body) patch[f] = cleanDate(body[f]);
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const table = league.data_source === 'ctfpl' ? 'ctfpl_seasons' : 'league_seasons';
    let q = supabaseAdmin.from(table).update(patch).eq('id', seasonId);
    if (table === 'league_seasons') q = q.eq('league_id', league.id);
    const { data, error } = await q.select('id').maybeSingle();
    if (error) {
      console.error('season_dates: update failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Season not found for this league' }, { status: 404 });
    return NextResponse.json({ ok: true, ...patch });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
