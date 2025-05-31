-- Simple RLS fix for online users functionality
-- Make reading data completely public, which is safe for a gaming community site

-- Make profiles completely public for reading (this is the main issue)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles are publicly viewable" ON profiles;
CREATE POLICY "Allow all profile reads" ON profiles FOR SELECT USING (true);

-- Make squads completely public for reading  
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;
DROP POLICY IF EXISTS "Public squad info viewable" ON squads;
CREATE POLICY "Allow all squad reads" ON squads FOR SELECT USING (true);

-- Make squad_members completely public for reading
DROP POLICY IF EXISTS "Squad members are viewable by squad members" ON squad_members;
DROP POLICY IF EXISTS "Public squad membership info" ON squad_members;
CREATE POLICY "Allow all squad member reads" ON squad_members FOR SELECT USING (true);

-- Ensure we have the last_seen column in profiles
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'last_seen') THEN
        ALTER TABLE profiles ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Update all user last_seen to current time for immediate testing
UPDATE profiles SET last_seen = NOW() WHERE last_seen IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen);

-- Simple test query that should work now
SELECT COUNT(*) as total_profiles FROM profiles;
SELECT COUNT(*) as profiles_with_recent_activity FROM profiles WHERE last_seen > (NOW() - INTERVAL '1 hour'); 