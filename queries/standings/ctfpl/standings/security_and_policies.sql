-- Create RLS policies (adjust based on your security needs)        
  ALTER TABLE ctfpl_standings ENABLE ROW LEVEL SECURITY;

   -- Allow public read access for standings
  CREATE POLICY "Allow public read access to standings" ON
  ctfpl_standings
      FOR SELECT USING (true);

  -- Only allow admins to insert/update standings
  CREATE POLICY "Allow admin insert on standings" ON
  ctfpl_standings
      FOR INSERT WITH CHECK (
          EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role      
  = 'ctf_admin')
          )
      );

  CREATE POLICY "Allow admin update on standings" ON
  ctfpl_standings
      FOR UPDATE USING (
          EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role      
  = 'ctf_admin')
          )
      );