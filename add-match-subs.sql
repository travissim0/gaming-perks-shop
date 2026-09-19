-- Match substitutions: who was swapped in/out of a starting lineup, by whom, when.
-- Captains/co-captains of that squad, league staff and referees may sub from the
-- moment the side is released (5 min before the match) until the result is
-- recorded. The zone's automation reads the resulting lineup and moves players.
-- Private like the other setup tables: RLS on, NO policies; only the service
-- role (the setup route) reads or writes it.

CREATE TABLE IF NOT EXISTS public.match_lineup_subs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  squad_id       UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  out_player_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  in_player_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  by_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_lineup_subs_match_idx ON public.match_lineup_subs (match_id, created_at);

COMMENT ON TABLE public.match_lineup_subs IS
  'Substitutions per match. Private: RLS on, no policies; read/written only by /api/matches/[id]/setup.';

ALTER TABLE public.match_lineup_subs ENABLE ROW LEVEL SECURITY;
