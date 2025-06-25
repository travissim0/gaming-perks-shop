import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('Setting up zone community tables...');
    
    // Test if tables exist by trying to query them
    const results = [];
    
    // Test zone_interests table
    try {
      const { data, error } = await supabase
        .from('zone_interests')
        .select('id')
        .limit(1);
      
      if (error) {
        results.push({ 
          table: 'zone_interests', 
          exists: false, 
          error: error.message 
        });
      } else {
        results.push({ 
          table: 'zone_interests', 
          exists: true, 
          message: 'Table exists and accessible' 
        });
      }
    } catch (err: any) {
      results.push({ 
        table: 'zone_interests', 
        exists: false, 
        error: err.message 
      });
    }

    // Test scheduled_zone_events table
    try {
      const { data, error } = await supabase
        .from('scheduled_zone_events')
        .select('id')
        .limit(1);
      
      if (error) {
        results.push({ 
          table: 'scheduled_zone_events', 
          exists: false, 
          error: error.message 
        });
      } else {
        results.push({ 
          table: 'scheduled_zone_events', 
          exists: true, 
          message: 'Table exists and accessible' 
        });
      }
    } catch (err: any) {
      results.push({ 
        table: 'scheduled_zone_events', 
        exists: false, 
        error: err.message 
      });
    }

    const allTablesExist = results.every(r => r.exists);
    
    if (allTablesExist) {
      return NextResponse.json({
        success: true,
        message: 'All zone community tables are already set up and accessible!',
        results
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Some tables need to be created. Please run the SQL script manually.',
        results,
        sql_needed: `
-- Please run this SQL in your Supabase SQL editor:

-- Create zone_interests table
CREATE TABLE IF NOT EXISTS zone_interests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_name VARCHAR(100) NOT NULL,
  player_alias VARCHAR(100) NOT NULL,
  player_email VARCHAR(255),
  days_available TEXT[] NOT NULL DEFAULT '{}',
  time_ranges JSONB NOT NULL DEFAULT '{}',
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

-- Create scheduled_zone_events table
CREATE TABLE IF NOT EXISTS scheduled_zone_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_name VARCHAR(100) NOT NULL,
  event_name VARCHAR(200) NOT NULL,
  scheduled_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  organizer_alias VARCHAR(100) NOT NULL,
  participants TEXT[] NOT NULL DEFAULT '{}',
  auto_start_zone BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_zone_interests_zone_name ON zone_interests(zone_name);
CREATE INDEX IF NOT EXISTS idx_zone_interests_player_alias ON zone_interests(player_alias);
CREATE INDEX IF NOT EXISTS idx_zone_interests_user_id ON zone_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_zone_interests_created_at ON zone_interests(created_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_zone_name ON scheduled_zone_events(zone_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_scheduled_datetime ON scheduled_zone_events(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_status ON scheduled_zone_events(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_organizer_alias ON scheduled_zone_events(organizer_alias);

-- Enable RLS
ALTER TABLE zone_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_zone_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY IF NOT EXISTS "Anyone can view zone interests" ON zone_interests FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Anyone can insert zone interests" ON zone_interests FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Users can update their own zone interests" ON zone_interests FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY IF NOT EXISTS "Users can delete their own zone interests" ON zone_interests FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY IF NOT EXISTS "Anyone can view scheduled events" ON scheduled_zone_events FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert scheduled events" ON scheduled_zone_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
`
      });
    }

  } catch (error: any) {
    console.error('Error checking zone tables:', error);
    return NextResponse.json(
      { error: 'Failed to check zone tables: ' + error.message },
      { status: 500 }
    );
  }
} 