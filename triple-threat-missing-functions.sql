-- Missing Triple Threat RPC Functions
-- Execute these in your Supabase SQL editor to fix team signup issues

-- 1. Fix the missing tt_verify_team_password function
CREATE OR REPLACE FUNCTION tt_verify_team_password(
    team_name_input TEXT, 
    password_input TEXT
)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT team_password_hash INTO stored_hash
    FROM tt_teams
    WHERE team_name = team_name_input AND is_active = true;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN crypt(password_input, stored_hash) = stored_hash;
END;
$$;

-- 2. Fix the missing tt_can_join_team function
CREATE OR REPLACE FUNCTION tt_can_join_team(
    team_id_input UUID,
    user_id_input UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_record RECORD;
    current_members INTEGER;
BEGIN
    -- Check if user is already on any team
    IF EXISTS (
        SELECT 1 FROM tt_team_members 
        WHERE player_id = user_id_input AND is_active = true
    ) THEN
        RETURN FALSE;
    END IF;

    -- Get team info
    SELECT * INTO team_record 
    FROM tt_teams 
    WHERE id = team_id_input AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if team is full
    SELECT COUNT(*) INTO current_members 
    FROM tt_team_members 
    WHERE team_id = team_id_input AND is_active = true;
    
    IF current_members >= team_record.max_players THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

-- 3. Create alias function for tt_leave_team (to match teams page call)
CREATE OR REPLACE FUNCTION tt_leave_team(user_id_input UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Just call the existing leave_tt_team function
    RETURN leave_tt_team(user_id_input);
END;
$$;

-- 4. Create team cleanup trigger function
CREATE OR REPLACE FUNCTION cleanup_empty_tt_teams()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    remaining_members INTEGER;
BEGIN
    -- Check if this was an active member being deactivated or deleted
    IF (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false) OR
       (TG_OP = 'DELETE' AND OLD.is_active = true) THEN
        
        -- Count remaining active members in the team
        SELECT COUNT(*) INTO remaining_members
        FROM tt_team_members
        WHERE team_id = OLD.team_id AND is_active = true;
        
        -- If no active members remain, deactivate the team
        IF remaining_members = 0 THEN
            UPDATE tt_teams 
            SET is_active = false, updated_at = NOW()
            WHERE id = OLD.team_id;
            
            -- Log the cleanup
            RAISE NOTICE 'Team % automatically deactivated - no active members remaining', OLD.team_id;
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 5. Create the trigger
DROP TRIGGER IF EXISTS trigger_cleanup_empty_tt_teams ON tt_team_members;
CREATE TRIGGER trigger_cleanup_empty_tt_teams
    AFTER UPDATE OF is_active OR DELETE
    ON tt_team_members
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_empty_tt_teams();

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION tt_verify_team_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION tt_can_join_team(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION tt_leave_team(UUID) TO authenticated;

-- 7. Test the functions exist
DO $$
BEGIN
    -- Test that all required functions exist
    PERFORM 1 FROM pg_proc WHERE proname = 'tt_verify_team_password';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tt_verify_team_password function not found';
    END IF;
    
    PERFORM 1 FROM pg_proc WHERE proname = 'tt_can_join_team';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tt_can_join_team function not found';
    END IF;
    
    PERFORM 1 FROM pg_proc WHERE proname = 'tt_leave_team';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tt_leave_team function not found';
    END IF;
    
    RAISE NOTICE 'All Triple Threat RPC functions are now available!';
END;
$$;
