-- SAFE Analysis script for slow pg_get_tabledef queries
-- This version includes error handling and column name corrections

-- SAFETY CHECK: Show current database info first
SELECT 
    current_database() as database_name,
    current_user as current_user,
    version() as postgres_version;

-- 1. Check if pg_get_tabledef function exists and its definition
SELECT 
    p.proname as function_name,
    CASE 
        WHEN length(p.prosrc) > 100 THEN left(p.prosrc, 100) || '...'
        ELSE p.prosrc 
    END as source_code_preview,
    p.provolatile as volatility,
    p.procost as estimated_cost
FROM pg_proc p 
WHERE p.proname LIKE '%tabledef%'
ORDER BY p.proname;

-- 2. Check if pg_stat_statements extension exists
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension 
WHERE extname = 'pg_stat_statements';

-- 3. Check recent query statistics (SAFE - only if extension exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE 'pg_stat_statements is available - you can run query analysis';
    ELSE
        RAISE NOTICE 'pg_stat_statements is NOT available - query statistics limited';
    END IF;
END $$;

-- 4. Check what tables exist and their basic stats (CORRECTED column names)
SELECT 
    schemaname,
    tablename,
    n_tup_ins + n_tup_upd + n_tup_del as total_changes,
    last_analyze,
    last_autoanalyze,
    n_live_tup as estimated_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY total_changes DESC;

-- 5. Check for any problematic tables that might be causing slow introspection (SAFE)
WITH table_complexity AS (
    SELECT 
        t.table_schema,
        t.table_name,
        COUNT(c.column_name) as column_count,
        COUNT(CASE WHEN c.data_type = 'USER-DEFINED' THEN 1 END) as custom_type_count
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_schema, t.table_name
),
constraint_complexity AS (
    SELECT 
        table_schema,
        table_name,
        COUNT(*) as constraint_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
    GROUP BY table_schema, table_name
)
SELECT 
    tc.table_name,
    tc.column_count,
    tc.custom_type_count,
    COALESCE(cc.constraint_count, 0) as constraint_count,
    (tc.column_count + tc.custom_type_count * 2 + COALESCE(cc.constraint_count, 0)) as complexity_score
FROM table_complexity tc
LEFT JOIN constraint_complexity cc ON tc.table_name = cc.table_name
ORDER BY complexity_score DESC;

-- 6. Check for RLS policies that might be complicating things
SELECT 
    t.tablename,
    COUNT(p.policyname) as policy_count,
    string_agg(p.policyname, ', ') as policies
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename
HAVING COUNT(p.policyname) > 0
ORDER BY policy_count DESC;

-- 7. Test a simple schema query to measure performance
\timing on
SELECT count(*) as total_tables 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 8. Check for indexes on system tables (these should exist)
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'pg_catalog' 
  AND (tablename = 'pg_class' OR tablename = 'pg_namespace')
ORDER BY tablename, indexname;

-- 9. Basic performance recommendations
SELECT 'ANALYSIS COMPLETE' as status, 
       'Check the results above for performance insights' as next_steps
UNION ALL
SELECT 'SAFETY', 'All queries above are read-only and safe to run'
UNION ALL
SELECT 'NEXT_STEP', 'If you want to apply optimizations, use optimize-schema-queries-safe.sql'; 