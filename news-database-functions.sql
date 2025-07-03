-- Essential News System Database Functions
-- Execute this in your Supabase SQL Editor

-- Drop existing function if it exists (to avoid conflicts)
-- This removes any existing versions to prevent conflicts
DROP FUNCTION IF EXISTS get_news_posts_with_read_status(uuid, integer, integer, uuid);
DROP FUNCTION IF EXISTS get_news_posts_with_read_status(uuid, integer, uuid);
DROP FUNCTION IF EXISTS get_news_posts_with_read_status(integer, uuid, uuid);
DROP FUNCTION IF EXISTS get_news_posts_with_read_status;

-- Function to get news posts with read status for a user
CREATE OR REPLACE FUNCTION get_news_posts_with_read_status(
    user_uuid uuid DEFAULT NULL,
    limit_count integer DEFAULT 10,
    offset_count integer DEFAULT 0,
    post_uuid uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    subtitle text,
    content jsonb,
    featured_image_url text,
    author_name text,
    author_alias text,
    status text,
    featured boolean,
    priority integer,
    view_count integer,
    created_at timestamptz,
    published_at timestamptz,
    tags text[],
    metadata jsonb,
    is_read boolean,
    read_at timestamptz,
    reaction_counts jsonb
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        np.id,
        np.title,
        np.subtitle,
        np.content,
        np.featured_image_url,
        np.author_name,
        COALESCE(p.in_game_alias, np.author_name) as author_alias,
        np.status,
        np.featured,
        np.priority,
        np.view_count,
        np.created_at,
        np.published_at,
        np.tags,
        np.metadata,
        CASE 
            WHEN npr.user_id IS NOT NULL THEN true
            ELSE false
        END as is_read,
        npr.read_at,
        COALESCE(reaction_counts.counts, '{}'::jsonb) as reaction_counts
    FROM news_posts np
    LEFT JOIN profiles p ON np.author_id = p.id
    LEFT JOIN news_post_reads npr ON np.id = npr.post_id AND npr.user_id = user_uuid
    LEFT JOIN (
        SELECT 
            post_id,
            jsonb_object_agg(reaction_type, count) as counts
        FROM (
            SELECT 
                post_id,
                reaction_type,
                COUNT(*) as count
            FROM news_post_reactions
            GROUP BY post_id, reaction_type
        ) reaction_totals
        GROUP BY post_id
    ) reaction_counts ON np.id = reaction_counts.post_id
    WHERE np.status = 'published'
    AND np.published_at <= NOW()
    AND (post_uuid IS NULL OR np.id = post_uuid)
    ORDER BY np.featured DESC, np.priority DESC, np.published_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;

-- Function to mark a news post as read
CREATE OR REPLACE FUNCTION mark_news_post_read(
    post_uuid uuid,
    reading_seconds integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    -- Get the current user from the auth context
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Insert or update the read status
    INSERT INTO news_post_reads (post_id, user_id, read_at, reading_time_seconds)
    VALUES (post_uuid, current_user_id, NOW(), reading_seconds)
    ON CONFLICT (post_id, user_id) 
    DO UPDATE SET 
        read_at = NOW(),
        reading_time_seconds = GREATEST(news_post_reads.reading_time_seconds, reading_seconds);
        
    -- Increment view count
    UPDATE news_posts 
    SET view_count = view_count + 1 
    WHERE id = post_uuid;
END;
$$;

-- Function to increment news post views
CREATE OR REPLACE FUNCTION increment_news_post_views(
    post_uuid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE news_posts 
    SET view_count = view_count + 1 
    WHERE id = post_uuid;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_news_posts_with_read_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_news_post_read TO authenticated;
GRANT EXECUTE ON FUNCTION increment_news_post_views TO anon, authenticated; 