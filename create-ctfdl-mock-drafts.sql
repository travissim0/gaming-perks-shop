-- ============================================================================
-- CTFDL mock drafts ("predict the draft order")
-- ============================================================================
-- Run once in the Supabase SQL editor. Idempotent.
--
-- One board per account per season: the player ids in the order the author
-- expects them to be drafted. Written and read only through /api/ctfdl/mock-draft
-- (service role), which decides what is public:
--   * boards by the season's drafting captains / co-captains are private to their
--     author and never enter the public ADP;
--   * "anonymous" hides the author's name publicly (staff can still see it).
-- RLS on with NO policies, so nothing is readable straight from the browser.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ctfdl_mock_boards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id  UUID NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_ids        UUID[] NOT NULL,
  anonymous         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_season_id, user_id)
);

CREATE INDEX IF NOT EXISTS ctfdl_mock_boards_season ON public.ctfdl_mock_boards (league_season_id);

ALTER TABLE public.ctfdl_mock_boards ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: captains' boards and anonymous authors stay private.

COMMENT ON TABLE public.ctfdl_mock_boards IS 'CTFDL mock draft boards (predicted draft order). Server-only; see /api/ctfdl/mock-draft.';
