-- Simple DELETE policy for forum_posts table
-- This allows users to delete only their own posts (no admin permissions for now)

-- Drop existing DELETE policies
DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;

-- Create simple DELETE policy - only authors can delete their own posts
CREATE POLICY "Authors can delete their own posts" ON forum_posts
  FOR DELETE USING (
    auth.uid() = author_id
  );

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'forum_posts'
  AND cmd = 'DELETE'; 