-- ============================================================================
-- CTFDL live draft (CTFDL-only; other leagues never touch these tables)
-- ============================================================================
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Tables
--   ctfdl_drafts          one per league season: settings + live state
--   ctfdl_draft_teams     participating squads in pick order
--   ctfdl_draft_picks     the record (round/overall/team/player/how it was made)
--   ctfdl_draft_rankings  staff's pre-draft ranking (visible to captains,
--                         auto-pick fallback)
--   ctfdl_draft_queues    each captain's private pre-ranked wishlist
--                         (RLS on, no client policies — server only)
-- Functions
--   ctfdl_draft_make_pick  atomic: verify turn + eligibility, write the pick
--                          AND the squad membership, advance the clock
--   ctfdl_draft_undo_pick  remove the last pick and its membership
-- Realtime: ctfdl_drafts + ctfdl_draft_picks are added to the publication so
-- open lobbies update live.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ctfdl_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id  UUID NOT NULL UNIQUE REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'setup'
                    CHECK (status IN ('setup', 'live', 'paused', 'complete')),
  order_type        TEXT NOT NULL DEFAULT 'snake' CHECK (order_type IN ('snake', 'straight')),
  roster_size       INTEGER NOT NULL DEFAULT 5 CHECK (roster_size BETWEEN 1 AND 30),
  pick_seconds      INTEGER CHECK (pick_seconds IS NULL OR pick_seconds BETWEEN 10 AND 3600),
  auto_pick         BOOLEAN NOT NULL DEFAULT true,
  current_pick      INTEGER NOT NULL DEFAULT 1,
  turn_started_at   TIMESTAMPTZ,
  paused_remaining  INTEGER,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  squad_id    UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  pick_order  INTEGER NOT NULL,
  UNIQUE (draft_id, squad_id),
  UNIQUE (draft_id, pick_order)
);

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_picks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id       UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  overall        INTEGER NOT NULL,
  round          INTEGER NOT NULL,
  team_id        UUID NOT NULL REFERENCES public.ctfdl_draft_teams(id) ON DELETE CASCADE,
  player_id      UUID REFERENCES public.profiles(id),
  pick_type      TEXT NOT NULL CHECK (pick_type IN ('captain', 'staff', 'auto', 'skip')),
  picked_by      UUID REFERENCES public.profiles(id),
  membership_id  UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, overall)
);
CREATE UNIQUE INDEX IF NOT EXISTS ctfdl_draft_picks_player_once
  ON public.ctfdl_draft_picks (draft_id, player_id) WHERE player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_rankings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank       INTEGER NOT NULL,
  UNIQUE (draft_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_queues (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.ctfdl_draft_teams(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank       INTEGER NOT NULL,
  UNIQUE (draft_id, team_id, player_id)
);

-- ---- RLS --------------------------------------------------------------------
ALTER TABLE public.ctfdl_drafts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctfdl_draft_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctfdl_draft_picks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctfdl_draft_rankings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctfdl_draft_queues    ENABLE ROW LEVEL SECURITY;

-- Public read on the board (needed for Realtime delivery too). All writes go
-- through service-role API routes, so no client write policies.
DROP POLICY IF EXISTS ctfdl_drafts_read         ON public.ctfdl_drafts;
DROP POLICY IF EXISTS ctfdl_draft_teams_read    ON public.ctfdl_draft_teams;
DROP POLICY IF EXISTS ctfdl_draft_picks_read    ON public.ctfdl_draft_picks;
DROP POLICY IF EXISTS ctfdl_draft_rankings_read ON public.ctfdl_draft_rankings;
CREATE POLICY ctfdl_drafts_read         ON public.ctfdl_drafts         FOR SELECT USING (true);
CREATE POLICY ctfdl_draft_teams_read    ON public.ctfdl_draft_teams    FOR SELECT USING (true);
CREATE POLICY ctfdl_draft_picks_read    ON public.ctfdl_draft_picks    FOR SELECT USING (true);
CREATE POLICY ctfdl_draft_rankings_read ON public.ctfdl_draft_rankings FOR SELECT USING (true);
-- ctfdl_draft_queues: deliberately NO policies (captain wishlists are private).

-- ---- Realtime ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ctfdl_drafts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ctfdl_drafts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ctfdl_draft_picks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ctfdl_draft_picks;
  END IF;
END $$;

-- ---- Make a pick (atomic) ----------------------------------------------------
-- p_pick_type: 'captain' | 'staff' | 'auto' | 'skip'  (skip ignores p_player_id)
-- Who is allowed to call this is enforced by the API route; this function
-- enforces turn order, eligibility, and writes pick + membership together.
CREATE OR REPLACE FUNCTION public.ctfdl_draft_make_pick(
  p_draft_id   UUID,
  p_player_id  UUID,
  p_pick_type  TEXT,
  p_actor      UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d            ctfdl_drafts%ROWTYPE;
  v_season     INTEGER;
  n            INTEGER;
  k            INTEGER;
  r            INTEGER;
  idx          INTEGER;
  t            ctfdl_draft_teams%ROWTYPE;
  v_member_id  UUID;
  v_total      INTEGER;
  v_remaining  INTEGER;
  v_complete   BOOLEAN;
BEGIN
  SELECT * INTO d FROM ctfdl_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF d.status <> 'live' THEN RAISE EXCEPTION 'Draft is not live'; END IF;

  SELECT season_number INTO v_season FROM league_seasons WHERE id = d.league_season_id;
  SELECT count(*) INTO n FROM ctfdl_draft_teams WHERE draft_id = p_draft_id;
  IF n = 0 THEN RAISE EXCEPTION 'Draft has no teams'; END IF;

  k   := d.current_pick;
  r   := ((k - 1) / n) + 1;
  idx := (k - 1) % n;
  IF d.order_type = 'snake' AND (r % 2) = 0 THEN idx := n - 1 - idx; END IF;

  SELECT * INTO t FROM ctfdl_draft_teams
   WHERE draft_id = p_draft_id ORDER BY pick_order OFFSET idx LIMIT 1;

  IF p_pick_type = 'skip' THEN
    INSERT INTO ctfdl_draft_picks (draft_id, overall, round, team_id, player_id, pick_type, picked_by)
    VALUES (p_draft_id, k, r, t.id, NULL, 'skip', p_actor);
  ELSE
    IF p_player_id IS NULL THEN RAISE EXCEPTION 'No player given'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM free_agents fa
       WHERE fa.player_id = p_player_id AND fa.is_active = true
         AND fa.league_slug = 'ctfdl' AND fa.season_number = v_season
    ) THEN RAISE EXCEPTION 'Player is not registered for this season'; END IF;
    IF EXISTS (SELECT 1 FROM ctfdl_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id)
      THEN RAISE EXCEPTION 'Player has already been drafted'; END IF;
    IF EXISTS (
      SELECT 1 FROM ctfdl_draft_teams dt JOIN squads s ON s.id = dt.squad_id
       WHERE dt.draft_id = p_draft_id AND s.captain_id = p_player_id
    ) THEN RAISE EXCEPTION 'Captains are not draftable'; END IF;

    -- Put the player on the squad (skip if somehow already an active member).
    SELECT id INTO v_member_id FROM squad_members
     WHERE squad_id = t.squad_id AND player_id = p_player_id AND status = 'active' LIMIT 1;
    IF v_member_id IS NULL THEN
      INSERT INTO squad_members (squad_id, player_id, role, status)
      VALUES (t.squad_id, p_player_id, 'player', 'active')
      RETURNING id INTO v_member_id;
    ELSE
      v_member_id := NULL; -- not created by the draft; undo must not remove it
    END IF;

    INSERT INTO ctfdl_draft_picks (draft_id, overall, round, team_id, player_id, pick_type, picked_by, membership_id)
    VALUES (p_draft_id, k, r, t.id, p_player_id, p_pick_type, p_actor, v_member_id);
  END IF;

  -- Advance. Complete when every roster slot is used or nobody is left to draft.
  v_total := n * d.roster_size;
  SELECT count(*) INTO v_remaining
    FROM free_agents fa
   WHERE fa.is_active = true AND fa.league_slug = 'ctfdl' AND fa.season_number = v_season
     AND NOT EXISTS (SELECT 1 FROM ctfdl_draft_picks p WHERE p.draft_id = p_draft_id AND p.player_id = fa.player_id)
     AND NOT EXISTS (SELECT 1 FROM ctfdl_draft_teams dt JOIN squads s ON s.id = dt.squad_id
                      WHERE dt.draft_id = p_draft_id AND s.captain_id = fa.player_id);
  v_complete := (k + 1 > v_total) OR (v_remaining = 0);

  UPDATE ctfdl_drafts
     SET current_pick    = k + 1,
         turn_started_at = now(),
         status          = CASE WHEN v_complete THEN 'complete' ELSE status END,
         completed_at    = CASE WHEN v_complete THEN now() ELSE completed_at END,
         updated_at      = now()
   WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'overall', k, 'round', r, 'team_id', t.id, 'squad_id', t.squad_id,
    'player_id', p_player_id, 'pick_type', p_pick_type, 'complete', v_complete
  );
END;
$$;

-- ---- Undo the last pick ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ctfdl_draft_undo_pick(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d  ctfdl_drafts%ROWTYPE;
  p  ctfdl_draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO d FROM ctfdl_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF d.status NOT IN ('live', 'paused', 'complete') THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  IF d.current_pick <= 1 THEN RAISE EXCEPTION 'No picks to undo'; END IF;

  SELECT * INTO p FROM ctfdl_draft_picks
   WHERE draft_id = p_draft_id AND overall = d.current_pick - 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Last pick not found'; END IF;

  IF p.membership_id IS NOT NULL THEN
    DELETE FROM squad_members WHERE id = p.membership_id;
  END IF;
  DELETE FROM ctfdl_draft_picks WHERE id = p.id;

  -- The clock restarts for the team that gets its pick back.
  UPDATE ctfdl_drafts
     SET current_pick     = d.current_pick - 1,
         turn_started_at  = now(),
         paused_remaining = NULL,
         status           = CASE WHEN status = 'complete' THEN 'live' ELSE status END,
         completed_at     = NULL,
         updated_at       = now()
   WHERE id = p_draft_id;

  RETURN jsonb_build_object('undone_overall', p.overall, 'player_id', p.player_id, 'team_id', p.team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ctfdl_draft_make_pick(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ctfdl_draft_undo_pick(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ctfdl_drafts IS 'CTFDL live draft: one row per league season. Written only by /api/ctfdl/draft routes (service role).';
