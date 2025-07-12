SELECT 
  MAX(player_name) as player_name
  ,game_mode
  ,CEIL(SUM(elo_rating * total_games)::DECIMAL(10,4) / NULLIF(SUM(total_games), 0) * 100) / 100 AS elo_rating
  ,MAX(elo_confidence) AS elo_confidence
  ,MAX(elo_peak) AS elo_peak
  ,SUM(total_games) AS total_games
  ,SUM(total_wins) AS total_wins
  ,SUM(total_losses) AS total_losses
  ,CEIL(SUM(total_wins)::DECIMAL(10,2) / NULLIF(SUM(total_games), 0) * 100) / 100 AS win_rate
  ,CEIL(SUM(kill_death_ratio * total_games)::DECIMAL(10,2) / NULLIF(SUM(total_games), 0) * 100) / 100 AS kill_death_ratio
  ,MAX(last_game_date) AS last_game_date
  ,CEIL(SUM(weighted_elo * total_games)::DECIMAL(10,2) / NULLIF(SUM(total_games), 0) * 100) / 100 AS weighted_elo
FROM elo_leaderboard
where game_mode = 'OvD'
and lower(player_name) = 'bes'
GROUP BY LOWER(player_name), game_mode
ORDER BY weighted_elo DESC;