-- Helper function to finalize a season and set winners
  CREATE OR REPLACE FUNCTION finalize_ctfpl_season(
      p_season_number INTEGER,
      p_season_name VARCHAR(100) DEFAULT NULL,
      p_end_date DATE DEFAULT CURRENT_DATE
  )
  RETURNS VOID AS $$
  DECLARE
      v_standings RECORD;
      v_champions UUID[] := '{}';
      v_runner_ups UUID[] := '{}';
      v_third_place UUID[] := '{}';
      v_first_place_points INTEGER;
      v_second_place_points INTEGER;
      v_third_place_points INTEGER;
  BEGIN
      -- Get the standings for this season
      FOR v_standings IN
          SELECT squad_id, points, rank
          FROM ctfpl_standings_with_rankings
          WHERE season_number = p_season_number
          ORDER BY rank
      LOOP
          -- Get point thresholds
          IF v_standings.rank = 1 THEN
              v_first_place_points := v_standings.points;
              v_champions := v_champions || v_standings.squad_id;     
          ELSIF v_standings.rank = 2 OR
                (v_first_place_points IS NOT NULL AND
  v_standings.points = v_first_place_points) THEN
              -- Handle ties for first place
              IF v_standings.points = v_first_place_points THEN       
                  v_champions := v_champions ||
  v_standings.squad_id;
              ELSE
                  v_second_place_points := v_standings.points;        
                  v_runner_ups := v_runner_ups ||
  v_standings.squad_id;
              END IF;
          ELSIF v_standings.rank = 3 OR
                (v_second_place_points IS NOT NULL AND
  v_standings.points = v_second_place_points) THEN
              -- Handle ties for second place
              IF v_standings.points = v_second_place_points THEN      
                  v_runner_ups := v_runner_ups ||
  v_standings.squad_id;
              ELSE
                  v_third_place_points := v_standings.points;
                  v_third_place := v_third_place ||
  v_standings.squad_id;
              END IF;
          ELSIF v_third_place_points IS NOT NULL AND
  v_standings.points = v_third_place_points THEN
              -- Handle ties for third place
              v_third_place := v_third_place ||
  v_standings.squad_id;
          END IF;
      END LOOP;

      -- Insert or update the season record
      INSERT INTO ctfpl_seasons (
          season_number,
          season_name,
          end_date,
          status,
          champion_squad_ids,
          runner_up_squad_ids,
          third_place_squad_ids,
          total_squads,
          total_matches
      )
      SELECT
          p_season_number,
          COALESCE(p_season_name, p_season_number || ' CTFPL
  Season'),
          p_end_date,
          'completed',
          v_champions,
          v_runner_ups,
          v_third_place,
          COUNT(DISTINCT cs.squad_id),
          SUM(cs.matches_played) / 2 -- Divide by 2 since each        
  match involves 2 teams
      FROM ctfpl_standings cs
      WHERE cs.season_number = p_season_number
      ON CONFLICT (season_number) DO UPDATE SET
          season_name = EXCLUDED.season_name,
          end_date = EXCLUDED.end_date,
          status = EXCLUDED.status,
          champion_squad_ids = EXCLUDED.champion_squad_ids,
          runner_up_squad_ids = EXCLUDED.runner_up_squad_ids,
          third_place_squad_ids = EXCLUDED.third_place_squad_ids,     
          total_squads = EXCLUDED.total_squads,
          total_matches = EXCLUDED.total_matches;
  END;
  $$ LANGUAGE plpgsql;