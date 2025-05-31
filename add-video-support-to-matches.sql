-- Add video support to matches table and create featured videos system
-- Run this in Supabase SQL Editor

-- Add video columns to matches table
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS vod_url TEXT,
ADD COLUMN IF NOT EXISTS highlight_url TEXT,
ADD COLUMN IF NOT EXISTS video_title TEXT,
ADD COLUMN IF NOT EXISTS video_description TEXT,
ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS is_featured_video BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS video_published_at TIMESTAMP WITH TIME ZONE;

-- Create featured videos table for homepage showcase
CREATE TABLE IF NOT EXISTS featured_videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    youtube_url TEXT,
    vod_url TEXT,
    thumbnail_url TEXT,
    video_type TEXT DEFAULT 'match', -- 'match', 'highlight', 'tutorial', 'tournament'
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    featured_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create video views tracking table
CREATE TABLE IF NOT EXISTS video_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id UUID REFERENCES featured_videos(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    viewer_ip TEXT,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id TEXT,
    CONSTRAINT check_video_reference CHECK (
        (video_id IS NOT NULL AND match_id IS NULL) OR 
        (video_id IS NULL AND match_id IS NOT NULL)
    )
);

-- Add indexes for video performance
CREATE INDEX IF NOT EXISTS idx_matches_featured_video ON matches(is_featured_video) WHERE is_featured_video = TRUE;
CREATE INDEX IF NOT EXISTS idx_matches_youtube_url ON matches(youtube_url) WHERE youtube_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_featured_videos_active ON featured_videos(is_active, featured_order) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_featured_videos_type ON featured_videos(video_type);
CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_match ON video_views(match_id);

-- Add RLS policies for video tables
ALTER TABLE featured_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

-- Featured videos policies (public read, admin write)
CREATE POLICY "Featured videos are viewable by everyone" ON featured_videos 
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admins can manage featured videos" ON featured_videos 
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
    );

-- Video views policies (public insert for tracking, user can view own)
CREATE POLICY "Anyone can record video views" ON video_views 
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Users can view their own video views" ON video_views 
    FOR SELECT USING (
        auth.uid() = viewer_id OR 
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
    );

-- Function to get featured videos for homepage
CREATE OR REPLACE FUNCTION get_featured_videos(limit_count INTEGER DEFAULT 6)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    youtube_url TEXT,
    vod_url TEXT,
    thumbnail_url TEXT,
    video_type TEXT,
    match_id UUID,
    match_title TEXT,
    match_date TIMESTAMP WITH TIME ZONE,
    view_count INTEGER,
    published_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fv.id,
        fv.title,
        fv.description,
        fv.youtube_url,
        fv.vod_url,
        fv.thumbnail_url,
        fv.video_type,
        fv.match_id,
        m.title as match_title,
        m.scheduled_at as match_date,
        fv.view_count,
        fv.published_at
    FROM featured_videos fv
    LEFT JOIN matches m ON fv.match_id = m.id
    WHERE fv.is_active = TRUE
    ORDER BY fv.featured_order ASC, fv.published_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get match videos (VODs/highlights)
CREATE OR REPLACE FUNCTION get_match_videos(match_uuid UUID)
RETURNS TABLE (
    youtube_url TEXT,
    vod_url TEXT,
    highlight_url TEXT,
    video_title TEXT,
    video_description TEXT,
    thumbnail_url TEXT,
    view_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.youtube_url,
        m.vod_url,
        m.highlight_url,
        m.video_title,
        m.video_description,
        m.video_thumbnail_url,
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM video_views vv 
            WHERE vv.match_id = match_uuid
        ), 0) as view_count
    FROM matches m
    WHERE m.id = match_uuid
    AND (m.youtube_url IS NOT NULL OR m.vod_url IS NOT NULL OR m.highlight_url IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record video view
CREATE OR REPLACE FUNCTION record_video_view(
    p_video_id UUID DEFAULT NULL,
    p_match_id UUID DEFAULT NULL,
    p_viewer_ip TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_viewer_id UUID;
BEGIN
    -- Get current user ID if authenticated
    v_viewer_id := auth.uid();
    
    -- Insert view record
    INSERT INTO video_views (
        video_id, 
        match_id, 
        viewer_id, 
        viewer_ip, 
        session_id
    ) VALUES (
        p_video_id, 
        p_match_id, 
        v_viewer_id, 
        p_viewer_ip, 
        p_session_id
    );
    
    -- Update view count on featured_videos if applicable
    IF p_video_id IS NOT NULL THEN
        UPDATE featured_videos 
        SET view_count = view_count + 1 
        WHERE id = p_video_id;
    END IF;
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_featured_videos(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_match_videos(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_video_view(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

-- Insert some sample featured videos for testing
INSERT INTO featured_videos (title, description, youtube_url, video_type, featured_order, is_active) VALUES
('Epic CTF Battle: Titans vs Collective', 'Watch this intense capture the flag match with amazing teamwork and strategy!', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'match', 1, true),
('Infantry Online: Advanced Tactics Guide', 'Learn pro tips and strategies to dominate the battlefield in this comprehensive guide.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'tutorial', 2, true),
('Tournament Final: Championship Match', 'The most exciting final match of the season - don''t miss the incredible finale!', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'tournament', 3, true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE featured_videos IS 'Videos featured on the homepage and video galleries';
COMMENT ON TABLE video_views IS 'Tracks video view statistics for analytics';
COMMENT ON FUNCTION get_featured_videos(INTEGER) IS 'Returns featured videos for homepage display';
COMMENT ON FUNCTION get_match_videos(UUID) IS 'Returns all videos associated with a specific match';
COMMENT ON FUNCTION record_video_view(UUID, UUID, TEXT, TEXT) IS 'Records a video view for analytics'; 