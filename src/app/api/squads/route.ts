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
    const { name, tag, description, captainId, logoUrl, discordLink, websiteLink } = body;

    // Validate required fields
    if (!name || !tag || !captainId) {
      return NextResponse.json(
        { error: 'Name, tag, and captain ID are required' },
        { status: 400 }
      );
    }

    // Check if squad name or tag already exists
    const { data: existingSquad, error: checkError } = await supabase
      .from('squads')
      .select('id, name, tag')
      .or(`name.eq.${name},tag.eq.${tag}`)
      .eq('is_active', true)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing squad:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingSquad) {
      if (existingSquad.name === name) {
        return NextResponse.json({ error: 'Squad name already taken' }, { status: 409 });
      }
      if (existingSquad.tag === tag) {
        return NextResponse.json({ error: 'Squad tag already taken' }, { status: 409 });
      }
    }

    // Check if user is already in an active (non-legacy) squad
    const { data: existingMembership, error: membershipError } = await supabase
      .from('squad_members')
      .select(`
        id,
        squads!inner(is_legacy)
      `)
      .eq('player_id', captainId)
      .eq('status', 'active')
      .eq('squads.is_legacy', false)
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