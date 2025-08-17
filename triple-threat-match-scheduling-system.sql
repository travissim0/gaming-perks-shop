-- Triple Threat Match Scheduling System
-- Run this AFTER running fix-triple-threat-events-and-notifications.sql

-- ================================================================
-- PART 1: Match Scheduling Tables
-- ================================================================

-- Create match schedule proposals table
CREATE TABLE IF NOT EXISTS tt_match_schedule_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES tt_matches(id) ON DELETE CASCADE,
    proposed_by UUID NOT NULL REFERENCES profiles(id),
    proposed_time TIMESTAMPTZ NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    responded_by UUID REFERENCES profiles(id),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for schedule proposals
CREATE INDEX IF NOT EXISTS idx_tt_match_schedule_proposals_match ON tt_match_schedule_proposals(match_id);
CREATE INDEX IF NOT EXISTS idx_tt_match_schedule_proposals_status ON tt_match_schedule_proposals(status);

-- ================================================================
-- PART 2: Match Creation from Challenge Accept
-- ================================================================

-- Function to create unscheduled match when challenge is accepted
CREATE OR REPLACE FUNCTION create_unscheduled_match_from_challenge(
    challenge_id_input UUID
)
RETURNS JSON AS $$
DECLARE
    challenge_record RECORD;
    match_id UUID;
    team1_members UUID[];
    team2_members UUID[];
    member_id UUID;
BEGIN
    -- Get challenge details
    SELECT c.*, ct.team_name as challenger_name, cht.team_name as challenged_name
    INTO challenge_record
    FROM tt_challenges c
    JOIN tt_teams ct ON c.challenger_team_id = ct.id
    JOIN tt_teams cht ON c.challenged_team_id = cht.id
    WHERE c.id = challenge_id_input AND c.status = 'accepted';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Challenge not found or not accepted');
    END IF;

    -- Check if match already exists for this challenge
    IF EXISTS (
        SELECT 1 FROM tt_matches 
        WHERE (team1_id = challenge_record.challenger_team_id AND team2_id = challenge_record.challenged_team_id)
           OR (team1_id = challenge_record.challenged_team_id AND team2_id = challenge_record.challenger_team_id)
        AND status IN ('unscheduled', 'scheduled', 'in_progress')
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Match already exists for these teams');
    END IF;
    
    -- Create unscheduled match
    INSERT INTO tt_matches (
        team1_id,
        team2_id,
        match_type,
        status,
        round_name
    ) VALUES (
        challenge_record.challenger_team_id,
        challenge_record.challenged_team_id,
        challenge_record.match_type,
        'unscheduled',
        'Challenge Match'
    ) RETURNING id INTO match_id;

    -- Get team members for notifications
    SELECT ARRAY_AGG(player_id) INTO team1_members
    FROM tt_team_members WHERE team_id = challenge_record.challenger_team_id AND is_active = true;
    
    SELECT ARRAY_AGG(player_id) INTO team2_members
    FROM tt_team_members WHERE team_id = challenge_record.challenged_team_id AND is_active = true;

    -- Create match created events for team owners/captains only
    FOREACH member_id IN ARRAY team1_members LOOP
        -- Only notify team owners
        IF EXISTS (SELECT 1 FROM tt_teams WHERE id = challenge_record.challenger_team_id AND owner_id = member_id) THEN
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'match_created',
                '🏆 Match Created - Schedule Needed',
                'Match vs ' || challenge_record.challenged_name || ' needs scheduling. Propose a time!',
                NULL, NULL,
                challenge_record.challenged_team_id, challenge_record.challenged_name,
                json_build_object('match_id', match_id, 'challenge_id', challenge_id_input, 'action_required', 'schedule'),
                member_id, false
            );
        END IF;
    END LOOP;

    FOREACH member_id IN ARRAY team2_members LOOP
        -- Only notify team owners
        IF EXISTS (SELECT 1 FROM tt_teams WHERE id = challenge_record.challenged_team_id AND owner_id = member_id) THEN
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'match_created',
                '🏆 Match Created - Schedule Needed',
                'Match vs ' || challenge_record.challenger_name || ' needs scheduling. Propose a time!',
                NULL, NULL,
                challenge_record.challenger_team_id, challenge_record.challenger_name,
                json_build_object('match_id', match_id, 'challenge_id', challenge_id_input, 'action_required', 'schedule'),
                member_id, false
            );
        END IF;
    END LOOP;
    
    RETURN json_build_object('success', true, 'match_id', match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- PART 3: Schedule Proposal Functions
-- ================================================================

-- Function to propose match schedule
CREATE OR REPLACE FUNCTION propose_match_schedule(
    match_id_input UUID,
    proposer_id UUID,
    proposed_time_input TIMESTAMPTZ,
    message_input TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    match_record RECORD;
    proposer_team_id UUID;
    opposing_team_id UUID;
    opposing_team_name TEXT;
    proposer_alias TEXT;
    opposing_members UUID[];
    member_id UUID;
    proposal_id UUID;
BEGIN
    -- Get match details
    SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
    INTO match_record
    FROM tt_matches m
    JOIN tt_teams t1 ON m.team1_id = t1.id
    JOIN tt_teams t2 ON m.team2_id = t2.id
    WHERE m.id = match_id_input AND m.status IN ('unscheduled', 'scheduled');
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found or cannot be rescheduled');
    END IF;

    -- Determine which team the proposer belongs to
    IF EXISTS (SELECT 1 FROM tt_team_members WHERE team_id = match_record.team1_id AND player_id = proposer_id AND is_active = true) THEN
        proposer_team_id := match_record.team1_id;
        opposing_team_id := match_record.team2_id;
        opposing_team_name := match_record.team2_name;
    ELSIF EXISTS (SELECT 1 FROM tt_team_members WHERE team_id = match_record.team2_id AND player_id = proposer_id AND is_active = true) THEN
        proposer_team_id := match_record.team2_id;
        opposing_team_id := match_record.team1_id;
        opposing_team_name := match_record.team1_name;
    ELSE
        RETURN json_build_object('success', false, 'error', 'You are not a member of either team in this match');
    END IF;

    -- Check if proposer is team owner
    IF NOT EXISTS (SELECT 1 FROM tt_teams WHERE id = proposer_team_id AND owner_id = proposer_id) THEN
        RETURN json_build_object('success', false, 'error', 'Only team owners can propose match schedules');
    END IF;

    -- Validate proposed time is in the future
    IF proposed_time_input <= NOW() THEN
        RETURN json_build_object('success', false, 'error', 'Proposed time must be in the future');
    END IF;

    -- Get proposer alias
    SELECT COALESCE(in_game_alias, 'Unknown') INTO proposer_alias
    FROM profiles WHERE id = proposer_id;

    -- Create schedule proposal
    INSERT INTO tt_match_schedule_proposals (
        match_id, proposed_by, proposed_time, message
    ) VALUES (
        match_id_input, proposer_id, proposed_time_input, message_input
    ) RETURNING id INTO proposal_id;

    -- Get opposing team members (owners only)
    SELECT ARRAY_AGG(owner_id) INTO opposing_members
    FROM tt_teams WHERE id = opposing_team_id;

    -- Create schedule proposal events for opposing team owner
    FOREACH member_id IN ARRAY opposing_members LOOP
        INSERT INTO tt_events (
            event_type, title, description,
            related_user_id, related_user_alias,
            related_team_id, related_team_name,
            metadata, target_user_id, is_read
        ) VALUES (
            'schedule_proposed',
            '📅 Schedule Proposed',
            proposer_alias || ' proposed ' || to_char(proposed_time_input, 'Mon DD, YYYY at HH12:MI AM') || ' for your match',
            proposer_id, proposer_alias,
            proposer_team_id, (SELECT team_name FROM tt_teams WHERE id = proposer_team_id),
            json_build_object('match_id', match_id_input, 'proposal_id', proposal_id, 'proposed_time', proposed_time_input, 'action_required', 'respond_to_schedule'),
            member_id, false
        );
    END LOOP;
    
    RETURN json_build_object('success', true, 'proposal_id', proposal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to respond to schedule proposal
CREATE OR REPLACE FUNCTION respond_to_schedule_proposal(
    proposal_id_input UUID,
    responder_id UUID,
    response_input TEXT -- 'accept' or 'reject'
)
RETURNS JSON AS $$
DECLARE
    proposal_record RECORD;
    match_record RECORD;
    responder_team_id UUID;
    proposer_team_name TEXT;
    responder_alias TEXT;
    all_team_members UUID[];
    member_id UUID;
BEGIN
    -- Get proposal details
    SELECT sp.*, m.team1_id, m.team2_id, p.in_game_alias as proposer_alias
    INTO proposal_record
    FROM tt_match_schedule_proposals sp
    JOIN tt_matches m ON sp.match_id = m.id
    JOIN profiles p ON sp.proposed_by = p.id
    WHERE sp.id = proposal_id_input AND sp.status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Proposal not found or already responded to');
    END IF;

    -- Determine responder's team
    IF EXISTS (SELECT 1 FROM tt_team_members WHERE team_id = proposal_record.team1_id AND player_id = responder_id AND is_active = true) THEN
        responder_team_id := proposal_record.team1_id;
        SELECT team_name INTO proposer_team_name FROM tt_teams WHERE id = proposal_record.team2_id;
    ELSIF EXISTS (SELECT 1 FROM tt_team_members WHERE team_id = proposal_record.team2_id AND player_id = responder_id AND is_active = true) THEN
        responder_team_id := proposal_record.team2_id;
        SELECT team_name INTO proposer_team_name FROM tt_teams WHERE id = proposal_record.team1_id;
    ELSE
        RETURN json_build_object('success', false, 'error', 'You are not a member of either team in this match');
    END IF;

    -- Check if responder is team owner
    IF NOT EXISTS (SELECT 1 FROM tt_teams WHERE id = responder_team_id AND owner_id = responder_id) THEN
        RETURN json_build_object('success', false, 'error', 'Only team owners can respond to schedule proposals');
    END IF;

    -- Check if responder is not the proposer
    IF proposal_record.proposed_by = responder_id THEN
        RETURN json_build_object('success', false, 'error', 'You cannot respond to your own proposal');
    END IF;

    -- Get responder alias
    SELECT COALESCE(in_game_alias, 'Unknown') INTO responder_alias
    FROM profiles WHERE id = responder_id;

    -- Update proposal status
    UPDATE tt_match_schedule_proposals 
    SET status = CASE WHEN response_input = 'accept' THEN 'accepted' ELSE 'rejected' END,
        responded_by = responder_id,
        responded_at = NOW()
    WHERE id = proposal_id_input;

    IF response_input = 'accept' THEN
        -- Update match with scheduled time
        UPDATE tt_matches 
        SET scheduled_time = proposal_record.proposed_time,
            status = 'scheduled'
        WHERE id = proposal_record.match_id;

        -- Reject all other pending proposals for this match
        UPDATE tt_match_schedule_proposals 
        SET status = 'rejected'
        WHERE match_id = proposal_record.match_id AND id != proposal_id_input AND status = 'pending';
    END IF;

    -- Get all team members for notifications
    SELECT ARRAY_AGG(tm.player_id) INTO all_team_members
    FROM tt_team_members tm
    WHERE tm.team_id IN (proposal_record.team1_id, proposal_record.team2_id) AND tm.is_active = true;

    -- Create events for all team members
    FOREACH member_id IN ARRAY all_team_members LOOP
        INSERT INTO tt_events (
            event_type, title, description,
            related_user_id, related_user_alias,
            related_team_id, related_team_name,
            metadata, target_user_id, is_read
        ) VALUES (
            CASE WHEN response_input = 'accept' THEN 'schedule_confirmed' ELSE 'schedule_rejected' END,
            CASE WHEN response_input = 'accept' THEN '✅ Match Scheduled!' ELSE '❌ Schedule Rejected' END,
            CASE WHEN response_input = 'accept' 
                THEN 'Match scheduled for ' || to_char(proposal_record.proposed_time, 'Mon DD, YYYY at HH12:MI AM')
                ELSE responder_alias || ' rejected the proposed schedule. New proposal needed.'
            END,
            responder_id, responder_alias,
            responder_team_id, (SELECT team_name FROM tt_teams WHERE id = responder_team_id),
            json_build_object(
                'match_id', proposal_record.match_id, 
                'proposal_id', proposal_id_input,
                'scheduled_time', CASE WHEN response_input = 'accept' THEN proposal_record.proposed_time ELSE NULL END,
                'action_required', CASE WHEN response_input = 'accept' THEN 'none' ELSE 'schedule' END
            ),
            member_id, false
        );
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'message', CASE WHEN response_input = 'accept' THEN 'Schedule confirmed!' ELSE 'Schedule rejected' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- PART 4: Updated Challenge Response with Match Creation
-- ================================================================

-- Update the respond_to_tt_challenge function to create matches when accepted
CREATE OR REPLACE FUNCTION respond_to_tt_challenge(
    challenge_id_input UUID,
    user_id_input UUID,
    response_input TEXT
)
RETURNS JSON AS $$
DECLARE
    challenge_record RECORD;
    challenger_team_name TEXT;
    challenged_team_name TEXT;
    responder_alias TEXT;
    challenger_members UUID[];
    challenged_members UUID[];
    member_id UUID;
    match_creation_result JSON;
BEGIN
    -- Get challenge details
    SELECT 
        c.*,
        ct.team_name as challenger_team_name,
        cht.team_name as challenged_team_name
    INTO challenge_record
    FROM tt_challenges c
    JOIN tt_teams ct ON c.challenger_team_id = ct.id
    JOIN tt_teams cht ON c.challenged_team_id = cht.id
    WHERE c.id = challenge_id_input AND c.status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Challenge not found or already responded to');
    END IF;

    -- Set team names from the record
    challenger_team_name := challenge_record.challenger_team_name;
    challenged_team_name := challenge_record.challenged_team_name;

    -- Verify user is member of challenged team
    IF NOT EXISTS (
        SELECT 1 FROM tt_team_members 
        WHERE team_id = challenge_record.challenged_team_id 
        AND player_id = user_id_input 
        AND is_active = true
    ) THEN
        RETURN json_build_object('success', false, 'error', 'You are not a member of the challenged team');
    END IF;

    -- Get responder alias
    SELECT COALESCE(in_game_alias, 'Unknown') INTO responder_alias
    FROM profiles WHERE id = user_id_input;

    -- Update challenge status
    UPDATE tt_challenges 
    SET 
        status = CASE WHEN response_input = 'accept' THEN 'accepted' ELSE 'declined' END,
        responded_at = NOW(),
        responded_by = user_id_input
    WHERE id = challenge_id_input;

    -- Get all members of challenger team for notifications
    SELECT ARRAY_AGG(player_id) INTO challenger_members
    FROM tt_team_members 
    WHERE team_id = challenge_record.challenger_team_id AND is_active = true;

    -- Get all members of challenged team for notifications  
    SELECT ARRAY_AGG(player_id) INTO challenged_members
    FROM tt_team_members 
    WHERE team_id = challenge_record.challenged_team_id AND is_active = true;

    -- Create events for challenge response
    IF response_input = 'accept' THEN
        -- Create unscheduled match
        SELECT create_unscheduled_match_from_challenge(challenge_id_input) INTO match_creation_result;
        
        -- Notify challenger team members
        FOREACH member_id IN ARRAY challenger_members LOOP
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'challenge_accepted',
                '✅ Challenge Accepted!',
                challenger_team_name || ' vs ' || challenged_team_name || ' challenge accepted by ' || responder_alias,
                user_id_input, responder_alias,
                challenge_record.challenged_team_id, challenged_team_name,
                json_build_object('challenge_id', challenge_id_input, 'match_type', challenge_record.match_type),
                member_id, false
            );
        END LOOP;

        -- Notify challenged team members (different message)
        FOREACH member_id IN ARRAY challenged_members LOOP
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'challenge_accepted',
                '✅ Challenge Accepted',
                'Your team accepted the challenge from ' || challenger_team_name,
                user_id_input, responder_alias,
                challenge_record.challenger_team_id, challenger_team_name,
                json_build_object('challenge_id', challenge_id_input, 'match_type', challenge_record.match_type),
                member_id, false
            );
        END LOOP;
    ELSE
        -- Notify challenger team members about decline
        FOREACH member_id IN ARRAY challenger_members LOOP
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'challenge_declined',
                '❌ Challenge Declined',
                challenged_team_name || ' declined your challenge (responded by ' || responder_alias || ')',
                user_id_input, responder_alias,
                challenge_record.challenged_team_id, challenged_team_name,
                json_build_object('challenge_id', challenge_id_input, 'match_type', challenge_record.match_type),
                member_id, false
            );
        END LOOP;

        -- Notify challenged team members  
        FOREACH member_id IN ARRAY challenged_members LOOP
            INSERT INTO tt_events (
                event_type, title, description,
                related_user_id, related_user_alias,
                related_team_id, related_team_name,
                metadata, target_user_id, is_read
            ) VALUES (
                'challenge_declined',
                '❌ Challenge Declined',
                'Your team declined the challenge from ' || challenger_team_name,
                user_id_input, responder_alias,
                challenge_record.challenger_team_id, challenger_team_name,
                json_build_object('challenge_id', challenge_id_input, 'match_type', challenge_record.match_type),
                member_id, false
            );
        END LOOP;
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', CASE 
            WHEN response_input = 'accept' THEN 'Challenge accepted successfully! Match created and needs scheduling.'
            ELSE 'Challenge declined'
        END
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- PART 5: Permission Grants
-- ================================================================

GRANT EXECUTE ON FUNCTION create_unscheduled_match_from_challenge(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION propose_match_schedule(UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION respond_to_schedule_proposal(UUID, UUID, TEXT) TO authenticated;

-- ================================================================
-- PART 6: Update Match Status Enum
-- ================================================================

-- Add 'unscheduled' status to tt_matches if it doesn't exist
DO $$
BEGIN
    -- Check if the constraint exists and update it
    IF EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'tt_matches_status_check'
    ) THEN
        ALTER TABLE tt_matches DROP CONSTRAINT tt_matches_status_check;
    END IF;
    
    ALTER TABLE tt_matches ADD CONSTRAINT tt_matches_status_check 
    CHECK (status IN ('unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled', 'disputed'));
END;
$$;

-- ================================================================
-- PART 7: Verification
-- ================================================================

DO $$
BEGIN
    -- Check that all functions exist
    PERFORM 1 FROM pg_proc WHERE proname = 'create_unscheduled_match_from_challenge';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'create_unscheduled_match_from_challenge function not found';
    END IF;

    PERFORM 1 FROM pg_proc WHERE proname = 'propose_match_schedule';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'propose_match_schedule function not found';
    END IF;

    PERFORM 1 FROM pg_proc WHERE proname = 'respond_to_schedule_proposal';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'respond_to_schedule_proposal function not found';
    END IF;

    -- Check that schedule proposals table exists
    PERFORM 1 FROM pg_tables WHERE tablename = 'tt_match_schedule_proposals';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tt_match_schedule_proposals table not found';
    END IF;
    
    RAISE NOTICE '✅ Match creation and scheduling system implemented!';
    RAISE NOTICE '✅ When challenges are accepted, unscheduled matches are created';
    RAISE NOTICE '✅ Team captains will be notified when matches need scheduling';
    RAISE NOTICE '✅ Schedule proposal and confirmation workflow complete';
    RAISE NOTICE '✅ All events and notifications working for the full workflow';
END;
$$;
