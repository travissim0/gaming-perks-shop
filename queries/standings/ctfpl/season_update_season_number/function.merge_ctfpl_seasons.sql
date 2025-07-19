-- Function to merge two seasons (if you accidentally create duplicates)
  CREATE OR REPLACE FUNCTION merge_ctfpl_seasons(
      p_source_season INTEGER,
      p_target_season INTEGER,
      p_merge_strategy TEXT DEFAULT 'ADD_STATS' -- 'ADD_STATS' or     
   'REPLACE_STATS'
  )
  RETURNS TABLE(
      operation TEXT,
      squad_id UUID,
      squad_name TEXT,
      old_stats TEXT,
      new_stats TEXT
  ) AS $$
  DECLARE
      v_source_record RECORD;
      v_target_record RECORD;
  BEGIN
      -- Validate seasons exist
      IF NOT EXISTS (SELECT 1 FROM ctfpl_standings WHERE
  season_number = p_source_season) THEN
          operation := 'ERROR';
          squad_id := NULL;
          squad_name := 'Source season ' || p_source_season || '      
  does not exist';
          old_stats := '';
          new_stats := '';
          RETURN NEXT;
          RETURN;
      END IF;

      -- Process each squad in source season
      FOR v_source_record IN
          SELECT cs.*, sq.name as squad_name
          FROM ctfpl_standings cs
          JOIN squads sq ON sq.id = cs.squad_id
          WHERE cs.season_number = p_source_season
      LOOP
          -- Check if squad exists in target season
          SELECT * INTO v_target_record
          FROM ctfpl_standings
          WHERE season_number = p_target_season
            AND squad_id = v_source_record.squad_id;

          IF FOUND THEN
              -- Squad exists in both seasons - merge based on strategy
              IF p_merge_strategy = 'ADD_STATS' THEN
                  -- Add stats together
                  UPDATE ctfpl_standings
                  SET
                      matches_played = matches_played +
  v_source_record.matches_played,
                      wins = wins + v_source_record.wins,
                      losses = losses + v_source_record.losses,       
                      no_shows = no_shows +
  v_source_record.no_shows,
                      overtime_wins = overtime_wins +
  v_source_record.overtime_wins,
                      overtime_losses = overtime_losses +
  v_source_record.overtime_losses,
                      points = points + v_source_record.points,       
                      kills_for = kills_for +
  v_source_record.kills_for,
                      deaths_against = deaths_against +
  v_source_record.deaths_against,
                      updated_at = NOW()
                  WHERE season_number = p_target_season
                    AND squad_id = v_source_record.squad_id;

                  operation := 'MERGED_ADDED';
              ELSE
                  -- Replace with source stats
                  UPDATE ctfpl_standings
                  SET
                      matches_played =
  v_source_record.matches_played,
                      wins = v_source_record.wins,
                      losses = v_source_record.losses,
                      no_shows = v_source_record.no_shows,
                      overtime_wins =
  v_source_record.overtime_wins,
                      overtime_losses =
  v_source_record.overtime_losses,
                      points = v_source_record.points,
                      kills_for = v_source_record.kills_for,
                      deaths_against =
  v_source_record.deaths_against,
                      updated_at = NOW()
                  WHERE season_number = p_target_season
                    AND squad_id = v_source_record.squad_id;

                  operation := 'MERGED_REPLACED';
              END IF;

              old_stats := 'MP:' ||
  v_target_record.matches_played || ' P:' ||
  v_target_record.points;
          ELSE
              -- Squad doesn't exist in target - move it
              UPDATE ctfpl_standings
              SET season_number = p_target_season,
                  updated_at = NOW()
              WHERE season_number = p_source_season
                AND squad_id = v_source_record.squad_id;

              operation := 'MOVED';
              old_stats := 'Not in target season';
          END IF;

          squad_id := v_source_record.squad_id;
          squad_name := v_source_record.squad_name;
          new_stats := 'MP:' || v_source_record.matches_played ||     
   ' P:' || v_source_record.points;
          RETURN NEXT;
      END LOOP;

      -- Delete source season record if it exists
      DELETE FROM ctfpl_seasons WHERE season_number =
  p_source_season;

      RETURN;
  END;
  $$ LANGUAGE plpgsql;