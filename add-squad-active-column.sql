-- Migration: Add is_active column to squads table
-- This allows admins to control which squads are shown on the main page widget

ALTER TABLE squads 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Set all existing squads to active
UPDATE squads SET is_active = true WHERE is_active IS NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_squads_is_active ON squads(is_active);

-- Update RLS policy to only show active squads in public view
-- First check if is_public column exists, if not, just use is_active
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;

-- Create policy that works whether is_public exists or not
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

-- Grant admin permissions to manage squad active status
CREATE POLICY "Admins can update squad active status" ON squads
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    ); 