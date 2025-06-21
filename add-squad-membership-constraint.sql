-- Add constraint to prevent users from being in multiple non-legacy active squads
-- This will allow users to be in one legacy squad + one active squad, but not multiple active non-legacy squads

-- First, let's create a function to check squad membership constraints
CREATE OR REPLACE FUNCTION check_squad_membership_constraint()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if this is an active membership in a non-legacy squad
    IF NEW.status = 'active' THEN
        -- Check if the squad is non-legacy
        IF EXISTS (
            SELECT 1 FROM squads 
            WHERE id = NEW.squad_id 
            AND (is_legacy = false OR is_legacy IS NULL)
            AND is_active = true
        ) THEN
            -- Check if user already has an active membership in another non-legacy squad
            IF EXISTS (
                SELECT 1 
                FROM squad_members sm
                JOIN squads s ON sm.squad_id = s.id
                WHERE sm.player_id = NEW.player_id
                AND sm.status = 'active'
                AND sm.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
                AND (s.is_legacy = false OR s.is_legacy IS NULL)
                AND s.is_active = true
            ) THEN
                RAISE EXCEPTION 'Player cannot be in multiple active non-legacy squads. Please leave current squad first.';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS squad_membership_constraint_trigger ON squad_members;
CREATE TRIGGER squad_membership_constraint_trigger
    BEFORE INSERT OR UPDATE ON squad_members
    FOR EACH ROW
    EXECUTE FUNCTION check_squad_membership_constraint();

-- Test the constraint (this should work - legacy squad)
-- This is just a comment showing how it would work:
-- INSERT INTO squad_members (player_id, squad_id, status, role) 
-- VALUES ('user-id', 'legacy-squad-id', 'active', 'player');

-- Test the constraint (this should fail if user already in non-legacy squad)
-- This is just a comment showing how it would fail:
-- INSERT INTO squad_members (player_id, squad_id, status, role) 
-- VALUES ('user-id', 'another-non-legacy-squad-id', 'active', 'player');

COMMENT ON FUNCTION check_squad_membership_constraint() IS 'Prevents users from being in multiple active non-legacy squads simultaneously';
COMMENT ON TRIGGER squad_membership_constraint_trigger ON squad_members IS 'Enforces single active non-legacy squad membership per player'; 