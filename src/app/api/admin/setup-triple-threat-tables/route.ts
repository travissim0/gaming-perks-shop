import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin && profile?.ctf_role !== 'ctf_admin') {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
    }

    // Check which tables exist
    const tablesToCheck = [
      'tt_teams',
      'tt_team_members',
      'tt_tournaments',
      'tt_tournament_registrations',
      'tt_matches',
      'tt_match_series',
      'tt_match_rounds',
      'tt_player_stats'
    ];

    const results = await Promise.all(
      tablesToCheck.map(async (tableName) => {
        try {
          const { data, error } = await supabase
            .from(tableName)
            .select('id')
            .limit(1);
          
          return {
            table: tableName,
            exists: !error,
            error: error?.message
          };
        } catch (err) {
          return {
            table: tableName,
            exists: false,
            error: 'Table does not exist'
          };
        }
      })
    );

    const allTablesExist = results.every(r => r.exists);
    
    if (allTablesExist) {
      return NextResponse.json({
        success: true,
        message: 'All Triple Threat tables are already set up and accessible!',
        results
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Some tables need to be created. Please run the SQL script manually.',
        results,
        sql_file: 'create-triple-threat-tables.sql',
        instructions: 'Run the create-triple-threat-tables.sql file in your Supabase SQL editor to set up all Triple Threat tables.'
      });
    }

  } catch (error: any) {
    console.error('Error checking Triple Threat tables:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}
