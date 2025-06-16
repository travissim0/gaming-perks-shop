-- Add admin permissions for managing squad active status
-- The is_active column already exists, so we just need to add admin policies

-- Add admin policy for updating squads (including is_active status)
CREATE POLICY "Admins can update any squad" ON squads
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    );

-- Optional: Update the read policy to filter inactive squads for non-admins/non-captains
-- (Comment out if you want to keep showing all squads to everyone)
/*
DROP POLICY IF EXISTS "Allow all squad reads" ON squads;
DROP POLICY IF EXISTS "Squads are viewable by everyone" ON squads;

CREATE POLICY "Active squads and admin access" ON squads
    FOR SELECT USING (
        is_active = true
        OR auth.uid() = captain_id 
        OR auth.uid() IN (
            SELECT user_id FROM squad_members WHERE squad_id = squads.id
        )
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    );
*/ 