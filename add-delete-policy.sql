-- Add DELETE policy for forum_posts table
-- This allows users to delete their own posts and admins to delete any post

-- Drop existing DELETE policies
DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;

-- Create new DELETE policy
CREATE POLICY "Users can delete own posts" ON forum_posts
  FOR DELETE USING (
    auth.uid() = author_id OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.ctf_admin = true)
    )
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