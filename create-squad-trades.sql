-- ============================================================================
-- Squad trades (draft leagues such as CTFDL)
--
-- Captains propose trades between 2–4 squads; every squad in the trade accepts;
-- then the other captains get 12 hours to approve or appeal. Two appeals from
-- two different squads escalate it to the admins, who decide. Otherwise it
-- completes on its own (early, as soon as fewer than two squads could still
-- appeal). The rules (two trades per player per season, the week 6 deadline,
-- the Sunday 8–11 PM ET and during-a-match blackout) are enforced by the site.
--
-- Server only: RLS on, no client policies (the API routes use the service role).
-- Safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.squad_trades (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_slug        TEXT NOT NULL,
  season_number      INTEGER,
  status             TEXT NOT NULL DEFAULT 'proposed'
                     CHECK (status IN ('proposed', 'agreed', 'escalated', 'completed', 'declined', 'cancelled', 'denied')),
  proposed_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_by_alias  TEXT,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  agreed_at          TIMESTAMPTZ,
  window_ends_at     TIMESTAMPTZ,
  escalated_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  decided_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_alias   TEXT,
  decided_at         TIMESTAMPTZ,
  decision_note      TEXT
);

-- The squads in a trade and whether each has accepted.
CREATE TABLE IF NOT EXISTS public.squad_trade_squads (
  trade_id            UUID NOT NULL REFERENCES public.squad_trades(id) ON DELETE CASCADE,
  squad_id            UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  squad_name          TEXT,
  squad_tag           TEXT,
  response            TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'declined')),
  responded_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_by_alias  TEXT,
  responded_at        TIMESTAMPTZ,
  PRIMARY KEY (trade_id, squad_id)
);

-- Who moves where.
CREATE TABLE IF NOT EXISTS public.squad_trade_players (
  trade_id       UUID NOT NULL REFERENCES public.squad_trades(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_alias   TEXT,
  from_squad_id  UUID REFERENCES public.squads(id) ON DELETE SET NULL,
  to_squad_id    UUID REFERENCES public.squads(id) ON DELETE SET NULL,
  PRIMARY KEY (trade_id, player_id)
);

-- Votes from the squads NOT in the trade during the 12-hour window: approve or appeal.
CREATE TABLE IF NOT EXISTS public.squad_trade_votes (
  trade_id    UUID NOT NULL REFERENCES public.squad_trades(id) ON DELETE CASCADE,
  squad_id    UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  vote        TEXT NOT NULL CHECK (vote IN ('approve', 'appeal')),
  by_user     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  by_alias    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, squad_id)
);

CREATE INDEX IF NOT EXISTS squad_trades_status_created ON public.squad_trades (status, created_at DESC);
CREATE INDEX IF NOT EXISTS squad_trade_players_player ON public.squad_trade_players (player_id);

ALTER TABLE public.squad_trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_trade_squads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_trade_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_trade_votes   ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: only the API routes (service role) touch these tables.

COMMENT ON TABLE public.squad_trades IS 'Draft-league squad trades: proposed → agreed (12h appeal window) → completed / escalated → admins decide. Written only by /api/squads/trades (service role).';

-- Tell the API layer about the new tables right away.
NOTIFY pgrst, 'reload schema';
