-- Forum System Database Schema (Clean Version)
-- Standalone forum system without CTF roles dependencies

-- Create forum categories table
CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#6366f1', -- Color for UI theming
    icon TEXT, -- Icon name for UI
    position INTEGER DEFAULT 0, -- For ordering categories
    is_active BOOLEAN DEFAULT TRUE,
    requires_role TEXT, -- Optional role requirement to view/post
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create forum threads table
CREATE TABLE IF NOT EXISTS forum_threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    last_reply_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_reply_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category_id, slug)
);

-- Create forum posts table (replies to threads)
CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    parent_post_id UUID REFERENCES forum_posts(id) ON DELETE SET NULL, -- For nested replies
    is_deleted BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create forum thread views table (for tracking unique views)
CREATE TABLE IF NOT EXISTS forum_thread_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    ip_address INET,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(thread_id, user_id),
    UNIQUE(thread_id, ip_address) -- For anonymous views
);

-- Create forum user preferences table
CREATE TABLE IF NOT EXISTS forum_user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    email_notifications BOOLEAN DEFAULT TRUE,
    signature TEXT,
    posts_per_page INTEGER DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create forum moderation log table
CREATE TABLE IF NOT EXISTS forum_moderation_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    moderator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL, -- 'pin', 'unpin', 'lock', 'unlock', 'delete', 'edit', 'move'
    target_type TEXT NOT NULL, -- 'thread', 'post', 'category'
    target_id UUID NOT NULL,
    reason TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create forum subscriptions table (for notifications)
CREATE TABLE IF NOT EXISTS forum_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, thread_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_forum_categories_position ON forum_categories(position);
CREATE INDEX IF NOT EXISTS idx_forum_categories_slug ON forum_categories(slug);
CREATE INDEX IF NOT EXISTS idx_forum_threads_category_id ON forum_threads(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_author_id ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_reply_at ON forum_threads(last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_slug ON forum_threads(slug);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread_id ON forum_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_id ON forum_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_at ON forum_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_forum_thread_views_thread_id ON forum_thread_views(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_subscriptions_user_id ON forum_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_subscriptions_thread_id ON forum_subscriptions(thread_id);

-- Enable Row Level Security
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_thread_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for forum_categories
CREATE POLICY "Forum categories are viewable by everyone" ON forum_categories
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage categories" ON forum_categories
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

-- RLS Policies for forum_threads
CREATE POLICY "Forum threads are viewable by everyone" ON forum_threads
    FOR SELECT USING (is_deleted = false);

CREATE POLICY "Authenticated users can create threads" ON forum_threads
    FOR INSERT WITH CHECK (auth.uid() = author_id AND auth.uid() IS NOT NULL);

CREATE POLICY "Authors can update their threads" ON forum_threads
    FOR UPDATE USING (auth.uid() = author_id);

-- RLS Policies for forum_posts
CREATE POLICY "Forum posts are viewable by everyone" ON forum_posts
    FOR SELECT USING (is_deleted = false);

CREATE POLICY "Authenticated users can create posts" ON forum_posts
    FOR INSERT WITH CHECK (auth.uid() = author_id AND auth.uid() IS NOT NULL);

CREATE POLICY "Authors can update their posts" ON forum_posts
    FOR UPDATE USING (auth.uid() = author_id);

-- RLS Policies for forum_thread_views
CREATE POLICY "Anyone can insert thread views" ON forum_thread_views
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view their own thread views" ON forum_thread_views
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- RLS Policies for forum_user_preferences
CREATE POLICY "Users can view and manage their own preferences" ON forum_user_preferences
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for forum_moderation_log
CREATE POLICY "Admins can view moderation log" ON forum_moderation_log
    FOR SELECT USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "Admins can insert moderation log" ON forum_moderation_log
    FOR INSERT WITH CHECK (auth.uid() = moderator_id);

-- RLS Policies for forum_subscriptions
CREATE POLICY "Users can manage their own subscriptions" ON forum_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- Functions for forum statistics and management
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update reply count and last reply info
        UPDATE forum_threads 
        SET 
            reply_count = reply_count + 1,
            last_reply_at = NEW.created_at,
            last_reply_user_id = NEW.author_id,
            updated_at = NOW()
        WHERE id = NEW.thread_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrease reply count
        UPDATE forum_threads 
        SET 
            reply_count = GREATEST(reply_count - 1, 0),
            updated_at = NOW()
        WHERE id = OLD.thread_id;
        
        -- Update last reply info if this was the last reply
        UPDATE forum_threads 
        SET 
            last_reply_at = COALESCE(
                (SELECT created_at FROM forum_posts 
                 WHERE thread_id = OLD.thread_id AND is_deleted = false 
                 ORDER BY created_at DESC LIMIT 1),
                created_at
            ),
            last_reply_user_id = COALESCE(
                (SELECT author_id FROM forum_posts 
                 WHERE thread_id = OLD.thread_id AND is_deleted = false 
                 ORDER BY created_at DESC LIMIT 1),
                author_id
            )
        WHERE id = OLD.thread_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updating thread stats
CREATE TRIGGER update_thread_stats_trigger
    AFTER INSERT OR DELETE ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION update_thread_stats();

-- Function to increment thread view count
CREATE OR REPLACE FUNCTION increment_thread_views(thread_uuid UUID, user_uuid UUID DEFAULT NULL, user_ip INET DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    -- Insert view record (will be ignored if duplicate due to UNIQUE constraint)
    INSERT INTO forum_thread_views (thread_id, user_id, ip_address, viewed_at)
    VALUES (thread_uuid, user_uuid, user_ip, NOW())
    ON CONFLICT DO NOTHING;
    
    -- Update view count on thread
    UPDATE forum_threads 
    SET view_count = view_count + 1, updated_at = NOW()
    WHERE id = thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers for all forum tables
CREATE TRIGGER update_forum_categories_updated_at BEFORE UPDATE ON forum_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forum_threads_updated_at BEFORE UPDATE ON forum_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forum_posts_updated_at BEFORE UPDATE ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forum_user_preferences_updated_at BEFORE UPDATE ON forum_user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default forum categories
INSERT INTO forum_categories (name, description, slug, color, icon, position) VALUES
('General Discussion', 'General gaming and community discussions', 'general', '#6366f1', 'chat', 1),
('CTF Strategies', 'Capture the Flag strategies and tactics', 'ctf-strategies', '#059669', 'shield', 2),
('Squad Recruitment', 'Find and recruit squad members', 'recruitment', '#dc2626', 'users', 3),
('Match Reports', 'Post match results and highlights', 'match-reports', '#7c3aed', 'trophy', 4),
('Technical Support', 'Get help with technical issues', 'support', '#ea580c', 'wrench', 5),
('Announcements', 'Official announcements and news', 'announcements', '#0891b2', 'megaphone', 0)
ON CONFLICT (slug) DO NOTHING; 