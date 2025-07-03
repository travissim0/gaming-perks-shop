-- Complete News System Database Setup
-- Execute this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (be careful with this in production)
-- DROP TABLE IF EXISTS news_post_reactions CASCADE;
-- DROP TABLE IF EXISTS news_post_reads CASCADE;
-- DROP TABLE IF EXISTS news_posts CASCADE;

-- Create main news posts table
CREATE TABLE IF NOT EXISTS news_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subtitle TEXT,
    content JSONB,
    featured_image_url TEXT,
    author_id UUID REFERENCES auth.users(id),
    author_name TEXT NOT NULL,
    status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    featured BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Create news post reads tracking table
CREATE TABLE IF NOT EXISTS news_post_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    reading_time_seconds INTEGER DEFAULT 0,
    UNIQUE(post_id, user_id)
);

-- Create news post reactions table
CREATE TABLE IF NOT EXISTS news_post_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type TEXT CHECK (reaction_type IN ('like', 'love', 'laugh', 'wow', 'sad', 'angry', 'fire', 'rocket', 'star', 'trophy')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id, reaction_type)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_news_posts_status ON news_posts(status);
CREATE INDEX IF NOT EXISTS idx_news_posts_published_at ON news_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_news_posts_featured ON news_posts(featured);
CREATE INDEX IF NOT EXISTS idx_news_posts_priority ON news_posts(priority);
CREATE INDEX IF NOT EXISTS idx_news_posts_tags ON news_posts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_news_post_reads_user_id ON news_post_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reads_post_id ON news_post_reads(post_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reactions_post_id ON news_post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reactions_user_id ON news_post_reactions(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_news_posts_updated_at 
    BEFORE UPDATE ON news_posts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

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
        np.author_name as author_alias,
        np.status,
        np.featured,
        np.priority,
        np.view_count,
        np.created_at,
        np.published_at,
        np.tags,
        np.metadata,
        CASE 
            WHEN user_uuid IS NOT NULL AND npr.user_id IS NOT NULL THEN true
            ELSE false
        END as is_read,
        npr.read_at,
        COALESCE(reaction_counts.counts, '{}'::jsonb) as reaction_counts
    FROM news_posts np
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

-- Set up Row Level Security (RLS)
ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_post_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_post_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for news_posts
CREATE POLICY "News posts are publicly readable if published" ON news_posts
    FOR SELECT USING (status = 'published' AND published_at <= NOW());

CREATE POLICY "Admins can do everything with news posts" ON news_posts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_admin = true OR profiles.is_media_manager = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

-- RLS Policies for news_post_reads
CREATE POLICY "Users can read their own read status" ON news_post_reads
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own read status" ON news_post_reads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own read status" ON news_post_reads
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for news_post_reactions
CREATE POLICY "Reactions are publicly readable" ON news_post_reactions
    FOR SELECT USING (true);

CREATE POLICY "Users can manage their own reactions" ON news_post_reactions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON news_posts TO anon, authenticated;
GRANT ALL ON news_posts TO service_role;

GRANT ALL ON news_post_reads TO authenticated;
GRANT SELECT ON news_post_reads TO service_role;

GRANT ALL ON news_post_reactions TO authenticated;
GRANT SELECT ON news_post_reactions TO anon;
GRANT ALL ON news_post_reactions TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_news_posts_with_read_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_news_post_read TO authenticated;
GRANT EXECUTE ON FUNCTION increment_news_post_views TO anon, authenticated;

-- Insert some sample data (optional)
-- INSERT INTO news_posts (title, subtitle, content, author_name, status, published_at, featured, tags) VALUES
-- (
--     'Welcome to the News System!',
--     'Your new news and announcements platform is ready',
--     '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Welcome to our brand new news system! Here you can stay up to date with all the latest announcements, updates, and community news."}]},{"type":"paragraph","content":[{"type":"text","text":"This system features:"}]},{"type":"bullet_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Rich text content"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Read/unread tracking"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Reaction system"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Featured posts"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Tag system"}]}]}]}]}',
--     'System Admin',
--     'published',
--     NOW(),
--     true,
--     ARRAY['announcement', 'welcome', 'system']
-- );

COMMIT; 