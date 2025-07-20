CREATE OR REPLACE FUNCTION handle_squad_member_events()
DECLARE
    squad_name TEXT;
    player_alias TEXT;
    squad_type TEXT;
    is_legacy_squad BOOLEAN;
BEGIN
    -- Get squad name, player alias, and legacy status
    SELECT s.name, s.is_legacy INTO squad_name, is_legacy_squad 
    FROM squads s 
    WHERE s.id = COALESCE(NEW.squad_id, OLD.squad_id);
    
    -- Determine squad type for display
    squad_type := CASE WHEN is_legacy_squad THEN 'legacy squad' ELSE 'squad' END;
    
    IF TG_OP = 'INSERT' THEN
        -- Player joined squad
        SELECT p.in_game_alias INTO player_alias FROM profiles p WHERE p.id = NEW.player_id;
        
        PERFORM log_player_event(
            NEW.player_id,
            'squad_joined',
            player_alias || ' joined ' || squad_type || ' ' || squad_name || ' as ' || NEW.role,
            jsonb_build_object('squad_name', squad_name, 'role', NEW.role, 'is_legacy', is_legacy_squad),
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
                    player_alias || ' was promoted from ' || OLD.role || ' to ' || NEW.role || ' in ' || squad_type || ' ' || squad_name,
                    jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role, 'new_role', NEW.role, 'is_legacy', is_legacy_squad),
                    NEW.squad_id
                );
            ELSE
                -- Demotion
                PERFORM log_player_event(
                    NEW.player_id,
                    'squad_demoted',
                    player_alias || ' was demoted from ' || OLD.role || ' to ' || NEW.role || ' in ' || squad_type || ' ' || squad_name,
                    jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role, 'new_role', NEW.role, 'is_legacy', is_legacy_squad),
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
            player_alias || ' left ' || squad_type || ' ' || squad_name,
            jsonb_build_object('squad_name', squad_name, 'previous_role', OLD.role, 'is_legacy', is_legacy_squad),
            OLD.squad_id
        );
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
