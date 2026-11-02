-- Match setup history (John, 2026-11-02): one row per change to a match's setup, so a disputed
-- side pick or lineup can be traced. Written by the site only; read by staff on the match page
-- ("History" in the Manage menu). Private: RLS on, no policies.
CREATE TABLE IF NOT EXISTS public.match_setup_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id  UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  by_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  by_alias  TEXT,
  -- side_set, side_cleared, lineup_saved, sub, sub_undone, home_swapped
  action    TEXT NOT NULL,
  squad_id  UUID REFERENCES public.squads(id) ON DELETE SET NULL,
  detail    JSONB
);
CREATE INDEX IF NOT EXISTS match_setup_log_match_idx ON public.match_setup_log (match_id, at);
ALTER TABLE public.match_setup_log ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.match_setup_log IS 'Who changed what on a match''s setup (side, lineups, subs, home swap). Private: read only through /api/matches/[id]/history (staff).';
NOTIFY pgrst, 'reload schema';
