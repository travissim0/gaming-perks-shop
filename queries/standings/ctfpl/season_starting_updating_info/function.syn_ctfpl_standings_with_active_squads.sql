 -- Function to sync standings table with current active squads
  CREATE OR REPLACE FUNCTION
  sync_ctfpl_standings_with_active_squads(
      p_season_number INTEGER DEFAULT 2024,
      p_preserve_stats BOOLEAN DEFAULT false
  )
  RETURNS TABLE(
      action TEXT,
      squad_id UUID,
      squad_name TEXT,
      squad_tag TEXT
  ) AS $$
  DECLARE
      v_record RECORD;
  BEGIN
      -- If preserve_stats is false, we'll reset ALL stats to 0       
      -- If preserve_stats is true, we'll only add new squads with 0 stats

      IF p_preserve_stats = false THEN
          -- RESET MODE: Delete all standings for this season and rebuild from scratch
          DELETE FROM ctfpl_standings WHERE season_number =
  p_season_number;

          -- Insert all currently active squads with 0 stats
          FOR v_record IN
              SELECT s.id, s.name, s.tag
              FROM squads s
              WHERE s.is_active = true AND s.is_legacy = false        
          LOOP
              INSERT INTO ctfpl_standings (
                  season_number, squad_id, matches_played, wins,      
  losses, no_shows,
                  overtime_wins, overtime_losses, points,
  kills_for, deaths_against
              ) VALUES (
                  p_season_number, v_record.id, 0, 0, 0, 0, 0, 0,     
   0, 0, 0
              );

              -- Return info about what was added
              action := 'RESET_AND_ADDED';
              squad_id := v_record.id;
              squad_name := v_record.name;
              squad_tag := v_record.tag;
              RETURN NEXT;
          END LOOP;

      ELSE
          -- SYNC MODE: Add new active squads, remove inactive ones, preserve existing stats

          -- Remove squads that are no longer active
          FOR v_record IN
              SELECT cs.squad_id, s.name, s.tag
              FROM ctfpl_standings cs
              LEFT JOIN squads s ON s.id = cs.squad_id
              WHERE cs.season_number = p_season_number
                AND (s.id IS NULL OR s.is_active = false OR
  s.is_legacy = true)
          LOOP
              DELETE FROM ctfpl_standings
              WHERE season_number = p_season_number AND squad_id      
  = v_record.squad_id;

              action := 'REMOVED';
              squad_id := v_record.squad_id;
              squad_name := v_record.name;
              squad_tag := v_record.tag;
              RETURN NEXT;
          END LOOP;

          -- Add new active squads that aren't in standings yet       
          FOR v_record IN
              SELECT s.id, s.name, s.tag
              FROM squads s
              WHERE s.is_active = true
                AND s.is_legacy = false
                AND NOT EXISTS (
                    SELECT 1 FROM ctfpl_standings cs
                    WHERE cs.squad_id = s.id AND cs.season_number     
   = p_season_number
                )
          LOOP
              INSERT INTO ctfpl_standings (
                  season_number, squad_id, matches_played, wins,      
  losses, no_shows,
                  overtime_wins, overtime_losses, points,
  kills_for, deaths_against
              ) VALUES (
                  p_season_number, v_record.id, 0, 0, 0, 0, 0, 0,     
   0, 0, 0
              );

              action := 'ADDED';
              squad_id := v_record.id;
              squad_name := v_record.name;
              squad_tag := v_record.tag;
              RETURN NEXT;
          END LOOP;
      END IF;

      RETURN;
  END;
  $$ LANGUAGE plpgsql;