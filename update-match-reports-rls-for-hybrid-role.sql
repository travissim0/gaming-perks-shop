-- Update RLS policies for match reports to include ctf_analyst_commentator hybrid role
-- This gives the hybrid role full access to create, update, and delete match reports and player ratings

-- Update match_reports INSERT policy
DROP POLICY IF EXISTS "Admins and analysts can create match reports" ON public.match_reports;
CREATE POLICY "Admins and analysts can create match reports"
ON public.match_reports
FOR INSERT
TO public
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type)
    )
  )
));

-- Update match_reports UPDATE policy
DROP POLICY IF EXISTS "Admins, analysts, and creators can update match reports" ON public.match_reports;
CREATE POLICY "Admins, analysts, and creators can update match reports"
ON public.match_reports
FOR UPDATE
TO public
USING (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type) OR
      (auth.uid() = match_reports.created_by)
    )
  )
));

-- Update match_reports DELETE policy
DROP POLICY IF EXISTS "Admins can delete match reports" ON public.match_reports;
CREATE POLICY "Admins can delete match reports"
ON public.match_reports
FOR DELETE
TO public
USING (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type)
    )
  )
));

-- Update match_player_ratings INSERT policy
DROP POLICY IF EXISTS "Admins and analysts can create player ratings" ON public.match_player_ratings;
CREATE POLICY "Admins and analysts can create player ratings"
ON public.match_player_ratings
FOR INSERT
TO public
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type)
    )
  )
));

-- Update match_player_ratings UPDATE policy
DROP POLICY IF EXISTS "Admins, analysts, and creators can update player ratings" ON public.match_player_ratings;
CREATE POLICY "Admins, analysts, and creators can update player ratings"
ON public.match_player_ratings
FOR UPDATE
TO public
USING (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type) OR
      (auth.uid() = match_player_ratings.created_by)
    )
  )
));

-- Update match_player_ratings DELETE policy
DROP POLICY IF EXISTS "Admins and analysts can delete player ratings" ON public.match_player_ratings;
CREATE POLICY "Admins and analysts can delete player ratings"
ON public.match_player_ratings
FOR DELETE
TO public
USING (EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE (
    (profiles.id = auth.uid()) AND
    (
      (profiles.is_admin = true) OR
      (profiles.ctf_role = 'ctf_admin'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst'::ctf_role_type) OR
      (profiles.ctf_role = 'ctf_analyst_commentator'::ctf_role_type)
    )
  )
));

-- Verify all policies were updated
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM
  pg_policies
WHERE
  tablename IN ('match_reports', 'match_player_ratings')
ORDER BY tablename, policyname;
