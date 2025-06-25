import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Create the exec_sql function
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
      RETURNS TEXT
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE sql;
        RETURN 'SUCCESS';
      EXCEPTION
        WHEN OTHERS THEN
          RETURN SQLERRM;
      END;
      $$;
    `;

    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error);
      return NextResponse.json(
        { error: 'Database connection failed: ' + error.message },
        { status: 500 }
      );
    }

    console.log('Database connected, attempting to create function...');
    
    // Since we can't execute DDL directly through the REST API,
    // we'll need to use a different approach
    return NextResponse.json({
      success: false,
      message: 'Cannot create exec_sql function through REST API. Please run the SQL directly in Supabase dashboard.',
      sql: createFunctionSQL
    });

  } catch (error: any) {
    console.error('Error creating exec_sql function:', error);
    return NextResponse.json(
      { error: 'Failed to create exec_sql function: ' + error.message },
      { status: 500 }
    );
  }
} 