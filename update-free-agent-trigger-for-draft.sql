-- ============================================================================
-- Free-agent pool vs. the CTFDL draft
-- ============================================================================
-- The existing trigger remove_from_free_agent_pool_on_squad_join deactivates
-- a player's free-agent rows whenever they join ANY squad. Right for CTFPL
-- (a squad league), wrong for a draft league: the registration IS the season
-- roster and must survive being drafted (and come back on undo/reset).
--
-- 1. Trigger now only deactivates registrations for squad-format leagues
--    (or untagged legacy rows). Draft/OvD registrations stay active.
-- 2. ctfdl_draft_undo_pick reactivates the undone player's registration.
-- 3. One-off: reactivate the CTFDL Season 5 rows the old trigger switched off.
-- Idempotent.
-- ============================================================================

-- ---- 1. Trigger: skip draft/OvD league registrations -----------------------
CREATE OR REPLACE FUNCTION public.remove_from_free_agent_pool_on_squad_join()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Joining a squad ends a free-agent listing only for squad-format leagues.
  UPDATE public.free_agents fa
     SET is_active = false, updated_at = now()
   WHERE fa.player_id = NEW.player_id
     AND fa.is_active = true
     AND (
       fa.league_slug IS NULL
       OR EXISTS (
         SELECT 1 FROM public.leagues l
          WHERE l.slug = fa.league_slug
            AND COALESCE(l.format, 'squad') = 'squad'
       )
     );
  RETURN NEW;
END;
$$;

-- ---- 2. Undo reactivates the registration ---------------------------------
CREATE OR REPLACE FUNCTION public.ctfdl_draft_undo_pick(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d         ctfdl_drafts%ROWTYPE;
  p         ctfdl_draft_picks%ROWTYPE;
  v_season  INTEGER;
BEGIN
  SELECT * INTO d FROM ctfdl_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF d.status NOT IN ('live', 'paused', 'complete') THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  IF d.current_pick <= 1 THEN RAISE EXCEPTION 'No picks to undo'; END IF;

  SELECT * INTO p FROM ctfdl_draft_picks
   WHERE draft_id = p_draft_id AND overall = d.current_pick - 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Last pick not found'; END IF;

  SELECT season_number INTO v_season FROM league_seasons WHERE id = d.league_season_id;

  IF p.membership_id IS NOT NULL THEN
    DELETE FROM squad_members WHERE id = p.membership_id;
  END IF;
  IF p.player_id IS NOT NULL THEN
    UPDATE free_agents
       SET is_active = true, updated_at = now()
     WHERE player_id = p.player_id AND league_slug = 'ctfdl' AND season_number = v_season;
  END IF;
  DELETE FROM ctfdl_draft_picks WHERE id = p.id;

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

REVOKE ALL ON FUNCTION public.ctfdl_draft_undo_pick(UUID) FROM PUBLIC, anon, authenticated;

-- ---- 3. One-off: bring back the Season 5 test registrations ----------------
UPDATE public.free_agents
   SET is_active = true, updated_at = now()
 WHERE league_slug = 'ctfdl' AND season_number = 5 AND is_active = false;
