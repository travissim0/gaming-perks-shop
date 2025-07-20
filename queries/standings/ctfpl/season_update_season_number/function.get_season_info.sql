 -- Function to get season information before renumbering
  CREATE OR REPLACE FUNCTION get_season_info(p_season_number
  INTEGER)
  RETURNS TABLE(
      table_name TEXT,
      record_count INTEGER,
      details TEXT
  ) AS $$
  BEGIN
      -- Check ctfpl_standings
      RETURN QUERY
      SELECT
          'ctfpl_standings'::TEXT,
          COUNT(*)::INTEGER,
          'Standings records for season ' || p_season_number
      FROM ctfpl_standings
      WHERE season_number = p_season_number;

      -- Check ctfpl_seasons
      RETURN QUERY
      SELECT
          'ctfpl_seasons'::TEXT,
          COUNT(*)::INTEGER,
          COALESCE('Season name: ' || season_name, 'No season
  record found')
      FROM ctfpl_seasons
      WHERE season_number = p_season_number;

      -- Check for squads with stats
      RETURN QUERY
      SELECT
          'squads_with_stats'::TEXT,
          COUNT(*)::INTEGER,
          'Squads that have played matches'
      FROM ctfpl_standings
      WHERE season_number = p_season_number
        AND (matches_played > 0 OR points > 0);

      RETURN;
  END;
  $$ LANGUAGE plpgsql;