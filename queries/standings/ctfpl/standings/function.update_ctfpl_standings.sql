  CREATE OR REPLACE FUNCTION update_ctfpl_standings(
      p_season_number INTEGER,
      p_team1_squad_id UUID,
      p_team2_squad_id UUID,
      p_team1_result TEXT, -- 'win', 'loss', 'no_show'
      p_team2_result TEXT, -- 'win', 'loss', 'no_show'
      p_team1_overtime BOOLEAN DEFAULT false,
      p_team2_overtime BOOLEAN DEFAULT false,
      p_team1_kills INTEGER DEFAULT 0,
      p_team2_kills INTEGER DEFAULT 0
  )
  RETURNS VOID AS $$
  DECLARE
      team1_points INTEGER;
      team2_points INTEGER;
      team1_wins INTEGER;
      team1_losses INTEGER;
      team1_no_shows INTEGER;
      team2_wins INTEGER;
      team2_losses INTEGER;
      team2_no_shows INTEGER;
      team1_ot_wins INTEGER;
      team1_ot_losses INTEGER;
      team2_ot_wins INTEGER;
      team2_ot_losses INTEGER;
  BEGIN
      -- Initialize counters
      team1_wins := 0; team1_losses := 0; team1_no_shows := 0;        
      team2_wins := 0; team2_losses := 0; team2_no_shows := 0;        
      team1_ot_wins := 0; team1_ot_losses := 0;
      team2_ot_wins := 0; team2_ot_losses := 0;

      -- Calculate Team 1 stats and points
      CASE p_team1_result
          WHEN 'win' THEN
              team1_points := 3;
              team1_wins := 1;
              IF p_team1_overtime THEN team1_ot_wins := 1; END        
  IF;
          WHEN 'loss' THEN
              team1_points := 1; -- Participation point
              team1_losses := 1;
              IF p_team1_overtime THEN team1_ot_losses := 1; END      
  IF;
          WHEN 'no_show' THEN
              team1_points := 0;
              team1_no_shows := 1;
      END CASE;

      -- Calculate Team 2 stats and points
      CASE p_team2_result
          WHEN 'win' THEN
              team2_points := 3;
              team2_wins := 1;
              IF p_team2_overtime THEN team2_ot_wins := 1; END        
  IF;
          WHEN 'loss' THEN
              team2_points := 1; -- Participation point
              team2_losses := 1;
              IF p_team2_overtime THEN team2_ot_losses := 1; END      
  IF;
          WHEN 'no_show' THEN
              team2_points := 0;
              team2_no_shows := 1;
      END CASE;

      -- Update Team 1 standings
      INSERT INTO ctfpl_standings (
          season_number, squad_id, matches_played, wins, losses,      
  no_shows,
          overtime_wins, overtime_losses, points, kills_for,
  deaths_against
      ) VALUES (
          p_season_number, p_team1_squad_id, 1, team1_wins,
  team1_losses, team1_no_shows,
          team1_ot_wins, team1_ot_losses, team1_points,
  p_team1_kills, p_team2_kills
      )
      ON CONFLICT (season_number, squad_id) DO UPDATE SET
          matches_played = ctfpl_standings.matches_played + 1,        
          wins = ctfpl_standings.wins + team1_wins,
          losses = ctfpl_standings.losses + team1_losses,
          no_shows = ctfpl_standings.no_shows + team1_no_shows,       
          overtime_wins = ctfpl_standings.overtime_wins +
  team1_ot_wins,
          overtime_losses = ctfpl_standings.overtime_losses +
  team1_ot_losses,
          points = ctfpl_standings.points + team1_points,
          kills_for = ctfpl_standings.kills_for + p_team1_kills,      
          deaths_against = ctfpl_standings.deaths_against +
  p_team2_kills;

      -- Update Team 2 standings
      INSERT INTO ctfpl_standings (
          season_number, squad_id, matches_played, wins, losses,      
  no_shows,
          overtime_wins, overtime_losses, points, kills_for,
  deaths_against
      ) VALUES (
          p_season_number, p_team2_squad_id, 1, team2_wins,
  team2_losses, team2_no_shows,
          team2_ot_wins, team2_ot_losses, team2_points,
  p_team2_kills, p_team1_kills
      )
      ON CONFLICT (season_number, squad_id) DO UPDATE SET
          matches_played = ctfpl_standings.matches_played + 1,        
          wins = ctfpl_standings.wins + team2_wins,
          losses = ctfpl_standings.losses + team2_losses,
          no_shows = ctfpl_standings.no_shows + team2_no_shows,       
          overtime_wins = ctfpl_standings.overtime_wins +
  team2_ot_wins,
          overtime_losses = ctfpl_standings.overtime_losses +
  team2_ot_losses,
          points = ctfpl_standings.points + team2_points,
          kills_for = ctfpl_standings.kills_for + p_team2_kills,      
          deaths_against = ctfpl_standings.deaths_against +
  p_team1_kills;
  END;
  $$ LANGUAGE plpgsql;