-- ============================================================================
-- Squad leave requests (draft leagues such as CTFDL)
--
-- In a draft league the roster is set by the draft, so a player can no longer
-- just leave. They send a request; league staff are told, can talk to the
-- player, and then approve or deny it. Each row keeps what was decided, by
-- whom, when, and the reason staff gave.
--
-- Names are stored alongside the ids so the record still reads properly if the
-- squad is later disbanded or renamed.
--
-- Server only: RLS on, no client policies (the API routes use the service role).
-- Safe to run more than once. Until it is run, leaving a squad works as before.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.squad_leave_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id          UUID REFERENCES public.squads(id) ON DELETE SET NULL,
  squad_name        TEXT,
  squad_tag         TEXT,
  player_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_alias      TEXT,
  league_slug       TEXT,
  season_number     INTEGER,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_alias  TEXT,
  decided_at        TIMESTAMPTZ,
  decision_note     TEXT
);

-- One open request per player per squad.
CREATE UNIQUE INDEX IF NOT EXISTS squad_leave_requests_one_pending
  ON public.squad_leave_requests (squad_id, player_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS squad_leave_requests_status_created
  ON public.squad_leave_requests (status, created_at DESC);

ALTER TABLE public.squad_leave_requests ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: only the API routes (service role) touch this table.

COMMENT ON TABLE public.squad_leave_requests IS 'Requests to leave a draft-league squad, with the staff decision (who, when, why). Written only by /api/squads/leave-requests (service role).';
