-- Add Media Manager Role and Match Video Management (Fixed for actual schema)
-- Run this in Supabase SQL Editor

-- Add media_manager column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_media_manager BOOLEAN DEFAULT FALSE;

-- Create index for media manager
CREATE INDEX IF NOT EXISTS idx_profiles_media_manager ON profiles(is_media_manager) WHERE is_media_manager = TRUE;

-- Update RLS policies for featured_videos to allow media managers
DROP POLICY IF EXISTS "Admins can manage featured videos" ON featured_videos;

CREATE POLICY "Admins and media managers can manage featured videos" ON featured_videos 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = TRUE OR is_media_manager = TRUE
        )
    );

-- Add match video management permissions for CTF recorders
-- First, ensure matches table has video columns (if not already added)
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS vod_url TEXT,
ADD COLUMN IF NOT EXISTS highlight_url TEXT,
ADD COLUMN IF NOT EXISTS video_title TEXT,
ADD COLUMN IF NOT EXISTS video_description TEXT,
ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS added_by_user_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS video_added_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for match videos
CREATE INDEX IF NOT EXISTS idx_matches_youtube_url ON matches(youtube_url) WHERE youtube_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_video_added_by ON matches(added_by_user_id) WHERE added_by_user_id IS NOT NULL;

-- Update matches RLS policies to allow CTF recorders to add videos
-- First check if the policy exists and drop it
DROP POLICY IF EXISTS "CTF roles can manage match videos" ON matches;

-- Create new policy for match video management
CREATE POLICY "CTF roles can manage match videos" ON matches
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT p.id 
            FROM profiles p 
            WHERE p.ctf_role IN ('ctf_recorder', 'ctf_referee', 'ctf_head_referee', 'ctf_admin')
        )
        OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = TRUE)
        OR auth.uid() IN (SELECT id FROM profiles WHERE is_media_manager = TRUE)
    );

-- Function to check if user can manage match videos
CREATE OR REPLACE FUNCTION user_can_manage_match_videos(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is admin or media manager
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND (is_admin = TRUE OR is_media_manager = TRUE)
    ) THEN
        RETURN TRUE;
    END IF;

    -- Check if user has CTF recorder role or higher
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND ctf_role IN ('ctf_recorder', 'ctf_referee', 'ctf_head_referee', 'ctf_admin')
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add video to match
CREATE OR REPLACE FUNCTION add_match_video(
    p_match_id UUID,
    p_youtube_url TEXT DEFAULT NULL,
    p_vod_url TEXT DEFAULT NULL,
    p_highlight_url TEXT DEFAULT NULL,
    p_video_title TEXT DEFAULT NULL,
    p_video_description TEXT DEFAULT NULL,
    p_video_thumbnail_url TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_result JSON;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    -- Check permissions
    IF NOT user_can_manage_match_videos(v_user_id) THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient permissions');
    END IF;

    -- Update match with video information
    UPDATE matches 
    SET 
        youtube_url = COALESCE(p_youtube_url, youtube_url),
        vod_url = COALESCE(p_vod_url, vod_url),
        highlight_url = COALESCE(p_highlight_url, highlight_url),
        video_title = COALESCE(p_video_title, video_title),
        video_description = COALESCE(p_video_description, video_description),
        video_thumbnail_url = COALESCE(p_video_thumbnail_url, video_thumbnail_url),
        added_by_user_id = v_user_id,
        video_added_at = NOW()
    WHERE id = p_match_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    RETURN json_build_object('success', true, 'message', 'Video added successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get match video information
CREATE OR REPLACE FUNCTION get_match_video_info(p_match_id UUID)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'youtube_url', m.youtube_url,
        'vod_url', m.vod_url,
        'highlight_url', m.highlight_url,
        'video_title', m.video_title,
        'video_description', m.video_description,
        'video_thumbnail_url', m.video_thumbnail_url,
        'added_by_user_id', m.added_by_user_id,
        'added_by_alias', p.in_game_alias,
        'video_added_at', m.video_added_at,
        'has_video', (m.youtube_url IS NOT NULL OR m.vod_url IS NOT NULL OR m.highlight_url IS NOT NULL)
    ) INTO v_result
    FROM matches m
    LEFT JOIN profiles p ON m.added_by_user_id = p.id
    WHERE m.id = p_match_id;

    RETURN COALESCE(v_result, json_build_object('has_video', false));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to functions
GRANT EXECUTE ON FUNCTION user_can_manage_match_videos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_match_video(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_match_video_info(UUID) TO authenticated;

-- Create trigger to auto-generate thumbnail from YouTube URL
CREATE OR REPLACE FUNCTION auto_generate_video_thumbnail()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-generate YouTube thumbnail if YouTube URL is provided and no custom thumbnail
    IF NEW.youtube_url IS NOT NULL AND (OLD.youtube_url IS NULL OR NEW.youtube_url != OLD.youtube_url) AND NEW.video_thumbnail_url IS NULL THEN
        -- Extract YouTube video ID and generate thumbnail URL
        NEW.video_thumbnail_url := 'https://i.ytimg.com/vi/' || 
            regexp_replace(
                NEW.youtube_url, 
                '.*(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\.be/)([^"&?/\s]{11}).*', 
                '\1'
            ) || '/hqdefault.jpg';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating thumbnails
DROP TRIGGER IF EXISTS auto_generate_match_video_thumbnail ON matches;
CREATE TRIGGER auto_generate_match_video_thumbnail
    BEFORE UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_video_thumbnail();

COMMENT ON COLUMN profiles.is_media_manager IS 'Site-wide media manager role for video platform management';
COMMENT ON FUNCTION user_can_manage_match_videos(UUID) IS 'Check if user can manage match videos (admin, media manager, or CTF recorder+)';
COMMENT ON FUNCTION add_match_video(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS 'Add video information to a match';
COMMENT ON FUNCTION get_match_video_info(UUID) IS 'Get video information for a specific match';

SELECT 'Media roles and match video management added successfully!' as result; 