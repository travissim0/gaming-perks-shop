 -- Replace the constraint to allow admins to create legacy squads
  ALTER TABLE squads DROP CONSTRAINT check_no_direct_legacy_creation; 


    -- Add a new constraint that allows legacy creation for admins or  older squads
  ALTER TABLE squads ADD CONSTRAINT check_legacy_creation_rules
  CHECK (
      (is_legacy = false) OR
      (created_at < (now() - '01:00:00'::interval)) OR
      (captain_id = '7066f090-a1a1-4f5f-bf1a-374d0e06130c')  -- Allow System user to create legacy
  );