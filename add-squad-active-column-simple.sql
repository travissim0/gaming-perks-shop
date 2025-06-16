-- Simple migration to add is_active column to squads table
-- Run this in Supabase SQL Editor

-- Step 1: Add the is_active column
ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Step 2: Set all existing squads to active
UPDATE squads SET is_active = true WHERE is_active IS NULL;

-- Step 3: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_squads_is_active ON squads(is_active);

-- Step 4: Update the RLS policy (optional - can be done later)
-- Note: This will replace the existing policy
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

-- Step 5: Grant admin permissions to manage squad active status
CREATE POLICY IF NOT EXISTS "Admins can update squad active status" ON squads
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
        OR auth.uid() = leader_id
    ); 