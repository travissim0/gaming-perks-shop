import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    console.log('👤 Profile visibility API called');

    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No valid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Auth verification failed:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('✅ User authenticated:', user.id);

    const body = await request.json();
    const { hide_from_free_agents } = body;

    if (typeof hide_from_free_agents !== 'boolean') {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 });
    }

    console.log(`📝 Updating visibility to: ${hide_from_free_agents} for user: ${user.id}`);

    // Update the user's profile using the service client to bypass RLS
    const { createClient } = require('@supabase/supabase-js');
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: updateData, error: updateError } = await serviceSupabase
      .from('profiles')
      .update({ hide_from_free_agents })
      .eq('id', user.id)
      .select();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    console.log('✅ Profile updated successfully:', updateData);

    // Verify the update
    const { data: verifyData, error: verifyError } = await serviceSupabase
      .from('profiles')
      .select('hide_from_free_agents')
      .eq('id', user.id)
      .single();

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
      return NextResponse.json({ error: 'Failed to verify update' }, { status: 500 });
    }

    console.log('🔍 Verification result:', verifyData);

    return NextResponse.json({ 
      success: true, 
      hide_from_free_agents: verifyData.hide_from_free_agents 
    });

  } catch (error: any) {
    console.error('❌ Profile visibility API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 