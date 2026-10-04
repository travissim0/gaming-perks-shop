-- ============================================================================
-- CTFDL draft room: captain / staff check-ins ("in the room" lights)
--
-- Captains, co-captains and staff with the draft page open check in every ~20s
-- through /api/ctfdl/draft/me. The room lights a captain up from these rows, so
-- it no longer depends on a Realtime presence connection staying up (at the S5
-- draft only 1-2 of the 4 captains showed as present while all 4 were there).
--
-- One row per person per draft, overwritten on each check-in. Server only:
-- RLS on, no client policies (written and read with the service role).
-- Safe to run more than once. Until it is run, the room falls back to Realtime
-- presence alone, as before.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_presence (
  draft_id  UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id   UUID REFERENCES public.ctfdl_draft_teams(id) ON DELETE CASCADE,
  is_staff  BOOLEAN NOT NULL DEFAULT false,
  alias     TEXT,
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, user_id)
);

ALTER TABLE public.ctfdl_draft_presence ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: only the API routes (service role) touch this table.

COMMENT ON TABLE public.ctfdl_draft_presence IS 'CTFDL draft room: last check-in per captain/staff member (drives the "in the room" lights). Written only by /api/ctfdl/draft/me (service role).';
