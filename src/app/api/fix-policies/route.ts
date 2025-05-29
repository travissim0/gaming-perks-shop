import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    console.log('Creating RLS policy for match participants...');
    
    // Try to create the policy using direct SQL
    const { data, error } = await supabaseAdmin
      .from('match_participants')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Basic query failed:', error);
      return NextResponse.json({ 
        error: 'Database connection failed: ' + error.message 
      }, { status: 500 });
    }

    // Since we can't use exec_sql, let's return instructions for manual execution
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection confirmed',
      instructions: 'Please run this SQL in Supabase SQL Editor: CREATE POLICY "Users can delete their own participation" ON match_participants FOR DELETE USING (auth.uid() = player_id);'
    });

  } catch (error: any) {
    console.error('Policy creation error:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
} 