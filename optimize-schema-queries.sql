-- Optimization script for slow schema introspection queries
-- Alternative approaches to reduce pg_get_tabledef usage

-- 1. Enable query statistics if not already enabled
-- (This needs to be run by superuser, may not work in Supabase managed)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 2. Create a faster table info cache function
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
AS $$
    SELECT 
        schemaname::text,
        tablename::text,
        (SELECT count(*) FROM information_schema.columns 
         WHERE table_schema = schemaname AND table_name = tablename),
        n_tup_ins + n_tup_upd + n_tup_del as row_estimate,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size
    FROM pg_stat_user_tables 
    WHERE schemaname = target_schema
    ORDER BY tablename;
$$;

-- 3. Create a lightweight table schema summary (alternative to full tabledef)
CREATE OR REPLACE FUNCTION get_table_summary(
    target_schema text DEFAULT 'public',
    target_table text DEFAULT NULL
)
RETURNS TABLE (
    table_name text,
    column_info jsonb,
    constraints_info jsonb,
    indexes_info jsonb
) 
LANGUAGE sql 
STABLE
AS $$
    SELECT 
        t.table_name::text,
        
        -- Column information as JSON
        (SELECT jsonb_agg(
            jsonb_build_object(
                'name', column_name,
                'type', data_type,
                'nullable', is_nullable::boolean,
                'default', column_default
            ) ORDER BY ordinal_position
        ) FROM information_schema.columns c 
         WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        ) as column_info,
        
        -- Constraints as JSON
        (SELECT jsonb_agg(
            jsonb_build_object(
                'name', constraint_name,
                'type', constraint_type
            )
        ) FROM information_schema.table_constraints tc 
         WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name
        ) as constraints_info,
        
        -- Indexes as JSON  
        (SELECT jsonb_agg(
            jsonb_build_object(
                'name', indexname,
                'definition', indexdef
            )
        ) FROM pg_indexes i 
         WHERE i.schemaname = t.table_schema AND i.tablename = t.table_name
        ) as indexes_info
        
    FROM information_schema.tables t
    WHERE t.table_schema = target_schema
      AND (target_table IS NULL OR t.table_name = target_table)
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name;
$$;

-- 4. Create a cached version that only updates when schema changes
CREATE TABLE IF NOT EXISTS schema_cache (
    schema_name text,
    table_name text,
    cache_data jsonb,
    last_updated timestamp DEFAULT now(),
    PRIMARY KEY (schema_name, table_name)
);

-- 5. Function to refresh schema cache only when needed
CREATE OR REPLACE FUNCTION refresh_schema_cache(target_schema text DEFAULT 'public')
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    table_rec record;
BEGIN
    -- Clear old cache for this schema
    DELETE FROM schema_cache WHERE schema_name = target_schema;
    
    -- Rebuild cache with lightweight data
    FOR table_rec IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = target_schema AND table_type = 'BASE TABLE'
    LOOP
        INSERT INTO schema_cache (schema_name, table_name, cache_data)
        SELECT 
            target_schema,
            table_rec.table_name,
            jsonb_build_object(
                'columns', column_info,
                'constraints', constraints_info,
                'indexes', indexes_info
            )
        FROM get_table_summary(target_schema, table_rec.table_name);
    END LOOP;
    
    RAISE NOTICE 'Schema cache refreshed for schema: %', target_schema;
END;
$$;

-- 6. Fast lookup function using cache
CREATE OR REPLACE FUNCTION get_cached_table_info(
    target_schema text DEFAULT 'public',
    target_table text DEFAULT NULL
)
RETURNS TABLE (
    table_name text,
    table_data jsonb,
    last_cached timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        sc.table_name::text,
        sc.cache_data,
        sc.last_updated
    FROM schema_cache sc
    WHERE sc.schema_name = target_schema
      AND (target_table IS NULL OR sc.table_name = target_table)
    ORDER BY sc.table_name;
$$;

-- 7. Trigger to auto-refresh cache when DDL changes occur
-- (This might not be possible in Supabase managed environment)
/*
CREATE OR REPLACE FUNCTION invalidate_schema_cache()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Refresh cache when schema changes
    PERFORM refresh_schema_cache();
END;
$$;

CREATE EVENT TRIGGER schema_cache_invalidator 
ON ddl_command_end 
EXECUTE FUNCTION invalidate_schema_cache();
*/

-- 8. Performance monitoring query
CREATE OR REPLACE FUNCTION analyze_query_performance()
RETURNS TABLE (
    query_type text,
    avg_time_ms numeric,
    max_time_ms numeric,
    call_count bigint,
    recommendation text
)
LANGUAGE sql
AS $$
    SELECT 
        'pg_get_tabledef calls' as query_type,
        COALESCE(avg(mean_exec_time), 0) as avg_time_ms,
        COALESCE(max(max_exec_time), 0) as max_time_ms,
        COALESCE(sum(calls), 0) as call_count,
        CASE 
            WHEN COALESCE(avg(mean_exec_time), 0) > 100 THEN 'CRITICAL: Use caching or alternatives'
            WHEN COALESCE(avg(mean_exec_time), 0) > 50 THEN 'WARNING: Consider optimization'
            ELSE 'ACCEPTABLE: Performance is good'
        END as recommendation
    FROM pg_stat_statements 
    WHERE query ILIKE '%pg_get_tabledef%'
    
    UNION ALL
    
    SELECT 
        'schema introspection' as query_type,
        COALESCE(avg(mean_exec_time), 0) as avg_time_ms,
        COALESCE(max(max_exec_time), 0) as max_time_ms,
        COALESCE(sum(calls), 0) as call_count,
        CASE 
            WHEN COALESCE(sum(calls), 0) > 1000 THEN 'HIGH FREQUENCY: Implement caching'
            WHEN COALESCE(sum(calls), 0) > 100 THEN 'MODERATE: Monitor usage'
            ELSE 'LOW: Normal usage'
        END as recommendation
    FROM pg_stat_statements 
    WHERE query ILIKE '%information_schema%' 
       OR query ILIKE '%pg_class%'
       OR query ILIKE '%pg_namespace%';
$$;

-- 9. Usage examples and recommendations
/*
-- To use the optimized functions:

-- Get lightweight table info instead of full tabledef:
SELECT * FROM get_table_info_fast('public');

-- Get detailed table summary (faster than tabledef):
SELECT * FROM get_table_summary('public', 'profiles');

-- Initialize cache:
SELECT refresh_schema_cache('public');

-- Use cached lookups:
SELECT * FROM get_cached_table_info('public');

-- Monitor performance:
SELECT * FROM analyze_query_performance();
*/ 