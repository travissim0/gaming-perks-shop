-- Leaderboard views the /stats page needs. LOCAL ONLY - never apply to production, which already
-- has its own (richer) versions of these.
--
-- /stats was returning HTTP 500 because the leaderboard API selects from
-- `player_stats_normalized_by_mode_all_aliases`, which the minimal local schema did not have.
--
-- Column names below are not invented - they are exactly what
-- src/app/api/player-stats/leaderboard/route.ts sorts and filters on:
--   sortable : total_kills, total_deaths, total_captures, total_games, kill_death_ratio, win_rate,
--              avg_kills_per_game, avg_deaths_per_game, avg_captures_per_game, total_eb_hits,
--              total_turret_damage, last_game_date, player_name
--   filters  : game_mode (equals 'Combined' when no mode is chosen), total_games >= minGames,
--              last_game_date >= cutoff, player_name / all_aliases ILIKE search
--
-- The 'Combined' rollup matters: with no mode selected the route asks for game_mode='Combined'
-- specifically, so a view that only carries OvD/Mix/Pub renders an empty leaderboard rather than
-- an error, which is a far more confusing failure.
--
-- Alias folding is NOT reproduced. Production maps a player's alternate identities together via
-- profile_aliases; locally `all_aliases` is just the player name so the ILIKE search still works.

DROP VIEW IF EXISTS player_stats_normalized_by_mode_all_aliases;
DROP VIEW IF EXISTS player_stats_normalized_by_mode;

CREATE VIEW player_stats_normalized_by_mode AS
WITH per_mode AS (
    SELECT player_name, game_mode, season, kills, deaths, captures, eb_hits, turret_damage,
           result, game_date
    FROM player_stats
    UNION ALL
    -- Every row a second time under 'Combined', which is what the page requests by default.
    SELECT player_name, 'Combined', season, kills, deaths, captures, eb_hits, turret_damage,
           result, game_date
    FROM player_stats
)
SELECT
    player_name,
    game_mode,
    season,
    count(*)::int                                                   AS total_games,
    sum(kills)::int                                                 AS total_kills,
    sum(deaths)::int                                                AS total_deaths,
    sum(captures)::int                                              AS total_captures,
    sum(eb_hits)::int                                               AS total_eb_hits,
    sum(turret_damage)::int                                         AS total_turret_damage,
    sum((result = 'Win')::int)::int                                 AS total_wins,
    -- Guard every divisor: a player with zero deaths is normal and must not blow up the view.
    round(sum(kills)::numeric / NULLIF(sum(deaths), 0), 2)          AS kill_death_ratio,
    round(100.0 * sum((result = 'Win')::int) / NULLIF(count(*), 0), 1) AS win_rate,
    round(sum(kills)::numeric    / NULLIF(count(*), 0), 2)          AS avg_kills_per_game,
    round(sum(deaths)::numeric   / NULLIF(count(*), 0), 2)          AS avg_deaths_per_game,
    round(sum(captures)::numeric / NULLIF(count(*), 0), 2)          AS avg_captures_per_game,
    max(game_date)                                                  AS last_game_date
FROM per_mode
GROUP BY player_name, game_mode, season;

CREATE VIEW player_stats_normalized_by_mode_all_aliases AS
SELECT v.*, v.player_name AS all_aliases
FROM player_stats_normalized_by_mode v;
