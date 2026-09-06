-- USL Mix: opening kills / fights (Travis, 2026-09-06)
-- A fight is a run of enemy kills each within 60s of the previous one; the first kill of a
-- fight is the opening kill. The site computes this at ingest from now on; this file adds the
-- columns, extends the career view, and backfills every game already stored.

-- 1. Columns
ALTER TABLE usl_mix_kill_events
    ADD COLUMN IF NOT EXISTS fight_no   INT,
    ADD COLUMN IF NOT EXISTS is_opening BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE usl_mix_game_players
    ADD COLUMN IF NOT EXISTS opening_kills      INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS opening_deaths     INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS opening_fights_won INT NOT NULL DEFAULT 0;

-- 2. Career view gains the three totals (appended, so CREATE OR REPLACE is allowed)
CREATE OR REPLACE VIEW usl_mix_v_player_career AS
SELECT
    p.alias_key,
    MAX(p.alias)                                              AS alias,
    COUNT(*)                                                  AS games,
    COUNT(*) FILTER (WHERE p.result = 'win')                  AS wins,
    COUNT(*) FILTER (WHERE p.result = 'loss')                 AS losses,
    COUNT(*) FILTER (WHERE p.result = 'draw')                 AS draws,
    COUNT(*) FILTER (WHERE g.game_kind = 'mix')               AS mix_games,
    SUM(p.kills)                                              AS kills,
    SUM(p.deaths)                                             AS deaths,
    SUM(p.team_kills)                                         AS team_kills,
    SUM(p.shots_fired)                                        AS shots_fired,
    SUM(p.shots_landed)                                       AS shots_landed,
    SUM(p.bio_dart_hits)                                      AS bio_dart_hits,
    SUM(p.heal_amount)                                        AS heal_amount,
    SUM(p.play_seconds)                                       AS play_seconds,
    MAX(g.ended_at)                                           AS last_game_at,
    SUM(p.opening_kills)                                      AS opening_kills,
    SUM(p.opening_deaths)                                     AS opening_deaths,
    SUM(p.opening_fights_won)                                 AS opening_fights_won
FROM usl_mix_game_players p
JOIN usl_mix_games g ON g.id = p.game_id
WHERE g.game_kind IN ('mix', 'pub')
GROUP BY 1;

-- 3. Backfill: tag enemy kills with fight number + opening flag (60000 ms lull)
WITH enemy AS (
    SELECT id, game_id, t_ms,
           t_ms - LAG(t_ms) OVER (PARTITION BY game_id ORDER BY t_ms, id) AS gap
    FROM usl_mix_kill_events
    WHERE killer IS NOT NULL AND NOT team_kill
), marked AS (
    SELECT id, game_id, t_ms, (gap IS NULL OR gap >= 60000) AS is_opening FROM enemy
), numbered AS (
    SELECT id, is_opening,
           SUM(CASE WHEN is_opening THEN 1 ELSE 0 END) OVER (PARTITION BY game_id ORDER BY t_ms, id ROWS UNBOUNDED PRECEDING) AS fight_no
    FROM marked
)
UPDATE usl_mix_kill_events e
SET fight_no = n.fight_no, is_opening = n.is_opening
FROM numbered n
WHERE n.id = e.id;

-- team kills and killer-less deaths join whatever fight was running, never open one
UPDATE usl_mix_kill_events e
SET is_opening = false,
    fight_no = (
        SELECT k.fight_no FROM usl_mix_kill_events k
        WHERE k.game_id = e.game_id AND k.killer IS NOT NULL AND NOT k.team_kill
          AND k.t_ms <= e.t_ms AND e.t_ms - k.t_ms < 60000
        ORDER BY k.t_ms DESC, k.id DESC LIMIT 1
    )
WHERE e.killer IS NULL OR e.team_kill;

-- 4. Backfill per-player counters (fight winner = side with more kills in that fight)
WITH fw AS (
    SELECT game_id, fight_no,
           CASE WHEN COUNT(*) FILTER (WHERE killer_side = 'T') > COUNT(*) FILTER (WHERE killer_side = 'C') THEN 'T'
                WHEN COUNT(*) FILTER (WHERE killer_side = 'C') > COUNT(*) FILTER (WHERE killer_side = 'T') THEN 'C'
           END AS winner_side
    FROM usl_mix_kill_events
    WHERE fight_no IS NOT NULL AND killer IS NOT NULL AND NOT team_kill
    GROUP BY 1, 2
)
UPDATE usl_mix_game_players p
SET opening_kills = (
        SELECT COUNT(*) FROM usl_mix_kill_events e
        WHERE e.game_id = p.game_id AND e.killer_key = p.alias_key AND e.is_opening),
    opening_deaths = (
        SELECT COUNT(*) FROM usl_mix_kill_events e
        WHERE e.game_id = p.game_id AND e.victim_key = p.alias_key AND e.is_opening),
    opening_fights_won = (
        SELECT COUNT(*) FROM usl_mix_kill_events e
        JOIN fw ON fw.game_id = e.game_id AND fw.fight_no = e.fight_no
        WHERE e.game_id = p.game_id AND e.killer_key = p.alias_key AND e.is_opening
          AND fw.winner_side IS NOT NULL AND fw.winner_side = e.killer_side);

-- 5. Sanity check: fights per game and who opened them
SELECT g.map_key, g.team_a_name, g.team_b_name,
       COUNT(*) FILTER (WHERE e.is_opening) AS fights,
       STRING_AGG(e.killer || ' (' || COALESCE(e.killer_side, '?') || ')', ', ' ORDER BY e.t_ms) FILTER (WHERE e.is_opening) AS openers
FROM usl_mix_games g JOIN usl_mix_kill_events e ON e.game_id = g.id
GROUP BY g.id, g.map_key, g.team_a_name, g.team_b_name
ORDER BY MAX(g.ended_at);
