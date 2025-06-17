-- Create player_events table for tracking all player activities
CREATE TABLE IF NOT EXISTS player_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    description TEXT NOT NULL,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    related_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_events_player_id ON player_events(player_id);
CREATE INDEX IF NOT EXISTS idx_player_events_event_type ON player_events(event_type);
CREATE INDEX IF NOT EXISTS idx_player_events_created_at ON player_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_events_squad_id ON player_events(squad_id);
CREATE INDEX IF NOT EXISTS idx_player_events_related_player_id ON player_events(related_player_id);

-- Enable RLS
ALTER TABLE player_events ENABLE ROW LEVEL SECURITY;

-- Create policies for player_events
-- Anyone can read all events (public log)
CREATE POLICY "Anyone can read player events" ON player_events FOR SELECT USING (true);

-- Only authenticated users can insert events (system will handle this)
CREATE POLICY "Authenticated users can insert events" ON player_events FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

-- System admins can update/delete events
CREATE POLICY "Admins can update events" ON player_events FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can delete events" ON player_events FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- Create a function to log player events
CREATE OR REPLACE FUNCTION log_player_event(
    p_player_id UUID,
    p_event_type VARCHAR(50),
    p_description TEXT,
    p_event_data JSONB DEFAULT '{}',
    p_squad_id UUID DEFAULT NULL,
    p_related_player_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO player_events (
        player_id,
        event_type,
        description,
        event_data,
        squad_id,
        related_player_id
    ) VALUES (
        p_player_id,
        p_event_type,
        p_description,
        p_event_data,
        p_squad_id,
        p_related_player_id
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers to automatically log squad member changes
CREATE OR REPLACE FUNCTION handle_squad_member_events() RETURNS TRIGGER AS $$
DECLARE
    squad_name TEXT;
    player_alias TEXT;
    captain_alias TEXT;
BEGIN
    -- Get squad name and player alias
    SELECT s.name INTO squad_name FROM squads s WHERE s.id = COALESCE(NEW.squad_id, OLD.squad_id);
    
    IF TG_OP = 'INSERT' THEN
        -- Player joined squad
        SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = NEW.player_id;
        
        PERFORM log_player_event(
            NEW.player_id,
            'squad_joined',
            player_alias || ' joined squad ' || squad_name || ' as ' || NEW.role,
            jsonb_build_object('squad_name', squad_name, 'role', NEW.role),
            NEW.squad_id
        );
        
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Role change (promotion/demotion)
        IF OLD.role != NEW.role THEN
            SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = NEW.player_id;
            
            -- Check if it's a promotion or demotion
            IF (OLD.role = 'player' AND NEW.role IN ('co_captain', 'captain')) OR
               (OLD.role = 'co_captain' AND NEW.role = 'captain') THEN
                -- Promotion
                PERFORM log_player_event(
                    NEW.player_id,
                    'squad_promoted',
                    player_alias || ' was promoted from ' || OLD.role || ' to ' || NEW.role || ' in ' || squad_name,
                    jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role, 'new_role', NEW.role),
                    NEW.squad_id
                );
            ELSE
                -- Demotion
                PERFORM log_player_event(
                    NEW.player_id,
                    'squad_demoted',
                    player_alias || ' was demoted from ' || OLD.role || ' to ' || NEW.role || ' in ' || squad_name,
                    jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role, 'new_role', NEW.role),
                    NEW.squad_id
                );
            END IF;
        END IF;
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Player left/was kicked from squad
        SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = OLD.player_id;
        
        -- Check if it was a kick or voluntary leave by looking at the context
        -- For now, we'll log it as "left" - this can be enhanced with more context
        PERFORM log_player_event(
            OLD.player_id,
            'squad_left',
            player_alias || ' left squad ' || squad_name,
            jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role),
            OLD.squad_id
        );
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for squad member changes
DROP TRIGGER IF EXISTS squad_member_events_trigger ON squad_members;
CREATE TRIGGER squad_member_events_trigger
    AFTER INSERT OR UPDATE OR DELETE ON squad_members
    FOR EACH ROW EXECUTE FUNCTION handle_squad_member_events();

-- Function to handle squad ownership transfers
CREATE OR REPLACE FUNCTION log_squad_ownership_transfer(
    p_old_captain_id UUID,
    p_new_captain_id UUID,
    p_squad_id UUID
) RETURNS VOID AS $$
DECLARE
    squad_name TEXT;
    old_captain_alias TEXT;
    new_captain_alias TEXT;
BEGIN
    -- Get names
    SELECT s.name INTO squad_name FROM squads s WHERE s.id = p_squad_id;
    SELECT p.in_game_alias INTO old_captain_alias FROM profiles p WHERE p.id = p_old_captain_id;
    SELECT p.in_game_alias INTO new_captain_alias FROM profiles p WHERE p.id = p_new_captain_id;
    
    -- Log for old captain
    PERFORM log_player_event(
        p_old_captain_id,
        'squad_ownership_transferred',
        old_captain_alias || ' transferred ownership of ' || squad_name || ' to ' || new_captain_alias,
        jsonb_build_object('squad_name', squad_name, 'transferred_to', new_captain_alias, 'action', 'transferred_away'),
        p_squad_id,
        p_new_captain_id
    );
    
    -- Log for new captain
    PERFORM log_player_event(
        p_new_captain_id,
        'squad_ownership_transferred',
        new_captain_alias || ' received ownership of ' || squad_name || ' from ' || old_captain_alias,
        jsonb_build_object('squad_name', squad_name, 'received_from', old_captain_alias, 'action', 'received'),
        p_squad_id,
        p_old_captain_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log free agent activities
CREATE OR REPLACE FUNCTION log_free_agent_activity(
    p_player_id UUID,
    p_action VARCHAR(20), -- 'joined' or 'left'
    p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    player_alias TEXT;
    event_type VARCHAR(50);
    description TEXT;
BEGIN
    SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = p_player_id;
    
    IF p_action = 'joined' THEN
        event_type := 'free_agents_joined';
        description := player_alias || ' joined the free agents pool';
    ELSE
        event_type := 'free_agents_left';
        description := player_alias || ' left the free agents pool';
        IF p_reason IS NOT NULL THEN
            description := description || ' (' || p_reason || ')';
        END IF;
    END IF;
    
    PERFORM log_player_event(
        p_player_id,
        event_type,
        description,
        jsonb_build_object('action', p_action, 'reason', p_reason)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log match participation
CREATE OR REPLACE FUNCTION log_match_participation(
    p_player_id UUID,
    p_match_id UUID,
    p_result VARCHAR(10), -- 'win', 'loss', 'draw'
    p_score_data JSONB DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
    player_alias TEXT;
    match_info TEXT;
    description TEXT;
BEGIN
    SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = p_player_id;
    
    -- Get basic match info (you may need to adjust this based on your matches table structure)
    SELECT 'Match #' || m.id::TEXT INTO match_info FROM matches m WHERE m.id = p_match_id;
    
    description := player_alias || ' played in ' || match_info || ' (Result: ' || p_result || ')';
    
    PERFORM log_player_event(
        p_player_id,
        'match_played',
        description,
        jsonb_build_object('match_id', p_match_id, 'result', p_result, 'score_data', p_score_data)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add some sample events for testing (remove these in production)
-- INSERT INTO player_events (player_id, event_type, description, event_data)
-- SELECT 
--     p.id,
--     'squad_joined',
--     p.in_game_alias || ' joined squad Example Squad as player',
--     '{"squad_name": "Example Squad", "role": "player"}'::jsonb
-- FROM profiles p 
-- WHERE p.in_game_alias IS NOT NULL 
-- LIMIT 5;

-- Grant necessary permissions
GRANT SELECT, INSERT ON player_events TO authenticated;
GRANT EXECUTE ON FUNCTION log_player_event TO authenticated;
GRANT EXECUTE ON FUNCTION log_squad_ownership_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION log_free_agent_activity TO authenticated;
GRANT EXECUTE ON FUNCTION log_match_participation TO authenticated;

-- Create view for easier querying of events with related data
CREATE OR REPLACE VIEW player_events_with_details AS
SELECT 
    pe.*,
    p.in_game_alias as player_name,
    p.avatar_url as player_avatar,
    rp.in_game_alias as related_player_name,
    s.name as squad_name
FROM player_events pe
LEFT JOIN profiles p ON pe.player_id = p.id
LEFT JOIN profiles rp ON pe.related_player_id = rp.id
LEFT JOIN squads s ON pe.squad_id = s.id
ORDER BY pe.created_at DESC;

-- Grant access to the view
GRANT SELECT ON player_events_with_details TO authenticated;

COMMENT ON TABLE player_events IS 'Tracks all player activities across the platform';
COMMENT ON FUNCTION log_player_event IS 'Utility function to log player events with standardized format';
COMMENT ON FUNCTION handle_squad_member_events IS 'Trigger function to automatically log squad membership changes';
COMMENT ON FUNCTION log_squad_ownership_transfer IS 'Function to log squad ownership transfers';
COMMENT ON FUNCTION log_free_agent_activity IS 'Function to log free agent pool activities';
COMMENT ON FUNCTION log_match_participation IS 'Function to log match participation events'; 