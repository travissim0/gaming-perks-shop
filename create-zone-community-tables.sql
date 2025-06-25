-- Create missing tables for zone community features

-- 1. Zone Interests Table
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

-- 2. Scheduled Zone Events Table
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_zone_interests_zone_name ON zone_interests(zone_name);
CREATE INDEX IF NOT EXISTS idx_zone_interests_player_alias ON zone_interests(player_alias);
CREATE INDEX IF NOT EXISTS idx_zone_interests_user_id ON zone_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_zone_interests_created_at ON zone_interests(created_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_zone_name ON scheduled_zone_events(zone_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_scheduled_datetime ON scheduled_zone_events(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_status ON scheduled_zone_events(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_zone_events_organizer_alias ON scheduled_zone_events(organizer_alias);

-- Enable Row Level Security
ALTER TABLE zone_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_zone_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for zone_interests
-- Anyone can view zone interests (public)
CREATE POLICY "Anyone can view zone interests" ON zone_interests
  FOR SELECT USING (true);

-- Anyone can insert zone interests (for guest users too)
CREATE POLICY "Anyone can insert zone interests" ON zone_interests
  FOR INSERT WITH CHECK (true);

-- Users can update their own zone interests
CREATE POLICY "Users can update their own zone interests" ON zone_interests
  FOR UPDATE USING (
    user_id = auth.uid() OR 
    user_id IS NULL -- Allow updates for guest entries
  );

-- Users can delete their own zone interests
CREATE POLICY "Users can delete their own zone interests" ON zone_interests
  FOR DELETE USING (
    user_id = auth.uid() OR 
    user_id IS NULL -- Allow deletes for guest entries
  );

-- RLS Policies for scheduled_zone_events
-- Anyone can view scheduled events (public)
CREATE POLICY "Anyone can view scheduled events" ON scheduled_zone_events
  FOR SELECT USING (true);

-- Authenticated users can insert scheduled events
CREATE POLICY "Authenticated users can insert scheduled events" ON scheduled_zone_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Event organizers and admins can update events
CREATE POLICY "Event organizers and admins can update events" ON scheduled_zone_events
  FOR UPDATE USING (
    organizer_alias = (
      SELECT in_game_alias 
      FROM profiles 
      WHERE id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.is_zone_admin = true)
    )
  );

-- Event organizers and admins can delete events
CREATE POLICY "Event organizers and admins can delete events" ON scheduled_zone_events
  FOR DELETE USING (
    organizer_alias = (
      SELECT in_game_alias 
      FROM profiles 
      WHERE id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.is_zone_admin = true)
    )
  );

-- Add comments for documentation
COMMENT ON TABLE zone_interests IS 'Stores player interest and availability for specific game zones';
COMMENT ON TABLE scheduled_zone_events IS 'Stores community-organized events for specific game zones';

COMMENT ON COLUMN zone_interests.days_available IS 'Array of day names when player is available';
COMMENT ON COLUMN zone_interests.time_ranges IS 'JSON object with day-specific time ranges';
COMMENT ON COLUMN scheduled_zone_events.participants IS 'Array of player aliases participating in the event';
COMMENT ON COLUMN scheduled_zone_events.auto_start_zone IS 'Whether to automatically start the zone before the event';

-- Create function to get zone availability heatmap data
CREATE OR REPLACE FUNCTION get_zone_availability_heatmap(zone_name_param TEXT)
RETURNS TABLE (
  day_name TEXT,
  hour_slot INTEGER,
  available_count INTEGER,
  available_players TEXT[]
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Generate all possible day/hour combinations
  days AS (
    SELECT unnest(ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) AS day
  ),
  hours AS (
    SELECT generate_series(0, 23) AS hour
  ),
  day_hour_grid AS (
    SELECT days.day, hours.hour
    FROM days CROSS JOIN hours
  ),
  -- Get availability data for the specified zone
  zone_availability AS (
    SELECT 
      zi.player_alias,
      unnest(zi.days_available) AS available_day,
      zi.time_ranges
    FROM zone_interests zi
    WHERE zi.zone_name = zone_name_param
  ),
  -- Extract time ranges and convert to hour slots
  availability_hours AS (
    SELECT 
      za.player_alias,
      za.available_day,
      EXTRACT(HOUR FROM (za.time_ranges->>za.available_day->>'start')::TIME)::INTEGER AS start_hour,
      EXTRACT(HOUR FROM (za.time_ranges->>za.available_day->>'end')::TIME)::INTEGER AS end_hour
    FROM zone_availability za
    WHERE za.time_ranges ? za.available_day
      AND za.time_ranges->>za.available_day IS NOT NULL
      AND za.time_ranges->>za.available_day->>'start' IS NOT NULL
      AND za.time_ranges->>za.available_day->>'end' IS NOT NULL
  ),
  -- Expand availability to individual hours
  expanded_availability AS (
    SELECT 
      ah.player_alias,
      ah.available_day AS day,
      generate_series(ah.start_hour, ah.end_hour) AS hour
    FROM availability_hours ah
  )
  -- Aggregate by day and hour
  SELECT 
    dhg.day::TEXT,
    dhg.hour::INTEGER,
    COALESCE(COUNT(ea.player_alias), 0)::INTEGER AS available_count,
    COALESCE(ARRAY_AGG(ea.player_alias) FILTER (WHERE ea.player_alias IS NOT NULL), ARRAY[]::TEXT[]) AS available_players
  FROM day_hour_grid dhg
  LEFT JOIN expanded_availability ea ON dhg.day = ea.day AND dhg.hour = ea.hour
  GROUP BY dhg.day, dhg.hour
  ORDER BY 
    CASE dhg.day 
      WHEN 'Monday' THEN 1
      WHEN 'Tuesday' THEN 2
      WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4
      WHEN 'Friday' THEN 5
      WHEN 'Saturday' THEN 6
      WHEN 'Sunday' THEN 7
    END,
    dhg.hour;
END;
$$; 