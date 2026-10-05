-- ============================================================================
-- Squad kick requests (draft leagues such as CTFDL)
--
-- Extends squad_leave_requests (create-squad-leave-requests.sql) so the same
-- table also holds requests from a captain or co-captain to have a player
-- removed. In a draft league captains can no longer kick: they ask, league
-- staff approve or deny, and the decision is recorded the same way.
--
--   kind                'leave' (the player asked) or 'kick' (a captain asked)
--   requested_by        who sent a kick request
--   requested_by_alias  their name at the time
--
-- Existing rows become kind = 'leave'. Safe to run more than once. Until it is
-- run, captains can kick as before.
-- ============================================================================

ALTER TABLE public.squad_leave_requests
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'leave',
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_alias TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'squad_leave_requests_kind_check') THEN
    ALTER TABLE public.squad_leave_requests
      ADD CONSTRAINT squad_leave_requests_kind_check CHECK (kind IN ('leave', 'kick'));
  END IF;
END $$;

-- One open request per player per squad OF EACH KIND: a player's own leave request and a
-- captain's kick request about them can both be waiting at the same time.
DROP INDEX IF EXISTS public.squad_leave_requests_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS squad_leave_requests_one_pending_per_kind
  ON public.squad_leave_requests (squad_id, player_id, kind) WHERE status = 'pending';

-- Tell the API layer about the new columns right away.
NOTIFY pgrst, 'reload schema';
