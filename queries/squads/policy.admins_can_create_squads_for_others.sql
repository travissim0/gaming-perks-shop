  -- Add policy to allow admins to create squads on behalf of others
  CREATE POLICY "admins_can_create_squads_for_others" ON squads
      FOR INSERT
      WITH CHECK (
          auth.uid() IN (
              SELECT id FROM profiles
              WHERE is_admin = true OR ctf_role = 'ctf_admin'
          )
      );