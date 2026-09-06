-- One-off repair for games recorded by zone script <= v1.2.0 (2026-09-06, before the roll-up fix).
-- The roll-up climbed one wrapper too far: LAW -> "-Doom-" (event item), LMG -> "Exosuit LMG's"
-- (vehicle gun). v1.2.1 stops at the weapon the killer carries, so new games are correct.

-- 1) kill events
UPDATE usl_mix_kill_events SET root_weapon_id = 1004, root_weapon_name = 'LAW'
WHERE root_weapon_name = '-Doom-';

UPDATE usl_mix_kill_events SET root_weapon_id = 3114, root_weapon_name = 'Light Machinegun'
WHERE root_weapon_name = 'Exosuit LMG''s';

-- 2) per-player weapon maps: fold key 3301 into 1004 (LAW) and 3001 into 3114 (Light Machinegun),
--    summing counts if the player already had the target key
CREATE OR REPLACE FUNCTION usl_mix_fold_weapon_key(m JSONB, from_key TEXT, to_key TEXT, to_name TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN m ? from_key THEN
    (m - from_key) || jsonb_build_object(to_key, jsonb_build_object(
        'name', to_name,
        'count', COALESCE((m -> from_key ->> 'count')::int, 0) + COALESCE((m -> to_key ->> 'count')::int, 0)))
  ELSE m END
$$;

UPDATE usl_mix_game_players SET
  weapon_kills  = usl_mix_fold_weapon_key(usl_mix_fold_weapon_key(weapon_kills,  '3301', '1004', 'LAW'), '3001', '3114', 'Light Machinegun'),
  weapon_deaths = usl_mix_fold_weapon_key(usl_mix_fold_weapon_key(weapon_deaths, '3301', '1004', 'LAW'), '3001', '3114', 'Light Machinegun')
WHERE weapon_kills ? '3301' OR weapon_kills ? '3001' OR weapon_deaths ? '3301' OR weapon_deaths ? '3001';
