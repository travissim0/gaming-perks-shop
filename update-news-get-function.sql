-- Update the get_news_posts_with_read_status function to support filtering by specific post ID
CREATE OR REPLACE FUNCTION get_news_posts_with_read_status(
    user_uuid UUID DEFAULT NULL, 
    limit_count INTEGER DEFAULT 10,
    post_uuid UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    subtitle TEXT,
    content JSONB,
    featured_image_url TEXT,
    author_name TEXT,
    author_alias TEXT,
    status TEXT,
    featured BOOLEAN,
    priority INTEGER,
    view_count INTEGER,
    created_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    tags TEXT[],
    metadata JSONB,
    is_read BOOLEAN,
    read_at TIMESTAMPTZ,
    reaction_counts JSONB
) AS $$
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
        CASE WHEN user_uuid IS NOT NULL THEN (npr.post_id IS NOT NULL) ELSE false END as is_read,
        npr.read_at,
        COALESCE(reaction_stats.reaction_counts, '{}'::jsonb) as reaction_counts
    FROM news_posts np
    LEFT JOIN profiles p ON np.author_id = p.id
    LEFT JOIN news_post_reads npr ON np.id = npr.post_id AND npr.user_id = user_uuid
    LEFT JOIN (
        SELECT 
            post_id,
            jsonb_object_agg(reaction_type, reaction_count) as reaction_counts
        FROM (
            SELECT 
                post_id,
                reaction_type,
                COUNT(*) as reaction_count
            FROM news_post_reactions
            GROUP BY post_id, reaction_type
        ) grouped
        GROUP BY post_id
    ) reaction_stats ON np.id = reaction_stats.post_id
    WHERE np.status = 'published' 
    AND np.published_at <= NOW()
    AND (np.expires_at IS NULL OR np.expires_at > NOW())
    AND (post_uuid IS NULL OR np.id = post_uuid)
    ORDER BY 
        np.featured DESC,
        np.priority DESC,
        np.published_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 