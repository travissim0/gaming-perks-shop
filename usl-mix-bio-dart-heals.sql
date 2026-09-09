-- USL Mix: count bio dart healing in the class-stats view.
-- A landed bio dart heals a flat 30 hp (BioHeal, item 52, repairAmount 30 in usl_s57.itm). The zone
-- reports dart hits separately from heal_amount, so heal_per_game on /insights was under-reporting
-- every medic who darts instead of standing still with the MediKit. The site already adds them back
-- in everywhere it has both columns; this is the one aggregate that happens in SQL.
--
-- Column ORDER and names must match the existing view for CREATE OR REPLACE to work, so the new
-- bio_dart_hits column is appended at the end rather than slotted beside heal_amount.
CREATE OR REPLACE VIEW usl_mix_v_class_stats AS
SELECT
    COALESCE(g.map_key, 'unknown')                              AS map_key,
    g.game_kind,
    COALESCE(p.primary_class, 'Unknown')                        AS class_name,
    COUNT(*)                                                    AS appearances,
    COUNT(*) FILTER (WHERE p.result = 'win')                    AS wins,
    COUNT(*) FILTER (WHERE p.result = 'loss')                   AS losses,
    SUM(p.kills)                                                AS kills,
    SUM(p.deaths)                                               AS deaths,
    SUM(p.shots_fired)                                          AS shots_fired,
    SUM(p.shots_landed)                                         AS shots_landed,
    SUM(p.heal_amount) + 30 * SUM(COALESCE(p.bio_dart_hits, 0)) AS heal_amount,
    SUM(p.play_seconds)                                         AS play_seconds,
    SUM(COALESCE(p.bio_dart_hits, 0))                           AS bio_dart_hits
FROM usl_mix_game_players p
JOIN usl_mix_games g ON g.id = p.game_id
WHERE g.game_kind IN ('mix', 'pub')
GROUP BY 1, 2, 3;

GRANT SELECT ON usl_mix_v_class_stats TO anon, authenticated;
