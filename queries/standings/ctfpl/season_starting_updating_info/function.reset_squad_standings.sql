-- Function to reset specific squad's stats to 0 (useful for individual corrections)
  CREATE OR REPLACE FUNCTION reset_squad_standings(
      p_season_number INTEGER,
      p_squad_id UUID
  )
  RETURNS BOOLEAN AS $$
  BEGIN
      UPDATE ctfpl_standings
      SET
          matches_played = 0,
          wins = 0,
          losses = 0,
          no_shows = 0,
          overtime_wins = 0,
          overtime_losses = 0,
          points = 0,
          kills_for = 0,
          deaths_against = 0,
          updated_at = NOW()
      WHERE season_number = p_season_number
        AND squad_id = p_squad_id;

      RETURN FOUND;
  END;
  $$ LANGUAGE plpgsql;