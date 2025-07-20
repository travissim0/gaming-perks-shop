CREATE OR REPLACE FUNCTION handle_squad_member_events()
  RETURNS TRIGGER AS $$
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

      -- Use safe defaults for NULL values
      squad_name := COALESCE(squad_name, 'Unknown Squad');
      is_legacy_squad := COALESCE(is_legacy_squad, false);

      -- Determine squad type for display
      squad_type := CASE WHEN is_legacy_squad THEN 'legacy squad' ELSE 'squad'     
   END;

      IF TG_OP = 'INSERT' THEN
          -- Player joined squad
          SELECT COALESCE(p.in_game_alias, p.email, 'Unknown Player')
          INTO player_alias
          FROM profiles p
          WHERE p.id = NEW.player_id;

          PERFORM log_player_event(
              NEW.player_id,
              'squad_joined',
              COALESCE(player_alias, 'Unknown Player') || ' joined ' ||
  squad_type || ' ' || squad_name || ' as ' || COALESCE(NEW.role, 'player'),       
              jsonb_build_object('squad_name', squad_name, 'role',
  COALESCE(NEW.role, 'player'), 'is_legacy', is_legacy_squad),
              NEW.squad_id
          );

          RETURN NEW;

      ELSIF TG_OP = 'UPDATE' THEN
          -- Role change (promotion/demotion)
          IF COALESCE(OLD.role, '') != COALESCE(NEW.role, '') THEN
              SELECT COALESCE(p.in_game_alias, p.email, 'Unknown Player')
              INTO player_alias
              FROM profiles p
              WHERE p.id = NEW.player_id;

              -- Check if it's a promotion or demotion
              IF (COALESCE(OLD.role, 'player') = 'player' AND
  COALESCE(NEW.role, 'player') IN ('co_captain', 'captain')) OR
                 (COALESCE(OLD.role, 'player') = 'co_captain' AND
  COALESCE(NEW.role, 'player') = 'captain') THEN
                  -- Promotion
                  PERFORM log_player_event(
                      NEW.player_id,
                      'squad_promoted',
                      COALESCE(player_alias, 'Unknown Player') || ' was
  promoted from ' || COALESCE(OLD.role, 'player') || ' to ' ||
  COALESCE(NEW.role, 'player') || ' in ' || squad_type || ' ' || squad_name,       
                      jsonb_build_object('squad_name', squad_name,
  'previous_role', COALESCE(OLD.role, 'player'), 'new_role',
  COALESCE(NEW.role, 'player'), 'is_legacy', is_legacy_squad),
                      NEW.squad_id
                  );
              ELSE
                  -- Demotion
                  PERFORM log_player_event(
                      NEW.player_id,
                      'squad_demoted',
                      COALESCE(player_alias, 'Unknown Player') || ' was
  demoted from ' || COALESCE(OLD.role, 'player') || ' to ' ||
  COALESCE(NEW.role, 'player') || ' in ' || squad_type || ' ' || squad_name,       
                      jsonb_build_object('squad_name', squad_name,
  'previous_role', COALESCE(OLD.role, 'player'), 'new_role',
  COALESCE(NEW.role, 'player'), 'is_legacy', is_legacy_squad),
                      NEW.squad_id
                  );
              END IF;
          END IF;

          RETURN NEW;

      ELSIF TG_OP = 'DELETE' THEN
          -- Player left/was kicked from squad
          SELECT COALESCE(p.in_game_alias, p.email, 'Unknown Player')
          INTO player_alias
          FROM profiles p
          WHERE p.id = OLD.player_id;

          -- Check if it was a kick or voluntary leave by looking at the context
          -- For now, we'll log it as "left" - this can be enhanced with more context
          PERFORM log_player_event(
              OLD.player_id,
              'squad_left',
              COALESCE(player_alias, 'Unknown Player') || ' left ' ||
  squad_type || ' ' || squad_name,
              jsonb_build_object('squad_name', squad_name, 'previous_role',        
  COALESCE(OLD.role, 'player'), 'is_legacy', is_legacy_squad),
              OLD.squad_id
          );

          RETURN OLD;
      END IF;

      RETURN NULL;
  END;
  $$ LANGUAGE plpgsql;