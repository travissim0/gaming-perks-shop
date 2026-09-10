-- Match setup: the home team's side choice and both teams' lineups for a
-- scheduled match. Private: only that squad's captain/co-captains and staff
-- see a lineup; only the home team's leads and staff see the side. Both
-- tables have RLS on with NO policies, so the browser can never read them.
-- The only reader/writer is /api/matches/[id]/setup (service role), which
-- also serves the game client when it presents the MATCH_CLIENT_KEY.
--
-- Home team = matches.squad_a_id (the first-listed team of the fixture).

CREATE TABLE IF NOT EXISTS public.match_setup (
  match_id        UUID PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  home_side       TEXT CHECK (home_side IS NULL OR home_side IN ('titan', 'collective')),
  side_chosen_at  TIMESTAMPTZ,
  side_chosen_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_lineups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  squad_id    UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL CHECK (slot IN ('starting', 'bench')),
  position    INTEGER NOT NULL DEFAULT 0,
  set_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_lineups_match_idx ON public.match_lineups (match_id, squad_id, slot, position);

COMMENT ON TABLE public.match_setup IS
  'Home side pick per match. Private: RLS on, no policies; read/written only by /api/matches/[id]/setup.';
COMMENT ON TABLE public.match_lineups IS
  'Per-match starting lineup and bench per squad. Private: RLS on, no policies; read/written only by /api/matches/[id]/setup.';

ALTER TABLE public.match_setup   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;

-- If the earlier version of this file was run, remove its public read policy
-- and the columns it put on matches.
DROP POLICY IF EXISTS "match_lineups_public_read" ON public.match_lineups;
ALTER TABLE public.matches
  DROP COLUMN IF EXISTS home_side,
  DROP COLUMN IF EXISTS side_chosen_at,
  DROP COLUMN IF EXISTS side_chosen_by;
