   -- Test 1: Check current policies on squads table
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
  WHERE tablename = 'squads'
  ORDER BY policyname;