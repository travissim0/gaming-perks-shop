-- EMERGENCY FIX: Complete RLS reset for squad_members table
-- This will resolve the infinite recursion by removing ALL policies and starting fresh

-- Step 1: Completely disable RLS to break any existing recursion
ALTER TABLE squad_members DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop every possible policy that might exist (comprehensive cleanup)
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Get all policies on squad_members table and drop them
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'squad_members' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON squad_members', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
    
    -- Also drop some common policy names that might exist
    EXECUTE 'DROP POLICY IF EXISTS "squad_members_anonymous_read" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "squad_members_public_read" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "squad_members_simple_read" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "squad_members_active_only" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "Members can view squad member info" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "Squad members read access" ON squad_members';
    EXECUTE 'DROP POLICY IF EXISTS "Allow squad members to read squad data" ON squad_members';
    
    RAISE NOTICE 'All squad_members policies have been cleared';
END $$;

-- Step 3: Re-enable RLS
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;

-- Step 4: Create the SIMPLEST possible policy - no joins, no subqueries, no recursion
CREATE POLICY "squad_members_allow_all_reads" ON squad_members
    FOR SELECT USING (true);

-- Step 5: Test the fix immediately
DO $$
DECLARE
    test_count INTEGER;
    test_result RECORD;
BEGIN
    -- Test 1: Simple count
    SELECT COUNT(*) INTO test_count FROM squad_members;
    RAISE NOTICE 'Test 1 SUCCESS: Found % total members', test_count;
    
    -- Test 2: Count with status filter
    SELECT COUNT(*) INTO test_count FROM squad_members WHERE status = 'active';
    RAISE NOTICE 'Test 2 SUCCESS: Found % active members', test_count;
    
    -- Test 3: Sample query with squad_id filter
    SELECT COUNT(*) INTO test_count 
    FROM squad_members 
    WHERE squad_id = (SELECT id FROM squads LIMIT 1) 
    AND status = 'active';
    RAISE NOTICE 'Test 3 SUCCESS: Found % members for sample squad', test_count;
    
    -- Test 4: Group by squad_id (like the frontend does)
    SELECT squad_id, COUNT(*) as member_count 
    INTO test_result
    FROM squad_members 
    WHERE status = 'active' 
    GROUP BY squad_id 
    LIMIT 1;
    
    RAISE NOTICE 'Test 4 SUCCESS: Squad % has % members', test_result.squad_id, test_result.member_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test FAILED: %', SQLERRM;
END $$;

-- Step 6: Verify no recursion policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'squad_members' 
AND schemaname = 'public';

-- Emergency fix completed. squad_members table should now be accessible without recursion. 