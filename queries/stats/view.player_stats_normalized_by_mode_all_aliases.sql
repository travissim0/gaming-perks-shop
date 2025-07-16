CREATE OR REPLACE VIEW player_stats_normalized_by_mode_all_aliases AS
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
    -- Primary profiles from profile_aliases
    profile_mapping AS (
      SELECT
        LOWER(alias) as player_name_normalized,
        profile_id,
        alias,
        is_primary,
        FIRST_VALUE(alias) OVER (
          PARTITION BY profile_id
          ORDER BY is_primary DESC, added_at ASC
        ) as primary_alias,
        FIRST_VALUE(LOWER(alias)) OVER (
          PARTITION BY profile_id
          ORDER BY is_primary DESC, added_at ASC
        ) as primary_normalized_name
      FROM profile_aliases
    ),
    -- Profiles without aliases
    profile_direct_mapping AS (
      SELECT
        LOWER(in_game_alias) as player_name_normalized,
        id as profile_id,
        in_game_alias as alias,
        true as is_primary,
        in_game_alias as primary_alias,
        LOWER(in_game_alias) as primary_normalized_name
      FROM profiles
      WHERE LOWER(in_game_alias) NOT IN (
        SELECT LOWER(alias) FROM profile_aliases
      )
    ),
    -- Combine profile sources
    all_profile_mapping AS (
      SELECT * FROM profile_mapping
      UNION ALL
      SELECT * FROM profile_direct_mapping
    ),
    -- Aliases aggregated by profile
    profile_aliases_aggregated AS (
      SELECT
        profile_id,
        STRING_AGG(alias, ', ' ORDER BY is_primary DESC, added_at ASC)       
  as all_aliases
      FROM profile_aliases
      GROUP BY profile_id
      UNION ALL
      SELECT
        id as profile_id,
        in_game_alias as all_aliases
      FROM profiles
      WHERE LOWER(in_game_alias) NOT IN (
        SELECT LOWER(alias) FROM profile_aliases
      )
    ),
    -- Create grouping keys
    grouped_names AS (
      SELECT
        n.player_name_normalized,
        n.game_mode,
        COALESCE(apm.primary_normalized_name, n.player_name_normalized)      
  as grouping_key,
        apm.profile_id,
        apm.primary_alias
      FROM normalized n
      LEFT JOIN all_profile_mapping apm ON apm.player_name_normalized =      
  n.player_name_normalized
      GROUP BY n.player_name_normalized, n.game_mode,
  apm.primary_normalized_name, apm.profile_id, apm.primary_alias
    ),
    -- Aggregate stats by profile (keeping individual game modes)
    aggregated_individual AS (
      SELECT
        gn.grouping_key,
        n.game_mode,
        gn.profile_id,
        gn.primary_alias,
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
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_kills_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_kills_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_deaths_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_deaths_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_captures_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS avg_captures_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_accuracy::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS avg_accuracy,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_resource_unused_per_death::float * total_games)     
   / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_resource_unused_per_death,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_explosive_unused_per_death::float *
  total_games) / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_explosive_unused_per_death,
        ROUND((
          CASE
            WHEN SUM(total_deaths) > 0
            THEN SUM(total_kills)::float / SUM(total_deaths)
            ELSE SUM(total_kills)::float
          END
        )::NUMERIC, 3) AS kill_death_ratio,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(total_wins)::float / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS win_rate,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(elo_rating::float * total_games) / SUM(total_games)     
            ELSE 0
          END
        )::NUMERIC, 2) AS elo_rating,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(elo_confidence::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS elo_confidence,
        MAX(elo_peak::float) AS elo_peak,
        MAX(last_game_date) AS last_game_date,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(season_influence::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS season_influence
      FROM normalized n
      JOIN grouped_names gn ON gn.player_name_normalized =
  n.player_name_normalized
        AND gn.game_mode = n.game_mode
      GROUP BY gn.grouping_key, n.game_mode, gn.profile_id,
  gn.primary_alias
    ),
    -- Aggregate stats by profile (combining OvD and Mix)
    aggregated_combined AS (
      SELECT
        gn.grouping_key,
        'Combined' as game_mode,
        gn.profile_id,
        gn.primary_alias,
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
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_kills_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_kills_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_deaths_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_deaths_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_captures_per_game::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS avg_captures_per_game,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_accuracy::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS avg_accuracy,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_resource_unused_per_death::float * total_games)     
   / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_resource_unused_per_death,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(avg_explosive_unused_per_death::float *
  total_games) / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS avg_explosive_unused_per_death,
        ROUND((
          CASE
            WHEN SUM(total_deaths) > 0
            THEN SUM(total_kills)::float / SUM(total_deaths)
            ELSE SUM(total_kills)::float
          END
        )::NUMERIC, 3) AS kill_death_ratio,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(total_wins)::float / SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 3) AS win_rate,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(elo_rating::float * total_games) / SUM(total_games)     
            ELSE 0
          END
        )::NUMERIC, 2) AS elo_rating,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(elo_confidence::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS elo_confidence,
        MAX(elo_peak::float) AS elo_peak,
        MAX(last_game_date) AS last_game_date,
        ROUND((
          CASE
            WHEN SUM(total_games) > 0
            THEN SUM(season_influence::float * total_games) /
  SUM(total_games)
            ELSE 0
          END
        )::NUMERIC, 2) AS season_influence
      FROM normalized n
      JOIN grouped_names gn ON gn.player_name_normalized =
  n.player_name_normalized
        AND gn.game_mode = n.game_mode
      WHERE n.game_mode IN ('OvD', 'Mix')
      GROUP BY gn.grouping_key, gn.profile_id, gn.primary_alias
    ),
    -- Combine both individual and combined aggregations
    all_aggregated AS (
      SELECT * FROM aggregated_individual
      UNION ALL
      SELECT * FROM aggregated_combined
    ),
    -- Get display names
    display_names AS (
      SELECT DISTINCT ON (grouping_key, game_mode)
        aa.grouping_key,
        aa.game_mode,
        COALESCE(aa.primary_alias, latest_cased_name) as display_name
      FROM all_aggregated aa
      LEFT JOIN grouped_names gn ON gn.grouping_key = aa.grouping_key        
      LEFT JOIN latest_names ln ON ln.player_name_normalized =
  aa.grouping_key
        AND (ln.game_mode = aa.game_mode OR aa.game_mode = 'Combined')       
      ORDER BY grouping_key, game_mode, aa.primary_alias IS NOT NULL DESC       
    )
    SELECT
      dn.display_name AS player_name,
      a.grouping_key AS player_name_normalized,
      a.profile_id,
      paa.all_aliases,
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
    FROM all_aggregated a
    JOIN display_names dn ON dn.grouping_key = a.grouping_key
      AND dn.game_mode = a.game_mode
    LEFT JOIN profile_aliases_aggregated paa ON paa.profile_id =
  a.profile_id
    ORDER BY a.grouping_key, a.game_mode;