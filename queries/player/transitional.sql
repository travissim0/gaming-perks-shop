 ALTER TABLE profiles
  ADD COLUMN transitional_player boolean NOT NULL DEFAULT false;

  -- Update the default max_members for squads from 20 to 15
  ALTER TABLE squads
  ALTER COLUMN max_members SET DEFAULT 15;

  -- Update existing squads to have max_members = 15 (optional, only if you want to apply retroactively)
  -- UPDATE squads SET max_members = 15 WHERE max_members = 20;

  -- Add a comment to document the transitional player field
  COMMENT ON COLUMN profiles.transitional_player IS 'Players coming from other zones (like Skirmish/USL) who are exempt from squad size        
  limits';