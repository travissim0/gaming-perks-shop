import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getLeagues, pickFeatured, getOpenSeason } from '@/lib/leagues';

/**
 * League registration.
 *
 * Registering = joining the free-agent pool for the featured league's open
 * season (active, else upcoming). One league runs at a time, so the server
 * decides which league/season a registration belongs to — the client never
 * picks it.
 *
 * Captain interest lives in league_captain_interest, a table with RLS on and
 * NO client policies. Only this service-role client touches it, which is what
 * keeps the answer staff-only.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function authedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function resolveOpenLeagueSeason() {
  const leagues = await getLeagues();
  const league = pickFeatured(leagues);
  if (!league) return { league: null, season: null };
  const season = await getOpenSeason(league);
  return { league, season };
}

/** The caller's registration for the open season (+ captain interest). */
export async function GET(request: NextRequest) {
  const user = await authedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league, season } = await resolveOpenLeagueSeason();
  if (!league || !season) {
    return NextResponse.json({ league, season: null, registration: null, willing_to_captain: false });
  }

  const { data: rows } = await supabaseAdmin
    .from('free_agents')
    .select('*')
    .eq('player_id', user.id)
    .eq('is_active', true);

  const registration =
    (rows || []).find((r: any) => r.league_slug === league.slug && r.season_number === season.season_number) ||
    (rows || []).find((r: any) => r.league_slug == null) ||
    null;

  const { data: interest } = await supabaseAdmin
    .from('league_captain_interest')
    .select('interested')
    .eq('player_id', user.id)
    .eq('league_slug', league.slug)
    .eq('season_number', season.season_number)
    .maybeSingle();

  return NextResponse.json({
    league: { slug: league.slug, name: league.name, format: league.format },
    season,
    registration,
    willing_to_captain: !!interest?.interested,
  });
}

/** Create or update the caller's registration for the open season. */
export async function POST(request: NextRequest) {
  const user = await authedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.preferred_roles) || body.preferred_roles.length === 0) {
    return NextResponse.json({ error: 'Pick at least one preferred class' }, { status: 400 });
  }
  if (!Array.isArray(body.availability_days) || body.availability_days.length === 0) {
    return NextResponse.json({ error: 'Pick at least one day you can play' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, is_league_banned')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  if (profile.is_league_banned) {
    return NextResponse.json({ error: 'You are banned from CTF leagues and cannot register' }, { status: 403 });
  }

  const { league, season } = await resolveOpenLeagueSeason();
  if (!league || !season) {
    return NextResponse.json({ error: 'Registration is closed — no season is open right now' }, { status: 409 });
  }

  const fields = {
    preferred_roles: body.preferred_roles,
    secondary_roles: Array.isArray(body.secondary_roles) ? body.secondary_roles : [],
    availability: typeof body.availability === 'string' ? body.availability : '',
    availability_days: body.availability_days,
    availability_times: body.availability_times && typeof body.availability_times === 'object' ? body.availability_times : {},
    skill_level: 'intermediate',
    class_ratings: body.class_ratings && typeof body.class_ratings === 'object' ? body.class_ratings : {},
    classes_to_try: Array.isArray(body.classes_to_try) ? body.classes_to_try : [],
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    contact_info: typeof body.contact_info === 'string' && body.contact_info.trim() ? body.contact_info.trim() : null,
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'America/New_York',
    league_slug: league.slug,
    season_number: season.season_number,
    is_active: true,
  };

  // Existing row for this season (active or deactivated, e.g. by the squad-join
  // trigger) or a legacy untagged active row → update it rather than inserting
  // a duplicate that would trip the one-active-row-per-season rule.
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('free_agents')
    .select('id, league_slug, season_number, is_active, updated_at')
    .eq('player_id', user.id)
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false });
  if (rowsErr) {
    console.error('register: lookup failed', rowsErr);
    return NextResponse.json({ error: 'Could not check your registration' }, { status: 500 });
  }

  const existing =
    (rows || []).find((r: any) => r.league_slug === league.slug && r.season_number === season.season_number) ||
    (rows || []).find((r: any) => r.league_slug == null && r.is_active);

  let mode: 'created' | 'updated';
  if (existing) {
    const { error } = await supabaseAdmin.from('free_agents').update(fields).eq('id', existing.id);
    if (error) {
      console.error('register: update failed', error);
      return NextResponse.json({ error: 'Could not save your registration' }, { status: 500 });
    }
    mode = 'updated';
  } else {
    const { error } = await supabaseAdmin.from('free_agents').insert({ player_id: user.id, ...fields });
    if (error) {
      console.error('register: insert failed', error);
      return NextResponse.json({ error: 'Could not save your registration' }, { status: 500 });
    }
    mode = 'created';
  }

  // Captain interest (staff-only table). Missing/false → record false so an
  // unticked box on edit clears an earlier "yes".
  const interested = body.willing_to_captain === true;
  const { error: ciErr } = await supabaseAdmin
    .from('league_captain_interest')
    .upsert(
      {
        player_id: user.id,
        league_slug: league.slug,
        season_number: season.season_number,
        interested,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,league_slug,season_number' },
    );
  if (ciErr) {
    // Don't fail the registration over the optional flag; log for staff.
    console.error('register: captain interest upsert failed', ciErr);
  }

  return NextResponse.json({
    ok: true,
    mode,
    league: { slug: league.slug, name: league.name },
    season: { season_number: season.season_number, season_name: season.season_name },
  });
}

/** Withdraw the caller's registration for the open season (leave the pool). */
export async function DELETE(request: NextRequest) {
  const user = await authedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league, season } = await resolveOpenLeagueSeason();

  let query = supabaseAdmin
    .from('free_agents')
    .update({ is_active: false })
    .eq('player_id', user.id)
    .eq('is_active', true);
  if (league && season) {
    query = query.or(`league_slug.is.null,and(league_slug.eq.${league.slug},season_number.eq.${season.season_number})`);
  }
  const { error } = await query;
  if (error) {
    console.error('register: withdraw failed', error);
    return NextResponse.json({ error: 'Could not leave the pool' }, { status: 500 });
  }

  if (league && season) {
    await supabaseAdmin
      .from('league_captain_interest')
      .update({ interested: false, updated_at: new Date().toISOString() })
      .eq('player_id', user.id)
      .eq('league_slug', league.slug)
      .eq('season_number', season.season_number);
  }

  return NextResponse.json({ ok: true });
}
