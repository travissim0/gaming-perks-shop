-- Match Reports System Database Schema
-- Creates tables for storing match reports and player performance ratings
-- IMPORTANT: Run add-ctf-analyst-role.sql first to add the ctf_analyst enum value

-- Create match_reports table for storing match analysis
CREATE TABLE IF NOT EXISTS match_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    squad_a_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    squad_b_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    squad_a_name TEXT NOT NULL, -- Store names in case squads are deleted
    squad_b_name TEXT NOT NULL,
    match_summary TEXT NOT NULL, -- Main match description/summary
    match_highlights_video_url TEXT, -- Optional main highlights video
    match_date DATE NOT NULL DEFAULT CURRENT_DATE,
    season_name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique titles per season
    UNIQUE(title, season_name)
);

-- Create match_player_ratings table for individual player performance ratings
CREATE TABLE IF NOT EXISTS match_player_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_report_id UUID NOT NULL REFERENCES match_reports(id) ON DELETE CASCADE,
    player_alias TEXT NOT NULL, -- Store alias at time of match
    player_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- May be null if player deleted
    class_position TEXT NOT NULL, -- The class/position they played
    performance_description TEXT NOT NULL, -- Paragraph describing their performance
    highlight_clip_url TEXT, -- Optional YouTube/video clip URL
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    turret_damage INTEGER, -- Optional turret damage stat
    rating_before DECIMAL(2,1) NOT NULL CHECK (rating_before >= 1.0 AND rating_before <= 6.0 AND rating_before * 10 % 5 = 0),
    rating_adjustment DECIMAL(2,1) NOT NULL CHECK (rating_adjustment >= -2.0 AND rating_adjustment <= 2.0 AND rating_adjustment * 10 % 5 = 0),
    rating_after DECIMAL(2,1) NOT NULL CHECK (rating_after >= 1.0 AND rating_after <= 6.0 AND rating_after * 10 % 5 = 0),
    display_order INTEGER NOT NULL DEFAULT 0, -- For controlling alternating layout
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one rating per player per match report
    UNIQUE(match_report_id, player_alias)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_reports_season ON match_reports(season_name);
CREATE INDEX IF NOT EXISTS idx_match_reports_date ON match_reports(match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_reports_squad_a ON match_reports(squad_a_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_squad_b ON match_reports(squad_b_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_created_by ON match_reports(created_by);

CREATE INDEX IF NOT EXISTS idx_match_player_ratings_match_id ON match_player_ratings(match_report_id);
CREATE INDEX IF NOT EXISTS idx_match_player_ratings_player_id ON match_player_ratings(player_id);
CREATE INDEX IF NOT EXISTS idx_match_player_ratings_order ON match_player_ratings(match_report_id, display_order);
CREATE INDEX IF NOT EXISTS idx_match_player_ratings_rating_after ON match_player_ratings(rating_after DESC);

-- Create RLS policies for match_reports
ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;

-- Everyone can view published match reports
CREATE POLICY "Anyone can view match reports" ON match_reports
  FOR SELECT USING (true);

-- Only admins, CTF admins, and analysts can create match reports
CREATE POLICY "Admins and analysts can create match reports" ON match_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin' 
        OR profiles.ctf_role = 'ctf_analyst'
      )
    )
  );

-- Only admins, CTF admins, analysts, and original creators can update match reports
CREATE POLICY "Admins, analysts, and creators can update match reports" ON match_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin' 
        OR profiles.ctf_role = 'ctf_analyst'
        OR auth.uid() = match_reports.created_by
      )
    )
  );

-- Only admins and CTF admins can delete match reports
CREATE POLICY "Admins can delete match reports" ON match_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin'
      )
    )
  );

-- Create RLS policies for match_player_ratings
ALTER TABLE match_player_ratings ENABLE ROW LEVEL SECURITY;

-- Everyone can view player ratings
CREATE POLICY "Anyone can view player ratings" ON match_player_ratings
  FOR SELECT USING (true);

-- Only admins, CTF admins, and analysts can create player ratings
CREATE POLICY "Admins and analysts can create player ratings" ON match_player_ratings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin' 
        OR profiles.ctf_role = 'ctf_analyst'
      )
    )
  );

-- Only admins, CTF admins, and analysts can update player ratings
CREATE POLICY "Admins and analysts can update player ratings" ON match_player_ratings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin' 
        OR profiles.ctf_role = 'ctf_analyst'
      )
    )
  );

-- Only admins and CTF admins can delete player ratings
CREATE POLICY "Admins can delete player ratings" ON match_player_ratings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.is_admin = true 
        OR profiles.ctf_role = 'ctf_admin'
      )
    )
  );

-- Create function to get match reports with squad info
CREATE OR REPLACE FUNCTION get_match_reports_with_details()
RETURNS TABLE (
    id UUID,
    title TEXT,
    squad_a_id UUID,
    squad_b_id UUID,
    squad_a_name TEXT,
    squad_b_name TEXT,
    squad_a_banner_url TEXT,
    squad_b_banner_url TEXT,
    match_summary TEXT,
    match_highlights_video_url TEXT,
    match_date DATE,
    season_name TEXT,
    created_by UUID,
    creator_alias TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id,
        mr.title,
        mr.squad_a_id,
        mr.squad_b_id,
        mr.squad_a_name,
        mr.squad_b_name,
        sa.banner_url as squad_a_banner_url,
        sb.banner_url as squad_b_banner_url,
        mr.match_summary,
        mr.match_highlights_video_url,
        mr.match_date,
        mr.season_name,
        mr.created_by,
        p.in_game_alias as creator_alias,
        mr.created_at,
        mr.updated_at
    FROM match_reports mr
    JOIN profiles p ON mr.created_by = p.id
    LEFT JOIN squads sa ON mr.squad_a_id = sa.id
    LEFT JOIN squads sb ON mr.squad_b_id = sb.id
    ORDER BY mr.match_date DESC, mr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get match player ratings with details
CREATE OR REPLACE FUNCTION get_match_player_ratings_with_details(match_report_id_param UUID)
RETURNS TABLE (
    id UUID,
    match_report_id UUID,
    player_alias TEXT,
    player_id UUID,
    class_position TEXT,
    performance_description TEXT,
    highlight_clip_url TEXT,
    kills INTEGER,
    deaths INTEGER,
    turret_damage INTEGER,
    rating_before DECIMAL(2,1),
    rating_adjustment DECIMAL(2,1),
    rating_after DECIMAL(2,1),
    display_order INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mpr.id,
        mpr.match_report_id,
        mpr.player_alias,
        mpr.player_id,
        mpr.class_position,
        mpr.performance_description,
        mpr.highlight_clip_url,
        mpr.kills,
        mpr.deaths,
        mpr.turret_damage,
        mpr.rating_before,
        mpr.rating_adjustment,
        mpr.rating_after,
        mpr.display_order,
        mpr.created_at,
        mpr.updated_at
    FROM match_player_ratings mpr
    WHERE mpr.match_report_id = match_report_id_param
    ORDER BY mpr.display_order ASC, mpr.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON match_reports TO anon, authenticated;
GRANT ALL ON match_reports TO authenticated;
GRANT SELECT ON match_player_ratings TO anon, authenticated;
GRANT ALL ON match_player_ratings TO authenticated;

GRANT EXECUTE ON FUNCTION get_match_reports_with_details() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_match_player_ratings_with_details(UUID) TO anon, authenticated;

-- Add comments for documentation
COMMENT ON TABLE match_reports IS 'Match analysis reports created by analysts, CTF admins, and site admins';
COMMENT ON TABLE match_player_ratings IS 'Individual player performance ratings within match reports';
COMMENT ON FUNCTION get_match_reports_with_details() IS 'Returns match reports with squad banner information';
COMMENT ON FUNCTION get_match_player_ratings_with_details(UUID) IS 'Returns player ratings for a specific match report';
