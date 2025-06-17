-- Manual Squad Fixes for Supabase Dashboard
-- Copy and paste these commands one by one into the Supabase SQL Editor

-- 1. Clean up duplicate pending join requests (keeping the oldest)
DELETE FROM squad_invites 
WHERE id IN (
    SELECT id 
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY squad_id, invited_player_id, invited_by 
                   ORDER BY created_at ASC
               ) as rn
        FROM squad_invites 
        WHERE status = 'pending' 
          AND invited_by = invited_player_id
    ) ranked
    WHERE rn > 1
);

-- 2. Create unique partial index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_self_request_idx
ON squad_invites (squad_id, invited_player_id, invited_by)
WHERE status = 'pending' AND invited_by = invited_player_id;

-- 3. Create trigger function to prevent duplicate requests
CREATE OR REPLACE FUNCTION check_duplicate_join_request()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check for self-requests (join requests)
    IF NEW.invited_by = NEW.invited_player_id AND NEW.status = 'pending' THEN
        -- Check if there's already a pending request
        IF EXISTS (
            SELECT 1 FROM squad_invites 
            WHERE squad_id = NEW.squad_id 
              AND invited_player_id = NEW.invited_player_id 
              AND invited_by = NEW.invited_by
              AND status = 'pending'
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'You already have a pending join request for this squad';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to prevent duplicates
DROP TRIGGER IF EXISTS prevent_duplicate_join_requests ON squad_invites;
CREATE TRIGGER prevent_duplicate_join_requests
    BEFORE INSERT OR UPDATE ON squad_invites
    FOR EACH ROW EXECUTE FUNCTION check_duplicate_join_request();

-- 5. Fix RLS policies for squad invites (run these one by one)

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view squad invites and requests" ON squad_invites;
DROP POLICY IF EXISTS "Allow squad invites and join requests" ON squad_invites;
DROP POLICY IF EXISTS "Users and captains can manage squad invites" ON squad_invites;

-- Comprehensive SELECT policy
CREATE POLICY "Users can view squad invites and requests" ON squad_invites 
FOR SELECT USING (
    -- Users can see invites sent TO them
    auth.uid() = invited_player_id 
    OR 
    -- Users can see requests sent BY them (including self-requests)
    auth.uid() = invited_by
    OR
    -- Squad captains/co-captains can see all invites for their squad
    auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_invites.squad_id)
    OR
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    )
);

-- Comprehensive INSERT policy
CREATE POLICY "Allow squad invites and join requests" ON squad_invites 
FOR INSERT WITH CHECK (
    -- Case 1: Squad captain/co-captain inviting someone else
    (auth.uid() != invited_player_id AND (
        auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_invites.squad_id)
        OR
        EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.squad_id = squad_invites.squad_id 
            AND sm.player_id = auth.uid() 
            AND sm.role IN ('captain', 'co_captain')
            AND sm.status = 'active'
        )
    ))
    OR
    -- Case 2: User creating a self-request to join (request to join)
    (auth.uid() = invited_player_id AND auth.uid() = invited_by)
);

-- Comprehensive UPDATE policy
CREATE POLICY "Users and captains can manage squad invites" ON squad_invites 
FOR UPDATE USING (
    -- Users can update invites sent TO them (accept/decline invitations)
    auth.uid() = invited_player_id 
    OR
    -- Users can update requests sent BY them (withdraw requests)
    auth.uid() = invited_by
    OR
    -- Squad captains/co-captains can update invites for their squad
    auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_invites.squad_id)
    OR
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    )
);

-- 6. Fix squad RLS policies to allow captains/co-captains to edit squads
DROP POLICY IF EXISTS "Captains can update their squads" ON squads;
DROP POLICY IF EXISTS "Squad leaders can update their squads" ON squads;

CREATE POLICY "Captains and co-captains can update squads" ON squads 
FOR UPDATE USING (
    -- Squad captain can always update
    auth.uid() = captain_id
    OR
    -- Co-captains can also update (but not ownership transfer)
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squads.id 
        AND sm.player_id = auth.uid() 
        AND sm.role = 'co_captain'
        AND sm.status = 'active'
    )
);

-- 7. Create transfer_squad_ownership function if it doesn't exist
CREATE OR REPLACE FUNCTION transfer_squad_ownership(
    squad_id_param UUID,
    new_captain_id_param UUID
) RETURNS BOOLEAN AS $$
DECLARE
    old_captain_id UUID;
BEGIN
    -- Get current captain
    SELECT captain_id INTO old_captain_id 
    FROM squads 
    WHERE id = squad_id_param;
    
    -- Verify the caller is the current captain
    IF old_captain_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the current captain can transfer ownership';
    END IF;
    
    -- Verify new captain is a member of the squad
    IF NOT EXISTS (
        SELECT 1 FROM squad_members 
        WHERE squad_id = squad_id_param 
          AND player_id = new_captain_id_param 
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'New captain must be an active member of the squad';
    END IF;
    
    -- Update squad captain
    UPDATE squads 
    SET captain_id = new_captain_id_param 
    WHERE id = squad_id_param;
    
    -- Update squad members roles
    UPDATE squad_members 
    SET role = 'captain' 
    WHERE squad_id = squad_id_param 
      AND player_id = new_captain_id_param;
      
    UPDATE squad_members 
    SET role = 'player' 
    WHERE squad_id = squad_id_param 
      AND player_id = old_captain_id;
    
    -- Log the ownership transfer
    PERFORM log_squad_ownership_transfer(
        old_captain_id,
        new_captain_id_param,
        squad_id_param
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 