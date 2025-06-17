-- News System Setup for Gaming Perks Shop
-- Comprehensive news posts with rich content, images, and read tracking

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- News Posts Table
CREATE TABLE IF NOT EXISTS news_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subtitle TEXT,
    content JSONB NOT NULL, -- Rich content with formatting, images, etc.
    featured_image_url TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL, -- Cached author name for performance
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    featured BOOLEAN DEFAULT false, -- Featured posts appear more prominently
    priority INTEGER DEFAULT 0, -- Higher priority = appears first
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- Optional expiration date
    tags TEXT[] DEFAULT '{}', -- Array of tags for categorization
    metadata JSONB DEFAULT '{}' -- Additional metadata (theme colors, etc.)
);

-- News Post Read Tracking
CREATE TABLE IF NOT EXISTS news_post_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    reading_time_seconds INTEGER DEFAULT 0,
    UNIQUE(post_id, user_id)
);

-- News Post Reactions (likes, hearts, etc.)
CREATE TABLE IF NOT EXISTS news_post_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type TEXT DEFAULT 'like' CHECK (reaction_type IN ('like', 'heart', 'fire', 'shock')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id, reaction_type)
);

-- News Categories (optional for organization)
CREATE TABLE IF NOT EXISTS news_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6', -- Hex color for UI
    icon TEXT, -- Emoji or icon identifier
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for post categories (many-to-many)
CREATE TABLE IF NOT EXISTS news_post_categories (
    post_id UUID REFERENCES news_posts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES news_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_posts_status_published ON news_posts(status, published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_news_posts_featured ON news_posts(featured, priority DESC, published_at DESC) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_news_posts_author ON news_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reads_user ON news_post_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reads_post ON news_post_reads(post_id);
CREATE INDEX IF NOT EXISTS idx_news_post_reactions_post ON news_post_reactions(post_id);

-- RLS Policies

-- News Posts - Public read for published posts
ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_posts_public_read" ON news_posts
    FOR SELECT USING (status = 'published' AND published_at <= NOW() AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "news_posts_admin_all" ON news_posts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- News Post Reads - Users can manage their own reads
ALTER TABLE news_post_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_post_reads_own" ON news_post_reads
    FOR ALL USING (user_id = auth.uid());

-- News Post Reactions - Users can manage their own reactions
ALTER TABLE news_post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_post_reactions_public_read" ON news_post_reactions
    FOR SELECT USING (true);

CREATE POLICY "news_post_reactions_own" ON news_post_reactions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "news_post_reactions_own_delete" ON news_post_reactions
    FOR DELETE USING (user_id = auth.uid());

-- News Categories - Public read
ALTER TABLE news_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_categories_public_read" ON news_categories
    FOR SELECT USING (true);

CREATE POLICY "news_categories_admin_all" ON news_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- News Post Categories - Public read
ALTER TABLE news_post_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_post_categories_public_read" ON news_post_categories
    FOR SELECT USING (true);

-- Functions

-- Update view count
CREATE OR REPLACE FUNCTION increment_news_post_views(post_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE news_posts 
    SET view_count = view_count + 1,
        updated_at = NOW()
    WHERE id = post_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark post as read
CREATE OR REPLACE FUNCTION mark_news_post_read(post_uuid UUID, reading_seconds INTEGER DEFAULT 0)
RETURNS void AS $$
BEGIN
    INSERT INTO news_post_reads (post_id, user_id, reading_time_seconds)
    VALUES (post_uuid, auth.uid(), reading_seconds)
    ON CONFLICT (post_id, user_id) 
    DO UPDATE SET 
        read_at = NOW(),
        reading_time_seconds = GREATEST(news_post_reads.reading_time_seconds, EXCLUDED.reading_time_seconds);
        
    -- Also increment view count
    PERFORM increment_news_post_views(post_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get news posts with read status for user
CREATE OR REPLACE FUNCTION get_news_posts_with_read_status(user_uuid UUID DEFAULT NULL, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title TEXT,
    subtitle TEXT,
    content JSONB,
    featured_image_url TEXT,
    author_name TEXT,
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
    ORDER BY 
        np.featured DESC,
        np.priority DESC,
        np.published_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default categories
INSERT INTO news_categories (name, description, color, icon) VALUES
    ('Announcements', 'Important game announcements', '#EF4444', '📢'),
    ('Updates', 'Game updates and patches', '#3B82F6', '🔄'),
    ('Events', 'Special events and tournaments', '#10B981', '🎉'),
    ('Community', 'Community highlights and features', '#8B5CF6', '👥'),
    ('Development', 'Development updates and behind the scenes', '#F59E0B', '⚙️')
ON CONFLICT (name) DO NOTHING;

-- Insert sample news post
INSERT INTO news_posts (
    title,
    subtitle,
    content,
    featured_image_url,
    author_name,
    status,
    featured,
    priority,
    published_at,
    tags,
    metadata
) VALUES (
    'Welcome to the New News System!',
    'Stay updated with the latest Infantry Online developments',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "🎉 Exciting News Updates"}]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "We''re thrilled to introduce our "},
                    {"type": "text", "marks": [{"type": "bold"}], "text": "brand new news system"},
                    {"type": "text", "text": " that will keep you updated on all the latest Infantry Online developments!"}
                ]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Features include:"}
                ]
            },
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "marks": [{"type": "bold"}], "text": "Rich text formatting"},
                                    {"type": "text", "text": " with bold, italic, and more"}
                                ]
                            }
                        ]
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "marks": [{"type": "bold"}], "text": "Image support"},
                                    {"type": "text", "text": " for visual content"}
                                ]
                            }
                        ]
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "marks": [{"type": "bold"}], "text": "Read tracking"},
                                    {"type": "text", "text": " so you never miss important updates"}
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Check out this cool link: "},
                    {
                        "type": "text", 
                        "marks": [{"type": "link", "attrs": {"href": "https://example.com"}}], 
                        "text": "Infantry Online Official"
                    }
                ]
            }
        ]
    }',
    'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&h=400&fit=crop',
    'System Admin',
    'published',
    true,
    100,
    NOW(),
    ARRAY['announcement', 'system', 'update'],
    '{"theme": "primary", "highlight": true}'
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE news_posts IS 'News posts with rich content support';
COMMENT ON TABLE news_post_reads IS 'Tracks which users have read which posts';
COMMENT ON TABLE news_post_reactions IS 'User reactions to news posts';
COMMENT ON TABLE news_categories IS 'Categories for organizing news posts'; 