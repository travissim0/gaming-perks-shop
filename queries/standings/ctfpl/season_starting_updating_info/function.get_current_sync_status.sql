 -- Function to get current sync status
  CREATE OR REPLACE FUNCTION
  get_ctfpl_sync_status(p_season_number INTEGER DEFAULT 2024)
  RETURNS TABLE(
      status_type TEXT,
      count INTEGER,
      details TEXT
  ) AS $$
  BEGIN
      -- Count active squads not in standings
      RETURN QUERY
      SELECT
          'missing_from_standings'::TEXT,
          COUNT(*)::INTEGER,
          'Active squads not yet in standings table'::TEXT
      FROM squads s
      WHERE s.is_active = true
        AND s.is_legacy = false
        AND NOT EXISTS (
            SELECT 1 FROM ctfpl_standings cs
            WHERE cs.squad_id = s.id AND cs.season_number =
  p_season_number
        );

      -- Count standings entries for inactive squads
      RETURN QUERY
      SELECT
          'inactive_in_standings'::TEXT,
          COUNT(*)::INTEGER,
          'Inactive/legacy squads still in standings table'::TEXT     
      FROM ctfpl_standings cs
      LEFT JOIN squads s ON s.id = cs.squad_id
      WHERE cs.season_number = p_season_number
        AND (s.id IS NULL OR s.is_active = false OR s.is_legacy =     
   true);

      -- Count squads with actual stats (non-zero)
      RETURN QUERY
      SELECT
          'squads_with_stats'::TEXT,
          COUNT(*)::INTEGER,
          'Squads that have played matches (non-zero
  stats)'::TEXT
      FROM ctfpl_standings cs
      WHERE cs.season_number = p_season_number
        AND (cs.matches_played > 0 OR cs.points > 0);

      -- Count total standings entries
      RETURN QUERY
      SELECT
          'total_in_standings'::TEXT,
          COUNT(*)::INTEGER,
          'Total squads currently in standings table'::TEXT
      FROM ctfpl_standings cs
      WHERE cs.season_number = p_season_number;

      RETURN;
  END;
  $$ LANGUAGE plpgsql;