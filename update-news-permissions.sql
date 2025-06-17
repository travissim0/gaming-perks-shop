-- Update News System Permissions
-- Allow is_admin, is_media_manager, and ctf_role='ctf_admin' to manage news

-- Drop existing admin policies
DROP POLICY IF EXISTS "news_posts_admin_all" ON news_posts;
DROP POLICY IF EXISTS "news_categories_admin_all" ON news_categories;

-- Create updated policies with expanded permissions
CREATE POLICY "news_posts_content_managers" ON news_posts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (
                profiles.is_admin = true 
                OR profiles.is_media_manager = true 
                OR profiles.ctf_role = 'ctf_admin'
            )
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (
                profiles.is_admin = true 
                OR profiles.is_media_manager = true 
                OR profiles.ctf_role = 'ctf_admin'
            )
        )
    );

CREATE POLICY "news_categories_content_managers" ON news_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (
                profiles.is_admin = true 
                OR profiles.is_media_manager = true 
                OR profiles.ctf_role = 'ctf_admin'
            )
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (
                profiles.is_admin = true 
                OR profiles.is_media_manager = true 
                OR profiles.ctf_role = 'ctf_admin'
            )
        )
    );

-- Verify the changes
SELECT 'Policies updated successfully' as status; 