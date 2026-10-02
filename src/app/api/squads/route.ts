import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'user') {
      // For user squad, we'll use a simpler approach without auth header
      // The frontend will pass the user ID or we'll get it from the session
      
      // For now, return null squad - this will be handled by the frontend
      return NextResponse.json({ squad: null });
    } else {
      // Get all squads
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          created_at,
          max_members,
          logo_url,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members!inner(id)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching squads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const squads = data.map((squad: any) => ({
        ...squad,
        member_count: squad.squad_members?.length || 0,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown'
      }));

      return NextResponse.json({ squads });
    }
  } catch (error: any) {
    console.error('Squad API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, captainId, logoUrl, discordLink, websiteLink } = body;
    let tag: string = typeof body.tag === 'string' ? body.tag.trim().toUpperCase() : '';

    // Validate required fields (tag is optional — derived from the name when blank)
    if (!name || !captainId) {
      return NextResponse.json(
        { error: 'Name and captain ID are required' },
        { status: 400 }
      );
    }

    // Names and tags are unique across ALL squads (squads_name_key / squads_tag_key), inactive
    // and legacy ones included, so the checks below must not filter on is_active. Service role:
    // the public policies may hide inactive squads.
    type Holder = { name: string; tag: string; is_active: boolean; is_legacy: boolean };
    const holderOf = async (column: 'name' | 'tag', value: string): Promise<Holder | null> => {
      const { data } = await supabaseAdmin
        .from('squads')
        .select('name, tag, is_active, is_legacy')
        .eq(column, value)
        .limit(1);
      return (data?.[0] as Holder | undefined) ?? null;
    };
    const describe = (s: Holder) =>
      `${s.name} [${s.tag}]${s.is_legacy ? ', a legacy squad' : s.is_active ? '' : ', an inactive squad'}`;
    const staffHint = (s: Holder) =>
      s.is_active && !s.is_legacy ? '' : ' If that is your old squad, league staff can bring it back for you.';

    if (!tag) {
      const { makeSquadTag } = await import('@/lib/squadTag');
      const base = makeSquadTag(name);
      tag = base;
      // Avoid colliding with any squad's tag: BRUH → BRU1, BRU2, …
      for (let i = 0; i < 10; i++) {
        if (!(await holderOf('tag', tag))) break;
        tag = base.slice(0, 3) + (i + 1);
      }
    } else {
      const tagHolder = await holderOf('tag', tag);
      if (tagHolder) {
        return NextResponse.json(
          { error: `The tag ${tag} is already used by ${describe(tagHolder)}. Pick a different tag.${staffHint(tagHolder)}` },
          { status: 409 },
        );
      }
    }

    const nameHolder = await holderOf('name', name);
    if (nameHolder) {
      return NextResponse.json(
        { error: `The name is already used by ${describe(nameHolder)}. Pick a different name.${staffHint(nameHolder)}` },
        { status: 409 },
      );
    }

    // Check if user is already in a current squad. Legacy squads and archived
    // (inactive) squads from past seasons don't count — a player can keep
    // those memberships for history and still create or join a new squad.
    const { data: existingMembership, error: membershipError } = await supabase
      .from('squad_members')
      .select(`
        id,
        squads!inner(is_legacy, is_active)
      `)
      .eq('player_id', captainId)
      .eq('status', 'active')
      .eq('squads.is_legacy', false)
      .eq('squads.is_active', true)
      .maybeSingle();

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('Error checking existing membership:', membershipError);
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (existingMembership) {
      return NextResponse.json({ error: 'You are already a member of an active squad. You can be in legacy squads and one active squad.' }, { status: 409 });
    }

    // Create the squad (new squads are never legacy)
    const { data: newSquad, error: squadError } = await supabaseAdmin
      .from('squads')
      .insert([
        {
          name,
          tag,
          description,
          captain_id: captainId,
          logo_url: logoUrl,
          discord_link: discordLink,
          website_link: websiteLink,
          is_legacy: false // New squads are always active, never legacy
        }
      ])
      .select()
      .single();

    if (squadError) {
      console.error('Error creating squad:', squadError);
      if (squadError.code === '23505') {
        const which = /tag/i.test(squadError.message) ? 'tag' : /name/i.test(squadError.message) ? 'name' : 'name or tag';
        return NextResponse.json({ error: `That squad ${which} is already taken. Pick a different one.` }, { status: 409 });
      }
      return NextResponse.json({ error: squadError.message }, { status: 500 });
    }

    // Add captain as squad member
    const { error: memberError } = await supabaseAdmin
      .from('squad_members')
      .insert([
        {
          squad_id: newSquad.id,
          player_id: captainId,
          role: 'captain',
          invited_by: captainId
        }
      ]);

    if (memberError) {
      console.error('Error adding captain to squad:', memberError);
      // Clean up the squad if member creation fails
      await supabaseAdmin.from('squads').delete().eq('id', newSquad.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      squad: newSquad,
      message: 'Squad created successfully!'
    });

  } catch (error: any) {
    console.error('Squad creation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 