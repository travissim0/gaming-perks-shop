import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Test if the table exists and get all records
    const { data, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .limit(10);

    if (error) {
      console.error('Table error:', error);
      return NextResponse.json({
        error: error.message,
        tableExists: false,
        fullError: error
      });
    }

    return NextResponse.json({
      tableExists: true,
      recordCount: data?.length || 0,
      records: data || [],
      message: 'Table exists and accessible'
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return NextResponse.json({
      error: error.message,
      tableExists: false,
      fullError: error
    });
  }
} 