-- Test Squad Performance Optimizations
-- Run this in Supabase SQL Editor to verify the optimizations are working

-- Test 1: Check if optimized RLS policies exist
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    cmd,
    CASE 
        WHEN qual LIKE '%(select auth.uid())%' THEN '✅ Optimized'
        WHEN qual LIKE '%auth.uid()%' THEN '⚠️ Not Optimized'
        ELSE '? Unknown'
    END as optimization_status
FROM pg_policies 
WHERE tablename = 'squads' 
ORDER BY cmd, policyname;

-- Test 2: Check if optimized functions exist
SELECT 
    routine_name,
    routine_type,
    '✅ Function exists' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%_optimized'
ORDER BY routine_name;

-- Test 3: Test performance of optimized squad query
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM get_active_squads_optimized() LIMIT 10;

-- Test 4: Check critical indexes
SELECT 
    indexname,
    tablename,
    '✅ Index exists' as status
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('squads', 'squad_members', 'squad_invites')
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Test 5: Quick performance test for squad count
SELECT 
    'Active squads' as metric,
    COUNT(*) as count,
    NOW() as tested_at
FROM squads 
WHERE is_active = true;

-- Display completion message
SELECT 
    '🚀 Squad Performance Tests Completed!' as status,
    'Check the results above to verify optimizations are working' as note; 