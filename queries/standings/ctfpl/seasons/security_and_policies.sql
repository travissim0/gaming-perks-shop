-- Create RLS policies for seasons table
  ALTER TABLE ctfpl_seasons ENABLE ROW LEVEL SECURITY;

  -- Allow public read access
  CREATE POLICY "Allow public read access to seasons" ON
  ctfpl_seasons
      FOR SELECT USING (true);

  -- Only allow admins to modify seasons
  CREATE POLICY "Allow admin write access to seasons" ON
  ctfpl_seasons
      FOR ALL USING (
          EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role      
  = 'ctf_admin')
          )
      );