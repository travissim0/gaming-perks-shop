-- Complete Database Schema Export
-- Run this in your Supabase SQL Editor to get complete schema information

-- 1. Get all table structures with exact column types
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.column_default,
    c.is_nullable,
    c.character_maximum_length,
    tc.constraint_type,
    kcu.constraint_name
FROM information_schema.tables t
LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
LEFT JOIN information_schema.key_column_usage kcu ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
WHERE t.table_schema = 'public' 
AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- 2. Get all custom types and enums
SELECT 
    t.typname as type_name,
    t.typtype as type_type,
    CASE 
        WHEN t.typtype = 'e' THEN 
            array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ', ')
        ELSE 'composite/other'
    END as enum_values
FROM pg_type t
LEFT JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY t.typname, t.typtype
ORDER BY t.typname;

-- 3. Get all RPC functions with their signatures and return types
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as parameters,
    pg_get_function_result(p.oid) as return_type,
    p.prosrc as function_body,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'  
        WHEN 'v' THEN 'VOLATILE'
    END as volatility,
    p.prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'  -- functions only, not procedures
ORDER BY p.proname;

-- 4. Get all views and their definitions
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- 5. Get all indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6. Get RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7. Get foreign key relationships
SELECT 
    tc.table_name as table_name,
    kcu.column_name as column_name,
    ccu.table_name as foreign_table_name,
    ccu.column_name as foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 8. Get specific RPC functions that are commonly used (to debug type issues)
-- This helps identify the exact return structure of problem functions
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as parameters,
    pg_get_function_result(p.oid) as return_type,
    p.prosrc as source_code
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'get_squad_invitations_optimized',
    'get_free_agents_optimized',
    'get_squad_members_optimized'
)
ORDER BY p.proname; 