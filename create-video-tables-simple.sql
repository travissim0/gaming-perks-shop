-- Create minimal video tables if they don't exist
-- Run this in Supabase SQL Editor if the main migration failed

-- Create featured_videos table if it doesn't exist
CREATE TABLE IF NOT EXISTS featured_videos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    youtube_url text,
    vod_url text,
    thumbnail_url text,
    video_type text DEFAULT 'match',
    match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
    featured_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    view_count integer DEFAULT 0,
    published_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create video_views table if it doesn't exist
CREATE TABLE IF NOT EXISTS video_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id uuid REFERENCES featured_videos(id) ON DELETE CASCADE,
    match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
    session_id text,
    ip_address inet,
    user_agent text,
    viewed_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE featured_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access
CREATE POLICY IF NOT EXISTS "Allow public read access to featured videos"
    ON featured_videos FOR SELECT
    TO public
    USING (is_active = true);

CREATE POLICY IF NOT EXISTS "Allow public insert to video views"
    ON video_views FOR INSERT
    TO public
    WITH CHECK (true);

-- Create function to record video views
CREATE OR REPLACE FUNCTION record_video_view(
    p_video_id uuid DEFAULT NULL,
    p_match_id uuid DEFAULT NULL,
    p_session_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert view record
    INSERT INTO video_views (video_id, match_id, session_id)
    VALUES (p_video_id, p_match_id, p_session_id);
    
    -- Update view count if video_id provided
    IF p_video_id IS NOT NULL THEN
        UPDATE featured_videos 
        SET view_count = view_count + 1 
        WHERE id = p_video_id;
    END IF;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION record_video_view(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION record_video_view(uuid, uuid, text) TO anon;

SELECT 'Video tables created successfully' as result; 