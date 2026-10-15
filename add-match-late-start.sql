-- Late starts: a league match waits for the earlier match of either squad to finish.
--
-- Two matches on one night can overlap (Oct 14: the 7:30 FS Green ran 28 minutes, the 8:00
-- FS Red kicked off on top of it). Rather than rewrite the schedule, the site now holds the
-- later match: the zone's arena timer sits at 10:00 while the earlier match is running, and
-- the moment that match's result lands the later one gets a 10-minute setup window and starts.
-- The scheduled time on record never changes; `effective_at` is the kick-off the automation
-- actually runs to. Staff or the referee can start it by hand; a hold ends on its own after
-- 90 minutes. See src/lib/late-start-server.ts.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS effective_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_waiting_on   UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS late_since        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_released_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_released_by  TEXT;

COMMENT ON COLUMN public.matches.effective_at IS 'Kick-off the zone automation runs to when the match started late; null = scheduled_at';
COMMENT ON COLUMN public.matches.late_waiting_on IS 'The earlier match this one is waiting on, while held';
COMMENT ON COLUMN public.matches.late_released_by IS 'How the hold ended: result, ceiling, or the alias who pressed Start now';
