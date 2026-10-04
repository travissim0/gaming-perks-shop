-- ============================================================================
-- CTFDL draft: the pick function checks WHICH pick it is making
--
-- ctfdl_draft_make_pick always picked for whichever team was on the clock at
-- the moment it ran. When the clock runs out, every open draft room asks the
-- server to auto-pick at the same time. If one of those requests was slow, it
-- could arrive after the auto-pick had already been made and then auto-pick
-- AGAIN, for the next team, with their clock barely started. (It did not happen
-- at the S5 draft: all 81 picks were made by captains. It is a hole, not a
-- repair.)
--
-- New optional argument p_expected_pick: the overall pick number the caller
-- believes it is making. If the draft has already moved past it, the function
-- refuses. NULL (or omitted) keeps the old behaviour, so the site works before
-- and after this is run.
--
-- The 4-argument version is dropped first: keeping both would make calls with
-- four arguments ambiguous. Everything else in the function is unchanged from
-- create-ctfdl-draft.sql.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.ctfdl_draft_make_pick(UUID, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.ctfdl_draft_make_pick(
  p_draft_id       UUID,
  p_player_id      UUID,
  p_pick_type      TEXT,
  p_actor          UUID,
  p_expected_pick  INTEGER DEFAULT NULL
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
  -- The draft row is locked above, so this check and the pick below are one step.
  IF p_expected_pick IS NOT NULL AND d.current_pick <> p_expected_pick THEN
    RAISE EXCEPTION 'That pick has already been made';
  END IF;

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

REVOKE ALL ON FUNCTION public.ctfdl_draft_make_pick(UUID, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Tell the API layer about the new argument right away.
NOTIFY pgrst, 'reload schema';
