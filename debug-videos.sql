-- Debug video tables and functions
-- Run this in Supabase SQL Editor to check what's wrong

-- Check if featured_videos table exists and has data
SELECT 'featured_videos table check' as check_type;
SELECT COUNT(*) as total_videos FROM featured_videos;
SELECT * FROM featured_videos LIMIT 5;

-- Check if the function exists
SELECT 'function check' as check_type;
SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_featured_videos';

-- Test the function directly
SELECT 'function test' as check_type;
SELECT * FROM get_featured_videos(6);

-- Check RLS policies
SELECT 'RLS policies check' as check_type;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'featured_videos';

-- Check if current user can read from featured_videos
SELECT 'direct table access check' as check_type;
SELECT id, title, is_active FROM featured_videos WHERE is_active = true; 