import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Staff-only: which registered players said they're interested in captaining.
 *
 * GET /api/free-agents/captain-interest?league=<slug>&season=<n>
 *   → { player_ids: string[] }
 *
 * league_captain_interest has RLS with no client policies, so this route
 * (service role) is the only way to read it. Non-staff callers get 403.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, ctf_role')
    .eq('id', user.id)
    .maybeSingle();
  const isStaff = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');
  if (!isStaff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const league = request.nextUrl.searchParams.get('league');
  const seasonRaw = request.nextUrl.searchParams.get('season');
  const season = seasonRaw ? Number(seasonRaw) : NaN;

  let query = supabaseAdmin.from('league_captain_interest').select('player_id').eq('interested', true);
  if (league) query = query.eq('league_slug', league);
  if (!Number.isNaN(season)) query = query.eq('season_number', season);

  const { data, error } = await query;
  if (error) {
    console.error('captain-interest: query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json({ player_ids: (data || []).map((r: any) => r.player_id) });
}
