-- Fix forum posts delete permissions and add post counting
-- This script adds missing RLS policies for DELETE operations and post counting

-- Add post count to profiles table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' 
        AND column_name = 'posts_count'
    ) THEN
        ALTER TABLE profiles ADD COLUMN posts_count INTEGER DEFAULT 0;
        
        -- Initialize post counts for existing users
        UPDATE profiles SET posts_count = (
            SELECT COUNT(*) FROM forum_posts 
            WHERE author_id = profiles.id AND is_deleted = false
        );
    END IF;
END $$;

-- Add DELETE policy for forum_posts that matches UPDATE policy logic
DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;

-- Check if CTF roles system exists for post deletion policies
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'user_ctf_roles'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'user_ctf_roles' 
        AND column_name = 'role_name'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ctf_roles'
    ) THEN
        -- Create deletion policies using actual CTF roles schema
        CREATE POLICY "Authors and moderators can delete posts" ON forum_posts
            FOR DELETE USING (
                auth.uid() = author_id OR 
                auth.uid() IN (
                    SELECT ucr.user_id FROM user_ctf_roles ucr
                    JOIN ctf_roles cr ON ucr.role_name = cr.name
                    WHERE cr.permissions ? 'manage_forum_moderation'
                    AND ucr.is_active = true
                )
            );
    ELSE
        -- Fallback to author-only deletion if CTF roles don't exist
        CREATE POLICY "Authors can delete their posts" ON forum_posts
            FOR DELETE USING (auth.uid() = author_id);
    END IF;
END $$;

-- Create function to update user post counts
CREATE OR REPLACE FUNCTION update_user_post_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment post count for new post
        UPDATE profiles 
        SET posts_count = posts_count + 1
        WHERE id = NEW.author_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle soft deletion (is_deleted change)
        IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
            -- Post was deleted, decrement count
            UPDATE profiles 
            SET posts_count = GREATEST(posts_count - 1, 0)
            WHERE id = OLD.author_id;
        ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
            -- Post was restored, increment count
            UPDATE profiles 
            SET posts_count = posts_count + 1
            WHERE id = NEW.author_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Handle hard deletion
        IF OLD.is_deleted = false THEN
            UPDATE profiles 
            SET posts_count = GREATEST(posts_count - 1, 0)
            WHERE id = OLD.author_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updating user post counts
DROP TRIGGER IF EXISTS update_user_post_count_trigger ON forum_posts;
CREATE TRIGGER update_user_post_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION update_user_post_count();

-- Add similar logic for threads if you want to count those too
CREATE OR REPLACE FUNCTION update_user_thread_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment thread count for new thread (could add threads_count column)
        -- For now, just return
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle soft deletion of threads
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Handle hard deletion of threads
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the changes
SELECT 
    'Posts count column added' as status,
    EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' 
        AND column_name = 'posts_count'
    ) as posts_count_exists;

SELECT 
    'Delete policy exists' as status,
    COUNT(*) > 0 as delete_policy_exists
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'forum_posts' 
    AND cmd = 'DELETE'; 