-- Match setup: the home team's side choice and both teams' lineups for a
-- scheduled match. Feeds the match page and, later, the game client, which
-- places starters on "<TAG> T" / "<TAG> C" and keeps the bench in spec.
--
-- Home team = matches.squad_a_id (the first-listed team of the fixture).

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_side       TEXT CHECK (home_side IS NULL OR home_side IN ('titan', 'collective')),
  ADD COLUMN IF NOT EXISTS side_chosen_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS side_chosen_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

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

COMMENT ON TABLE public.match_lineups IS
  'Per-match starting lineup and bench for each squad. Written only through /api/matches/[id]/setup (service role); readable by everyone.';

ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_lineups_public_read" ON public.match_lineups;
CREATE POLICY "match_lineups_public_read" ON public.match_lineups
  FOR SELECT USING (true);

-- No insert/update/delete policies: the API route (service role) is the only writer.
