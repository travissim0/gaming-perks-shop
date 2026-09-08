-- ============================================================================
-- League registration: tag free-agent rows by league + season, and add a
-- staff-only "interested in captaining" table.
-- ============================================================================
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- What this does:
--   1. free_agents gains league_slug + season_number so each registration
--      belongs to a specific league season. Season rollover no longer needs
--      the pool to be wiped — the site simply shows the current season's rows.
--   2. Replaces the old "one active row per player" unique rule with
--      "one active row per player per league season".
--   3. Backfills the currently-active rows onto the featured league's open
--      season so nobody disappears from the pool after this runs.
--   4. Creates league_captain_interest. RLS is enabled with NO policies, so
--      anon/authenticated clients can never read it; only the server (service
--      role) reads/writes it. That is what keeps captain interest staff-only.
-- ============================================================================

-- ---- 1. Columns -------------------------------------------------------------
ALTER TABLE public.free_agents ADD COLUMN IF NOT EXISTS league_slug   TEXT;
ALTER TABLE public.free_agents ADD COLUMN IF NOT EXISTS season_number INTEGER;

COMMENT ON COLUMN public.free_agents.league_slug   IS 'League this registration is for (leagues.slug). NULL = legacy row from before per-season registration.';
COMMENT ON COLUMN public.free_agents.season_number IS 'Season number within league_slug that this registration is for.';

-- ---- 2. Unique rule: one ACTIVE row per player per league season ------------
DO $$
DECLARE r RECORD;
BEGIN
  -- Drop any existing UNIQUE constraints on free_agents (the old rule was an
  -- implied UNIQUE(player_id, is_active); the primary key is contype 'p' and
  -- is untouched).
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.free_agents'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.free_agents DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Drop standalone unique indexes too (except the pkey and the one we create).
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'free_agents'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexname NOT LIKE '%pkey'
      AND indexname <> 'free_agents_one_active_per_season'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS free_agents_one_active_per_season
  ON public.free_agents (player_id, COALESCE(league_slug, ''), COALESCE(season_number, 0))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS free_agents_league_season_idx
  ON public.free_agents (league_slug, season_number)
  WHERE is_active = true;

-- ---- 3. Backfill current pool onto the featured league's open season --------
DO $$
DECLARE
  v_slug      TEXT;
  v_source    TEXT;
  v_league_id UUID;
  v_season    INTEGER;
BEGIN
  SELECT slug, data_source, id
    INTO v_slug, v_source, v_league_id
  FROM public.leagues
  WHERE is_featured = true
  ORDER BY display_order
  LIMIT 1;

  IF v_slug IS NULL THEN
    RAISE NOTICE 'No featured league found; skipping backfill.';
    RETURN;
  END IF;

  IF v_source = 'ctfpl' THEN
    SELECT season_number INTO v_season
    FROM public.ctfpl_seasons
    WHERE status IN ('active', 'upcoming')
    ORDER BY (status = 'active') DESC, season_number DESC
    LIMIT 1;
  ELSE
    SELECT season_number INTO v_season
    FROM public.league_seasons
    WHERE league_id = v_league_id AND status IN ('active', 'upcoming')
    ORDER BY (status = 'active') DESC, season_number DESC
    LIMIT 1;
  END IF;

  UPDATE public.free_agents
     SET league_slug = v_slug, season_number = v_season
   WHERE is_active = true AND league_slug IS NULL;

  RAISE NOTICE 'Backfilled active free agents onto % season %', v_slug, v_season;
END $$;

-- ---- 4. Staff-only captain interest -----------------------------------------
CREATE TABLE IF NOT EXISTS public.league_captain_interest (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  league_slug   TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  interested    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, league_slug, season_number)
);

COMMENT ON TABLE public.league_captain_interest IS
  'Players who ticked "interested in captaining" when registering. Staff-only: RLS enabled with no policies, accessed only via service role in /api routes.';

ALTER TABLE public.league_captain_interest ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies: anon/authenticated get zero rows. The server
-- (service role, bypasses RLS) is the only reader/writer.

-- ---- Done -------------------------------------------------------------------
-- Verify:
--   SELECT league_slug, season_number, count(*) FROM free_agents WHERE is_active GROUP BY 1,2;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'free_agents';
