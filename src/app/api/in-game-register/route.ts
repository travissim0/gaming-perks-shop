import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  console.log('🎮 In-game registration request received at:', new Date().toISOString());
  
  try {
    const body = await req.json();
    const { alias, email } = body;

    console.log('📝 Registration data:', { alias, email });

    // Validate input
    if (!alias || !email) {
      console.error('❌ Missing required fields');
      return NextResponse.json(
        { error: 'Alias and email are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Invalid email format');
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (checkError) {
      console.error('❌ Error checking existing users:', checkError);
      return NextResponse.json(
        { error: 'Failed to check existing users' },
        { status: 500 }
      );
    }

    const emailExists = existingUser.users.some(user => user.email === email);
    if (emailExists) {
      console.error('❌ Email already registered');
      return NextResponse.json(
        { error: 'Email already registered. If you deleted a test account, please run the cleanup script first.' },
        { status: 409 }
      );
    }

    // Check if alias is already taken (using admin client to bypass RLS)
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('in_game_alias', alias)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ Error checking existing alias:', profileError);
      return NextResponse.json(
        { error: 'Failed to check existing alias' },
        { status: 500 }
      );
    }

    if (existingProfile) {
      console.error('❌ Alias already taken');
      return NextResponse.json(
        { error: 'In-game alias already taken' },
        { status: 409 }
      );
    }

    // Send invitation email directly (this creates the user and sends email in one step)
    console.log('📧 Sending invitation email...');
    const redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/complete-registration?alias=${encodeURIComponent(alias)}`;
    
    const { data: inviteData, error: emailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: {
        in_game_alias: alias,
        registration_source: 'in_game',
        registration_timestamp: new Date().toISOString(),
        password_set: false
      }
    });

    if (emailError) {
      console.error('❌ Error sending invitation:', emailError);
      return NextResponse.json(
        { error: `Failed to send invitation: ${emailError.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Invitation sent successfully');
    console.log('📧 User will be created when they accept the invitation');

    // Wait a moment for the user to be created by the invitation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the newly created user to create their profile
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users after invitation:', listError);
      return NextResponse.json(
        { error: 'Invitation sent but failed to create profile' },
        { status: 500 }
      );
    }

    const newUser = allUsers.users.find(user => user.email === email);
    if (!newUser) {
      console.error('❌ User not found after invitation');
      return NextResponse.json(
        { error: 'Invitation sent but user creation pending' },
        { status: 500 }
      );
    }

    console.log('✅ User created via invitation:', newUser.id);

    // Create profile with pending status (using admin client to bypass RLS)
    const { error: profileCreateError } = await supabaseAdmin
      .from('profiles')
      .insert([
        {
          id: newUser.id,
          email: email,
          in_game_alias: alias,
          registration_status: 'pending_verification'
        }
      ]);

    if (profileCreateError) {
      console.error('❌ Error creating profile:', profileCreateError);
      console.error('Profile error details:', JSON.stringify(profileCreateError, null, 2));
      
      return NextResponse.json(
        { error: `Invitation sent but failed to create profile: ${profileCreateError.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Profile created successfully');

    return NextResponse.json({
      success: true,
      message: 'Registration initiated successfully',
      data: {
        alias: alias,
        email: email,
        status: 'pending_verification',
        instructions: 'Check your email to complete registration and set your password',
        note: 'If you don\'t receive the email within a few minutes, check your spam folder.'
      }
    });

  } catch (error: any) {
    console.error('❌ In-game registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 