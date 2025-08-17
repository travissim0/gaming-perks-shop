-- Create the missing tt_match_schedule_proposals table
-- Run this in your Supabase SQL Editor

-- ================================================================
-- Create tt_match_schedule_proposals table
-- ================================================================

CREATE TABLE IF NOT EXISTS tt_match_schedule_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES tt_matches(id) ON DELETE CASCADE,
    proposer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    responder_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    proposed_time TIMESTAMPTZ NOT NULL,
    message TEXT,
    response_message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    
    -- Constraints
    UNIQUE(match_id, proposer_id, status) -- Only one pending proposal per proposer per match
);

-- ================================================================
-- Enable RLS
-- ================================================================

ALTER TABLE tt_match_schedule_proposals ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- RLS Policies
-- ================================================================

-- Allow team members to view proposals for their matches
CREATE POLICY "Team members can view match schedule proposals" ON tt_match_schedule_proposals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tt_matches m
            JOIN tt_team_members tm1 ON m.team1_id = tm1.team_id
            JOIN tt_team_members tm2 ON m.team2_id = tm2.team_id
            WHERE m.id = match_id 
            AND (tm1.player_id = auth.uid() OR tm2.player_id = auth.uid())
            AND tm1.is_active = true AND tm2.is_active = true
        )
    );

-- Allow team owners to create proposals
CREATE POLICY "Team owners can create schedule proposals" ON tt_match_schedule_proposals
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tt_matches m
            JOIN tt_teams t1 ON m.team1_id = t1.id
            JOIN tt_teams t2 ON m.team2_id = t2.id
            WHERE m.id = match_id 
            AND (t1.owner_id = auth.uid() OR t2.owner_id = auth.uid())
        )
    );

-- Allow team owners to update proposals (for responses)
CREATE POLICY "Team owners can update schedule proposals" ON tt_match_schedule_proposals
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tt_matches m
            JOIN tt_teams t1 ON m.team1_id = t1.id
            JOIN tt_teams t2 ON m.team2_id = t2.id
            WHERE m.id = match_id 
            AND (t1.owner_id = auth.uid() OR t2.owner_id = auth.uid())
        )
    );

-- ================================================================
-- Grant permissions
-- ================================================================

GRANT ALL ON tt_match_schedule_proposals TO authenticated;

-- ================================================================
-- Verification
-- ================================================================

DO $$
BEGIN
    -- Check that table exists
    PERFORM 1 FROM information_schema.tables 
    WHERE table_name = 'tt_match_schedule_proposals';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tt_match_schedule_proposals table not found';
    END IF;
    
    RAISE NOTICE '✅ tt_match_schedule_proposals table created successfully!';
    RAISE NOTICE '✅ RLS policies applied';
    RAISE NOTICE '✅ Ready for schedule proposals';
END;
$$;
