-- Fix the get_featured_videos function type mismatch
-- Run this in Supabase SQL Editor

-- First, drop the existing function if it exists
DROP FUNCTION IF EXISTS get_featured_videos(integer);

-- Create the function with correct return type matching actual column types
CREATE OR REPLACE FUNCTION get_featured_videos(limit_count integer DEFAULT 6)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    youtube_url text,
    vod_url text,
    thumbnail_url text,
    video_type text,
    match_id uuid,
    match_title text,
    match_date timestamptz,
    view_count integer,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fv.id,
        fv.title::text,
        fv.description::text,
        fv.youtube_url::text,
        fv.vod_url::text,
        fv.thumbnail_url::text,
        fv.video_type::text,
        fv.match_id,
        COALESCE(m.title::text, NULL) as match_title,
        m.scheduled_at as match_date,
        fv.view_count,
        fv.published_at
    FROM featured_videos fv
    LEFT JOIN matches m ON fv.match_id = m.id
    WHERE fv.is_active = TRUE
    ORDER BY fv.featured_order ASC, fv.published_at DESC
    LIMIT limit_count;
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION get_featured_videos(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_featured_videos(integer) TO anon;

-- Test the function
SELECT 'Testing function' as test_step;
SELECT * FROM get_featured_videos(5); 