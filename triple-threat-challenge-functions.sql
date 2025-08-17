-- Triple Threat Challenge System Functions

-- First, let's add the tt_challenges table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tt_challenges (
  id uuid not null default gen_random_uuid (),
  challenger_team_id uuid not null,
  challenged_team_id uuid not null,
  created_by uuid not null,
  message text null,
  match_type text null default 'friendly'::text,
  status text null default 'pending'::text,
  created_at timestamp with time zone null default now(),
  expires_at timestamp with time zone null default (now() + '7 days'::interval),
  responded_at timestamp with time zone null,
  responded_by uuid null,
  constraint tt_challenges_pkey primary key (id),
  constraint tt_challenges_unique_pending unique (challenger_team_id, challenged_team_id, status) deferrable,
  constraint tt_challenges_created_by_fkey foreign KEY (created_by) references profiles (id) on delete CASCADE,
  constraint tt_challenges_challenged_team_id_fkey foreign KEY (challenged_team_id) references tt_teams (id) on delete CASCADE,
  constraint tt_challenges_challenger_team_id_fkey foreign KEY (challenger_team_id) references tt_teams (id) on delete CASCADE,
  constraint tt_challenges_responded_by_fkey foreign KEY (responded_by) references profiles (id),
  constraint tt_challenges_different_teams check ((challenger_team_id <> challenged_team_id)),
  constraint tt_challenges_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'accepted'::text,
          'declined'::text,
          'cancelled'::text,
          'expired'::text
        ]
      )
    )
  ),
  constraint tt_challenges_match_type_check check (
    (
      match_type = any (
        array[
          'friendly'::text,
          'ranked'::text,
          'tournament'::text
        ]
      )
    )
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tt_challenges_challenger ON public.tt_challenges USING btree (challenger_team_id);
CREATE INDEX IF NOT EXISTS idx_tt_challenges_challenged ON public.tt_challenges USING btree (challenged_team_id);
CREATE INDEX IF NOT EXISTS idx_tt_challenges_status ON public.tt_challenges USING btree (status);
CREATE INDEX IF NOT EXISTS idx_tt_challenges_created_at ON public.tt_challenges USING btree (created_at);

-- RPC function to respond to challenge
CREATE OR REPLACE FUNCTION respond_to_tt_challenge(
    challenge_id_input UUID,
    user_id_input UUID,
    response_input TEXT
)
RETURNS JSON AS $$
DECLARE
    challenge_record RECORD;
    user_team_id UUID;
    result JSON;
BEGIN
    -- Get the challenge details
    SELECT * INTO challenge_record
    FROM tt_challenges
    WHERE id = challenge_id_input AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Challenge not found or already responded to');
    END IF;
    
    -- Check if the user is a member of the challenged team
    SELECT tm.team_id INTO user_team_id
    FROM tt_team_members tm
    WHERE tm.player_id = user_id_input AND tm.team_id = challenge_record.challenged_team_id AND tm.is_active = true;
    
    IF user_team_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'You are not a member of the challenged team');
    END IF;
    
    -- Update the challenge
    UPDATE tt_challenges
    SET 
        status = response_input,
        responded_at = NOW(),
        responded_by = user_id_input
    WHERE id = challenge_id_input;
    
    -- If accepted, we could create a match record here (future feature)
    -- For now, just return success
    
    result := json_build_object(
        'success', true,
        'challenge_id', challenge_id_input,
        'status', response_input,
        'message', CASE 
            WHEN response_input = 'accepted' THEN 'Challenge accepted successfully!'
            WHEN response_input = 'declined' THEN 'Challenge declined'
            ELSE 'Challenge updated'
        END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to create a challenge
CREATE OR REPLACE FUNCTION create_tt_challenge(
    challenger_team_id_input UUID,
    challenged_team_id_input UUID,
    created_by_input UUID,
    message_input TEXT DEFAULT NULL,
    match_type_input TEXT DEFAULT 'friendly'
)
RETURNS JSON AS $$
DECLARE
    challenge_id UUID;
    result JSON;
BEGIN
    -- Check if challenger is member of challenger team
    IF NOT EXISTS (
        SELECT 1 FROM tt_team_members 
        WHERE team_id = challenger_team_id_input AND player_id = created_by_input AND is_active = true
    ) THEN
        RETURN json_build_object('success', false, 'error', 'You are not a member of the challenger team');
    END IF;
    
    -- Check for existing pending challenge between these teams
    IF EXISTS (
        SELECT 1 FROM tt_challenges 
        WHERE challenger_team_id = challenger_team_id_input 
        AND challenged_team_id = challenged_team_id_input 
        AND status = 'pending'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'A pending challenge already exists between these teams');
    END IF;
    
    -- Create the challenge
    INSERT INTO tt_challenges (
        challenger_team_id,
        challenged_team_id,
        created_by,
        message,
        match_type
    ) VALUES (
        challenger_team_id_input,
        challenged_team_id_input,
        created_by_input,
        message_input,
        match_type_input
    ) RETURNING id INTO challenge_id;
    
    result := json_build_object(
        'success', true,
        'challenge_id', challenge_id,
        'message', 'Challenge created successfully!'
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to get team challenges
CREATE OR REPLACE FUNCTION get_tt_team_challenges(team_id_input UUID)
RETURNS TABLE (
    id UUID,
    challenger_team_id UUID,
    challenged_team_id UUID,
    challenger_team_name TEXT,
    challenged_team_name TEXT,
    created_by UUID,
    creator_alias TEXT,
    message TEXT,
    match_type TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    responded_by UUID,
    responder_alias TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.challenger_team_id,
        c.challenged_team_id,
        ct.team_name as challenger_team_name,
        cht.team_name as challenged_team_name,
        c.created_by,
        cp.in_game_alias as creator_alias,
        c.message,
        c.match_type,
        c.status,
        c.created_at,
        c.expires_at,
        c.responded_at,
        c.responded_by,
        rp.in_game_alias as responder_alias
    FROM tt_challenges c
    LEFT JOIN tt_teams ct ON c.challenger_team_id = ct.id
    LEFT JOIN tt_teams cht ON c.challenged_team_id = cht.id
    LEFT JOIN profiles cp ON c.created_by = cp.id
    LEFT JOIN profiles rp ON c.responded_by = rp.id
    WHERE c.challenger_team_id = team_id_input OR c.challenged_team_id = team_id_input
    ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION respond_to_tt_challenge(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tt_challenge(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tt_team_challenges(UUID) TO authenticated;

-- Enable RLS on tt_challenges table
ALTER TABLE tt_challenges ENABLE ROW LEVEL SECURITY;

-- RLS policies for tt_challenges
CREATE POLICY "Users can view challenges involving their teams" ON tt_challenges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tt_team_members tm
            WHERE (tm.team_id = challenger_team_id OR tm.team_id = challenged_team_id)
            AND tm.player_id = auth.uid()
            AND tm.is_active = true
        )
    );

CREATE POLICY "Users can create challenges for their teams" ON tt_challenges
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tt_team_members tm
            WHERE tm.team_id = challenger_team_id
            AND tm.player_id = auth.uid()
            AND tm.is_active = true
        )
    );

CREATE POLICY "Users can update challenges for their teams" ON tt_challenges
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tt_team_members tm
            WHERE (tm.team_id = challenger_team_id OR tm.team_id = challenged_team_id)
            AND tm.player_id = auth.uid()
            AND tm.is_active = true
        )
    );
