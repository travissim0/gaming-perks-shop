-- Add squad banner support and fix RLS policies
-- Run this in your Supabase SQL Editor

-- Add banner_url column to squads table
ALTER TABLE squads ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Add comment for the new column
COMMENT ON COLUMN squads.banner_url IS 'URL for squad banner/logo image';

-- Create index for better performance when filtering by banner presence
CREATE INDEX IF NOT EXISTS idx_squads_banner_url ON squads(banner_url) WHERE banner_url IS NOT NULL;

-- Fix RLS policies to allow squad captain transfers
-- Drop and recreate the problematic squad_members policies

DROP POLICY IF EXISTS "Squad members can be updated by captains" ON squad_members;
DROP POLICY IF EXISTS "Captains and co-captains can manage members" ON squad_members;

-- Create better RLS policies that avoid infinite recursion
CREATE POLICY "Allow squad member role updates" ON squad_members
  FOR UPDATE USING (
    -- User can update their own membership
    auth.uid() = player_id 
    OR 
    -- Squad captain can update any member in their squad
    auth.uid() IN (
      SELECT captain_id FROM squads WHERE id = squad_members.squad_id
    )
  );

-- Also fix squads table update policy to allow captain transfers
DROP POLICY IF EXISTS "Squad leaders can update their squads" ON squads;
DROP POLICY IF EXISTS "Allow captain transfers" ON squads;

-- Create a comprehensive policy that allows both regular updates and captain transfers
CREATE POLICY "Squad captains can update and transfer ownership" ON squads
  FOR UPDATE USING (
    -- Current captain can update squad details and transfer ownership
    auth.uid() = captain_id
  );

-- Alternative: If the above doesn't work for transfers, we can disable RLS temporarily for the transfer operation
-- by creating a stored function with SECURITY DEFINER that bypasses RLS

-- Create a function for safe captain transfers
CREATE OR REPLACE FUNCTION transfer_squad_ownership(
  squad_id_param UUID,
  new_captain_id_param UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  current_captain_id UUID;
BEGIN
  -- Get current captain
  SELECT captain_id INTO current_captain_id 
  FROM squads 
  WHERE id = squad_id_param;
  
  -- Check if the caller is the current captain
  IF current_captain_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the current captain can transfer ownership';
  END IF;
  
  -- Update squad captain
  UPDATE squads 
  SET captain_id = new_captain_id_param 
  WHERE id = squad_id_param;
  
  -- Update old captain role to player
  UPDATE squad_members 
  SET role = 'player' 
  WHERE squad_id = squad_id_param 
  AND player_id = current_captain_id;
  
  -- Update new captain role
  UPDATE squad_members 
  SET role = 'captain' 
  WHERE squad_id = squad_id_param 
  AND player_id = new_captain_id_param;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION transfer_squad_ownership TO authenticated;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'squads' 
AND column_name = 'banner_url'; 