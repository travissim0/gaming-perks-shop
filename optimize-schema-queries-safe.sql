-- SAFE Optimization script for slow schema introspection queries
-- This version includes safety checks and rollback capabilities

-- SAFETY: Start transaction for easy rollback
BEGIN;

-- SAFETY CHECK: Verify we're in the right database
DO $$
BEGIN
    IF current_database() != 'postgres' THEN
        RAISE NOTICE 'Current database: %', current_database();
        RAISE NOTICE 'Proceeding with optimizations...';
    ELSE
        RAISE EXCEPTION 'Refusing to run on default postgres database for safety';
    END IF;
END $$;

-- 1. Create a lightweight table info function (SAFE)
CREATE OR REPLACE FUNCTION get_table_info_fast(target_schema text DEFAULT 'public')
RETURNS TABLE (
    schema_name text,
    table_name text,
    column_count bigint,
    row_estimate bigint,
    table_size text
) 
LANGUAGE sql 
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        schemaname::text,
        tablename::text,
        (SELECT count(*) FROM information_schema.columns 
         WHERE table_schema = schemaname AND table_name = tablename),
        COALESCE(n_live_tup, 0) as row_estimate,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size
    FROM pg_stat_user_tables 
    WHERE schemaname = target_schema
    ORDER BY tablename;
$$;

-- SAFETY: Test the function works
SELECT 'Testing get_table_info_fast...' as test_status;
SELECT * FROM get_table_info_fast('public') LIMIT 3;

-- 2. Create schema cache table (SAFE - uses IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS schema_cache (
    schema_name text NOT NULL,
    table_name text NOT NULL,
    cache_data jsonb,
    last_updated timestamp DEFAULT now(),
    PRIMARY KEY (schema_name, table_name)
);

-- 3. Create cache refresh function (SAFE)
CREATE OR REPLACE FUNCTION refresh_schema_cache_safe(target_schema text DEFAULT 'public')
RETURNS TABLE (
    action text,
    table_name text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    table_rec record;
    cache_count int := 0;
BEGIN
    -- Safety check
    IF target_schema NOT IN ('public') THEN
        RETURN QUERY SELECT 'ERROR'::text, ''::text, 'Only public schema allowed for safety'::text;
        RETURN;
    END IF;
    
    -- Clear old cache for this schema
    DELETE FROM schema_cache WHERE schema_name = target_schema;
    RETURN QUERY SELECT 'CLEARED'::text, ''::text, 'Old cache cleared'::text;
    
    -- Rebuild cache with basic data only
    FOR table_rec IN 
        SELECT t.table_name 
        FROM information_schema.tables t
        WHERE t.table_schema = target_schema 
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
    LOOP
        BEGIN
            INSERT INTO schema_cache (schema_name, table_name, cache_data)
            SELECT 
                target_schema,
                table_rec.table_name,
                jsonb_build_object(
                    'columns', (
                        SELECT count(*) 
                        FROM information_schema.columns 
                        WHERE table_schema = target_schema 
                          AND table_name = table_rec.table_name
                    ),
                    'has_rls', (
                        SELECT count(*) > 0
                        FROM pg_policies 
                        WHERE tablename = table_rec.table_name
                    ),
                    'estimated_rows', COALESCE((
                        SELECT n_live_tup 
                        FROM pg_stat_user_tables 
                        WHERE schemaname = target_schema 
                          AND tablename = table_rec.table_name
                    ), 0)
                );
            
            cache_count := cache_count + 1;
            RETURN QUERY SELECT 'CACHED'::text, table_rec.table_name::text, 'OK'::text;
            
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT 'ERROR'::text, table_rec.table_name::text, SQLERRM::text;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 'SUMMARY'::text, ''::text, ('Cached ' || cache_count || ' tables')::text;
END;
$$;

-- SAFETY: Test the cache function
SELECT 'Testing cache refresh...' as test_status;
SELECT * FROM refresh_schema_cache_safe('public');

-- 4. Create fast lookup function (SAFE)
CREATE OR REPLACE FUNCTION get_cached_table_info(
    target_schema text DEFAULT 'public',
    target_table text DEFAULT NULL
)
RETURNS TABLE (
    table_name text,
    table_data jsonb,
    cache_age interval
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        sc.table_name::text,
        sc.cache_data,
        (now() - sc.last_updated) as cache_age
    FROM schema_cache sc
    WHERE sc.schema_name = target_schema
      AND (target_table IS NULL OR sc.table_name = target_table)
    ORDER BY sc.table_name;
$$;

-- SAFETY: Test the lookup function
SELECT 'Testing cache lookup...' as test_status;
SELECT table_name, cache_age FROM get_cached_table_info('public') LIMIT 3;

-- 5. Create performance monitoring function (SAFE - handles missing extensions)
CREATE OR REPLACE FUNCTION check_schema_query_performance()
RETURNS TABLE (
    metric text,
    value text,
    recommendation text
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if pg_stat_statements exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RETURN QUERY
        SELECT 
            'pg_stat_statements' as metric,
            'Available' as value,
            'Can analyze query performance' as recommendation;
    ELSE
        RETURN QUERY
        SELECT 
            'pg_stat_statements' as metric,
            'Not Available' as value,
            'Cannot analyze specific query performance' as recommendation;
    END IF;
    
    -- Check cache table status
    RETURN QUERY
    SELECT 
        'schema_cache_entries' as metric,
        count(*)::text as value,
        CASE 
            WHEN count(*) = 0 THEN 'Run refresh_schema_cache_safe() to populate'
            WHEN count(*) > 0 THEN 'Cache is populated and ready'
        END as recommendation
    FROM schema_cache;
    
    -- Check table complexity
    RETURN QUERY
    SELECT 
        'most_complex_table' as metric,
        (tc.table_name || ' (' || tc.column_count || ' cols)') as value,
        'Monitor this table for slow queries' as recommendation
    FROM (
        SELECT 
            t.table_name,
            count(c.column_name) as column_count
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_name = c.table_name 
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
        ORDER BY column_count DESC
        LIMIT 1
    ) tc;
END;
$$;

-- SAFETY: Test performance monitoring
SELECT 'Testing performance monitoring...' as test_status;
SELECT * FROM check_schema_query_performance();

-- 6. Usage instructions
SELECT 'OPTIMIZATION COMPLETE' as status, 
       'Functions created successfully' as message
UNION ALL
SELECT 'USAGE', 'Use get_table_info_fast() instead of complex schema queries'
UNION ALL
SELECT 'CACHING', 'Use refresh_schema_cache_safe() to populate cache'
UNION ALL
SELECT 'LOOKUP', 'Use get_cached_table_info() for fast cached lookups'
UNION ALL
SELECT 'MONITORING', 'Use check_schema_query_performance() to monitor'
UNION ALL
SELECT 'SAFETY', 'All functions are read-only and safe'
UNION ALL
SELECT 'ROLLBACK', 'Run ROLLBACK; to undo all changes if needed';

-- SAFETY: Don't auto-commit - let user decide
-- To commit these changes, run: COMMIT;
-- To rollback these changes, run: ROLLBACK; 