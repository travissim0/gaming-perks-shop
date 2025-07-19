-- Function to rename/renumber a season across all related tables
  CREATE OR REPLACE FUNCTION renumber_ctfpl_season(
      p_old_season_number INTEGER,
      p_new_season_number INTEGER,
      p_new_season_name TEXT DEFAULT NULL
  )
  RETURNS TABLE(
      table_name TEXT,
      records_updated INTEGER,
      status TEXT
  ) AS $$
  DECLARE
      v_standings_count INTEGER;
      v_seasons_count INTEGER;
      v_conflict_check INTEGER;
  BEGIN
      -- Check if old season exists
      SELECT COUNT(*) INTO v_standings_count
      FROM ctfpl_standings
      WHERE season_number = p_old_season_number;

      SELECT COUNT(*) INTO v_seasons_count
      FROM ctfpl_seasons
      WHERE season_number = p_old_season_number;

      -- Check if new season number already exists
      SELECT COUNT(*) INTO v_conflict_check
      FROM ctfpl_standings
      WHERE season_number = p_new_season_number;

      -- Validation checks
      IF v_standings_count = 0 AND v_seasons_count = 0 THEN
          table_name := 'ERROR';
          records_updated := 0;
          status := 'Old season ' || p_old_season_number || '
  does not exist';
          RETURN NEXT;
          RETURN;
      END IF;

      IF v_conflict_check > 0 THEN
          table_name := 'ERROR';
          records_updated := 0;
          status := 'New season ' || p_new_season_number || '
  already exists. Use merge function instead.';
          RETURN NEXT;
          RETURN;
      END IF;

      IF p_old_season_number = p_new_season_number THEN
          table_name := 'ERROR';
          records_updated := 0;
          status := 'Old and new season numbers are the same';        
          RETURN NEXT;
          RETURN;
      END IF;

      -- Update ctfpl_standings table
      UPDATE ctfpl_standings
      SET season_number = p_new_season_number,
          updated_at = NOW()
      WHERE season_number = p_old_season_number;

      GET DIAGNOSTICS v_standings_count = ROW_COUNT;

      table_name := 'ctfpl_standings';
      records_updated := v_standings_count;
      status := 'Successfully updated';
      RETURN NEXT;

      -- Update ctfpl_seasons table
      UPDATE ctfpl_seasons
      SET season_number = p_new_season_number,
          season_name = COALESCE(p_new_season_name, season_name),     
          updated_at = NOW()
      WHERE season_number = p_old_season_number;

      GET DIAGNOSTICS v_seasons_count = ROW_COUNT;

      table_name := 'ctfpl_seasons';
      records_updated := v_seasons_count;
      status := 'Successfully updated';
      RETURN NEXT;

      -- Summary
      table_name := 'SUMMARY';
      records_updated := v_standings_count + v_seasons_count;
      status := 'Season ' || p_old_season_number || ' renamed to      
  ' || p_new_season_number ||
                '. Total records updated: ' || (v_standings_count     
   + v_seasons_count);
      RETURN NEXT;

      RETURN;
  END;
  $$ LANGUAGE plpgsql;