-- Analysis script for slow pg_get_tabledef queries
-- This query is likely being called by Supabase Dashboard or admin tools

-- 1. Check if pg_get_tabledef function exists and its definition
SELECT 
    p.proname as function_name,
    p.prosrc as source_code,
    p.provolatile as volatility,
    p.procost as estimated_cost
FROM pg_proc p 
WHERE p.proname LIKE '%tabledef%'
ORDER BY p.proname;

-- 2. Check recent query statistics (if pg_stat_statements is enabled)
SELECT 
    query,
    calls,
    mean_exec_time,
    max_exec_time,
    total_exec_time
FROM pg_stat_statements 
WHERE query ILIKE '%pg_get_tabledef%' 
   OR query ILIKE '%table_info%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 3. Check what tables are being analyzed most frequently
SELECT 
    schemaname,
    tablename,
    n_tup_ins + n_tup_upd + n_tup_del as total_changes,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY total_changes DESC;

-- 4. Look for any custom pg_get_tabledef implementations
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname ILIKE '%tabledef%'
   AND n.nspname IN ('public', 'pg_temp');

-- 5. Check for any problematic tables that might be causing slow introspection
WITH table_complexity AS (
    SELECT 
        t.table_schema,
        t.table_name,
        COUNT(c.column_name) as column_count,
        COUNT(CASE WHEN c.data_type = 'USER-DEFINED' THEN 1 END) as custom_type_count,
        COUNT(tc.constraint_name) as constraint_count
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    LEFT JOIN information_schema.table_constraints tc ON t.table_name = tc.table_name AND t.table_schema = tc.table_schema
    WHERE t.table_schema = 'public'
    GROUP BY t.table_schema, t.table_name
)
SELECT 
    table_name,
    column_count,
    custom_type_count,
    constraint_count,
    (column_count + custom_type_count * 2 + constraint_count) as complexity_score
FROM table_complexity
ORDER BY complexity_score DESC;

-- 6. Check for any RLS policies that might be complicating things
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

-- 7. Optimization suggestions
SELECT 'RECOMMENDATIONS' as analysis_type, 
       'Consider the following optimizations:' as recommendation
UNION ALL
SELECT 'CACHE', 'If pg_get_tabledef is called frequently, consider caching results'
UNION ALL
SELECT 'INDEXES', 'Ensure pg_class and pg_namespace have proper indexes (usually built-in)'
UNION ALL
SELECT 'MONITORING', 'Enable pg_stat_statements to track specific queries'
UNION ALL
SELECT 'ADMIN_TOOLS', 'Check if admin dashboard is making unnecessary schema calls'
UNION ALL
SELECT 'BATCH_PROCESSING', 'If multiple tables needed, batch the calls instead of individual queries'; 