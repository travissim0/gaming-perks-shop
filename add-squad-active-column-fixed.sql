-- Fixed migration to add is_active column to squads table
-- Run this in Supabase SQL Editor

-- Step 1: Add the is_active column (safe to run multiple times)
ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Step 2: Set all existing squads to active
UPDATE squads SET is_active = true WHERE is_active IS NULL;

-- Step 3: Create index for better performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_squads_is_active ON squads(is_active);

-- Step 4: Drop existing policy and recreate it
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;

CREATE POLICY "Public squads are viewable by everyone" ON squads
    FOR SELECT USING (
        is_active = true
        OR auth.uid() = leader_id 
        OR auth.uid() IN (
            SELECT user_id FROM squad_members WHERE squad_id = squads.id
        )
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    );

-- Step 5: Drop existing admin policy if it exists and create new one
DROP POLICY IF EXISTS "Admins can update squad active status" ON squads;
DROP POLICY IF EXISTS "Squad leaders can update their squads" ON squads;

-- Recreate the update policy to include both leaders and admins
CREATE POLICY "Squad leaders and admins can update squads" ON squads
    FOR UPDATE USING (
        auth.uid() = leader_id
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    ); 