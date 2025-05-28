-- Fix infinite recursion in squad_members RLS policies
-- Drop the problematic policies first
DROP POLICY IF EXISTS "Captains and co-captains can manage members" ON squad_members;
DROP POLICY IF EXISTS "Captains and co-captains can create invites" ON squad_invites;

-- Create simpler, non-recursive policies for squad_members
CREATE POLICY "Squad members can be inserted by service role" ON squad_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Squad members can be updated by captains" ON squad_members FOR UPDATE USING (
    auth.uid() = player_id OR 
    auth.uid() IN (
        SELECT captain_id FROM squads WHERE id = squad_members.squad_id
    )
);
CREATE POLICY "Squad members can be deleted by captains or themselves" ON squad_members FOR DELETE USING (
    auth.uid() = player_id OR 
    auth.uid() IN (
        SELECT captain_id FROM squads WHERE id = squad_members.squad_id
    )
);

-- Fix squad invites policy to avoid recursion
CREATE POLICY "Squad invites can be created by captains" ON squad_invites FOR INSERT WITH CHECK (
    auth.uid() IN (
        SELECT captain_id FROM squads WHERE id = squad_invites.squad_id
    )
);

-- Update squad invites view policy to be simpler
DROP POLICY IF EXISTS "Users can view their own invites" ON squad_invites;
CREATE POLICY "Users can view squad invites" ON squad_invites FOR SELECT USING (
    auth.uid() = invited_player_id OR 
    auth.uid() IN (
        SELECT captain_id FROM squads WHERE id = squad_invites.squad_id
    )
); 