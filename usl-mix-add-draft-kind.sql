-- USL Mix: allow game_kind = 'draft' (2026-10-12)
--
-- A draft-league match between established teams. The host types *startdraft in the zone and
-- every game that ends while it is on is posted as game_kind=draft. Recorded in full, never rated:
-- applyRatingsForGame / recomputeAllRatings only ever touch game_kind='mix'.
--
-- The aggregate views (side win rates, class/weapon stats, player career) keep filtering
-- game_kind IN ('mix', 'pub'), so draft games stay out of the Mix aggregates. The games list,
-- the single-game endpoint and leaders?kind=draft (via usl_mix_period_stats' p_kinds) see them.
--
-- Safe to re-run. Drops whichever CHECK on usl_mix_games mentions game_kind (the inline one from
-- create-usl-mix-stats-tables.sql is auto-named usl_mix_games_game_kind_check) and re-adds it.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.usl_mix_games'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%game_kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.usl_mix_games DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.usl_mix_games
  ADD CONSTRAINT usl_mix_games_game_kind_check
  CHECK (game_kind IN ('mix', 'pub', 'test', 'draft'));

-- Check: should list the new constraint with 'draft' in it.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.usl_mix_games'::regclass AND contype = 'c';
