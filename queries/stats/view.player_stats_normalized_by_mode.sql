CREATE VIEW player_stats_normalized_by_mode AS
WITH normalized AS (
  SELECT
    LOWER(player_name) AS player_name_normalized,
    *
  FROM player_aggregate_stats
),
latest_names AS (
  SELECT DISTINCT ON (player_name_normalized, game_mode)
    player_name_normalized,
    game_mode,
    player_name AS latest_cased_name
  FROM normalized
  ORDER BY player_name_normalized, game_mode, last_game_date DESC
),
aggregated AS (
  SELECT
    player_name_normalized,
    game_mode,
    SUM(total_games) AS total_games,
    SUM(total_wins) AS total_wins,
    SUM(total_losses) AS total_losses,
    SUM(total_kills) AS total_kills,
    SUM(total_deaths) AS total_deaths,
    SUM(total_captures) AS total_captures,
    SUM(total_carrier_kills) AS total_carrier_kills,
    SUM(total_carry_time_seconds) AS total_carry_time_seconds,
    SUM(total_class_swaps) AS total_class_swaps,
    SUM(total_turret_damage) AS total_turret_damage,
    SUM(total_eb_hits) AS total_eb_hits,
    AVG(avg_kills_per_game::float) AS avg_kills_per_game,
    AVG(avg_deaths_per_game::float) AS avg_deaths_per_game,
    AVG(avg_captures_per_game::float) AS avg_captures_per_game,
    AVG(avg_accuracy::float) AS avg_accuracy,
    AVG(avg_resource_unused_per_death::float) AS avg_resource_unused_per_death,
    AVG(avg_explosive_unused_per_death::float) AS avg_explosive_unused_per_death,
    AVG(kill_death_ratio::float) AS kill_death_ratio,
    AVG(win_rate::float) AS win_rate,
    AVG(elo_rating::float) AS elo_rating,
    AVG(elo_confidence::float) AS elo_confidence,
    MAX(elo_peak::float) AS elo_peak,
    MAX(last_game_date) AS last_game_date,
    AVG(season_influence::float) AS season_influence
  FROM normalized
  GROUP BY player_name_normalized, game_mode
)
SELECT
  l.latest_cased_name AS player_name,
  a.player_name_normalized,
  a.game_mode,
  a.total_games,
  a.total_wins,
  a.total_losses,
  a.total_kills,
  a.total_deaths,
  a.total_captures,
  a.total_carrier_kills,
  a.total_carry_time_seconds,
  a.total_class_swaps,
  a.total_turret_damage,
  a.total_eb_hits,
  a.avg_kills_per_game,
  a.avg_deaths_per_game,
  a.avg_captures_per_game,
  a.avg_accuracy,
  a.avg_resource_unused_per_death,
  a.avg_explosive_unused_per_death,
  a.kill_death_ratio,
  a.win_rate,
  a.elo_rating,
  a.elo_confidence,
  a.elo_peak,
  a.last_game_date,
  a.season_influence
FROM aggregated a
JOIN latest_names l
  ON l.player_name_normalized = a.player_name_normalized
 AND l.game_mode = a.game_mode;