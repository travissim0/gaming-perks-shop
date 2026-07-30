import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { GRANTABLE_USER_ACTIONS, getZoneOverview, zoneRotatesMaps } from '@/lib/zoneControl';

// Admin CRUD for per-account zone grants (user_zone_permissions), the table
// behind /test-zone. Before this route the only way to grant someone control of
// a zone was hand-written SQL. Zone-admin only, on every verb.
//
// user_zone_permissions.user_id references auth.users, not profiles, so there
// is no FK for PostgREST to join on - aliases are stitched in from profiles by
// id here instead.

type Grant = {
  user_id: string;
  zone_key: string;
  zone_name: string;
  permissions: string[];
  created_at?: string;
  updated_at?: string;
};

async function withAliases(rows: Grant[]) {
  if (!rows.length) return [];
  const supabase = getServiceSupabase();
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, in_game_alias, email')
    .in('id', ids);
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    in_game_alias: byId.get(r.user_id)?.in_game_alias || null,
    email: byId.get(r.user_id)?.email || null,
  }));
}

// GET                -> every grant, newest first, with the grantee's alias
// GET ?users=<query> -> profile search for the "grant access to" picker
export async function GET(request: NextRequest) {
  try {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;

    const supabase = getServiceSupabase();
    const query = new URL(request.url).searchParams.get('users');

    if (query !== null) {
      const term = query.trim();
      if (term.length < 2) return NextResponse.json({ success: true, users: [] });
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email')
        .ilike('in_game_alias', `%${term}%`)
        .order('in_game_alias')
        .limit(10);
      if (error) throw error;
      return NextResponse.json({ success: true, users: data || [] });
    }

    const { data, error } = await supabase
      .from('user_zone_permissions')
      .select('user_id, zone_key, zone_name, permissions, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      grants: await withAliases((data || []) as Grant[]),
      grantable: GRANTABLE_USER_ACTIONS,
    });
  } catch (error) {
    console.error('Zone permissions GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load zone permissions: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

// POST - grant or update one account's permissions on one zone (upsert).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;

    const { user_id, zone_key, permissions } = await request.json();

    if (!user_id || !zone_key) {
      return NextResponse.json({ success: false, error: 'user_id and zone_key are required' }, { status: 400 });
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Pick at least one permission (or revoke the grant instead)' },
        { status: 400 }
      );
    }
    const grantable: readonly string[] = GRANTABLE_USER_ACTIONS;
    const invalid = permissions.filter((p: string) => !grantable.includes(p));
    if (invalid.length) {
      return NextResponse.json(
        { success: false, error: `Not grantable: ${invalid.join(', ')}` },
        { status: 400 }
      );
    }

    // The zone must be one the daemons actually report, so a typo'd tag cannot
    // become a grant that silently 409s when the grantee clicks a button (the
    // stale 'tzmolo' grants were exactly this).
    const { zones } = await getZoneOverview();
    const zone = zones[zone_key];
    if (!zone) {
      return NextResponse.json(
        { success: false, error: `Unknown zone '${zone_key}'. Known: ${Object.keys(zones).sort().join(', ')}` },
        { status: 400 }
      );
    }
    // 'maps' only means something on a zone that rotates maps (MAP_ENABLED_ZONES).
    if (permissions.includes('maps') && !zoneRotatesMaps(zone_key)) {
      return NextResponse.json(
        { success: false, error: `${zone.name} does not use map rotation, so 'maps' cannot be granted on it` },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('user_zone_permissions')
      .upsert(
        {
          user_id,
          zone_key,
          zone_name: zone.name,
          permissions,
          created_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,zone_key' }
      )
      .select('user_id, zone_key, zone_name, permissions, created_at, updated_at')
      .single();
    if (error) throw error;

    const [grant] = await withAliases([data as Grant]);
    return NextResponse.json({ success: true, grant });
  } catch (error) {
    console.error('Zone permissions POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save grant: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE ?user_id=<uuid>&zone_key=<tag> - revoke one grant.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;

    const params = new URL(request.url).searchParams;
    const userId = params.get('user_id');
    const zoneKey = params.get('zone_key');
    if (!userId || !zoneKey) {
      return NextResponse.json({ success: false, error: 'user_id and zone_key are required' }, { status: 400 });
    }

    const { error } = await getServiceSupabase()
      .from('user_zone_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('zone_key', zoneKey);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Zone permissions DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke grant: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
