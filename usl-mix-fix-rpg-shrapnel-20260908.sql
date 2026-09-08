-- USL Mix: repair weapon attribution rows recorded by zone script <= v1.4.1 (2026-09-08).
--
-- 1. "GL Bouncy -- Main" (item 1114) is not something a Demolitions carries. RPG shrapnel (1127) is
--    shared between the RPG's explosion wrapper and the Grenadier's bouncing GL, and when a shrapnel
--    piece (not the rocket) was the nearest explosion to the death, the script climbed the GL branch.
--    Script v1.5.0 ranks parents by the killer's inventory and recent blasts along the whole chain.
--    Here: re-point those kills at the RPG Launcher (un-suffixed id 3108; the site shows T/C/plain
--    launchers as one "RPG Launcher" anyway) and merge the per-player weapon maps.
-- 2. "Dart Heal" (1158, the Stim Gun's dart) has zero damage in every damage type, so it cannot
--    kill. Script v1.5.0 no longer considers non-lethal projectiles. The one stored kill keeps its
--    kill credit but loses the weapon (attribution -> unknown).

-- 1a. kill events
UPDATE usl_mix_kill_events
SET root_weapon_id = 3108, root_weapon_name = 'RPG Launcher'
WHERE root_weapon_id = 1114 AND weapon_id = 1127;

-- 1b. per-player weapon_kills: move the "1114" bucket into "3108"
UPDATE usl_mix_game_players p
SET weapon_kills = (p.weapon_kills - '1114') || jsonb_build_object(
        '3108', jsonb_build_object(
            'name', 'RPG Launcher',
            'count', COALESCE((p.weapon_kills -> '3108' ->> 'count')::int, 0) + COALESCE((p.weapon_kills -> '1114' ->> 'count')::int, 0)))
WHERE p.weapon_kills ? '1114';

-- 1c. per-player weapon_deaths, same merge
UPDATE usl_mix_game_players p
SET weapon_deaths = (p.weapon_deaths - '1114') || jsonb_build_object(
        '3108', jsonb_build_object(
            'name', 'RPG Launcher',
            'count', COALESCE((p.weapon_deaths -> '3108' ->> 'count')::int, 0) + COALESCE((p.weapon_deaths -> '1114' ->> 'count')::int, 0)))
WHERE p.weapon_deaths ? '1114';

-- 2a. the Stim Gun "kill": keep the kill, drop the weapon
UPDATE usl_mix_kill_events
SET weapon_id = NULL, weapon_name = NULL, root_weapon_id = NULL, root_weapon_name = NULL, attribution = 'unknown'
WHERE weapon_id = 1158;

-- 2b. and its per-player buckets (3085 = Stim Gun)
UPDATE usl_mix_game_players SET weapon_kills  = weapon_kills  - '3085' WHERE weapon_kills  ? '3085';
UPDATE usl_mix_game_players SET weapon_deaths = weapon_deaths - '3085' WHERE weapon_deaths ? '3085';

-- check: should return no rows
SELECT id, killer, victim, weapon_name, root_weapon_name FROM usl_mix_kill_events WHERE root_weapon_id IN (1114, 3085);
