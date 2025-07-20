INSERT INTO ctfpl_standings (
      season_number,
      squad_id,
      matches_played,
      wins,
      losses,
      no_shows,
      overtime_wins,
      overtime_losses,
      points,
      kills_for,
      deaths_against
  )
  SELECT
      2024 as season_number,  -- Current season
      s.id as squad_id,
      0 as matches_played,
      0 as wins,
      0 as losses,
      0 as no_shows,
      0 as overtime_wins,
      0 as overtime_losses,
      0 as points,
      0 as kills_for,
      0 as deaths_against
  FROM squads s
  WHERE s.is_active = true
    AND s.is_legacy = false
    AND NOT EXISTS (
        SELECT 1 FROM ctfpl_standings cs
        WHERE cs.squad_id = s.id
        AND cs.season_number = 2024
    )
  ON CONFLICT (season_number, squad_id) DO NOTHING;