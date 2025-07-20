CREATE OR REPLACE VIEW ctfpl_standings_with_rankings AS
  SELECT
      s.*,
      sq.name as squad_name,
      sq.tag as squad_tag,
      sq.banner_url,
      p.in_game_alias as captain_alias,
      ROW_NUMBER() OVER (
          PARTITION BY s.season_number
          ORDER BY
              s.points DESC,                    -- Primary: Most points
              s.win_percentage DESC,            -- Tiebreaker 1: Win percentage
              s.regulation_wins DESC,           -- Tiebreaker 2: Regulation wins (non-OT)
              s.overtime_wins DESC,             -- Tiebreaker 3: Overtime wins
              s.kill_death_difference DESC,     -- Tiebreaker 4: Kill/Death difference
              s.wins DESC                       -- Tiebreaker 5: Total wins
      ) as rank,
      -- Calculate points behind leader
      (
          SELECT MAX(points)
          FROM ctfpl_standings s2
          WHERE s2.season_number = s.season_number
      ) - s.points as points_behind
  FROM ctfpl_standings s
  JOIN squads sq ON s.squad_id = sq.id
  LEFT JOIN profiles p ON sq.captain_id = p.id
  ORDER BY s.season_number, rank;