-- ============================================================================
-- Tag squads with the league they belong to
-- ============================================================================
-- squads.league_slug drives the squad page: squad-format leagues (CTFPL) show
-- recruiting tools (invite / join requests / sent invites); draft or OvD
-- squads show "roster set by the draft" instead. Set automatically when a
-- squad is added to a CTFDL draft; editable per squad in admin CTF management.
-- Idempotent.

ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS league_slug TEXT;
COMMENT ON COLUMN public.squads.league_slug IS 'leagues.slug this squad plays in (ctfpl / ctfdl / ovdl). NULL = unknown, treated as squad league.';

-- Backfill: anything that has been in a CTFDL draft
UPDATE public.squads s
   SET league_slug = 'ctfdl'
 WHERE s.league_slug IS NULL
   AND EXISTS (SELECT 1 FROM public.ctfdl_draft_teams dt WHERE dt.squad_id = s.id);

-- Backfill: anything with standings in a generic-league season (CTFDL / OVDL)
UPDATE public.squads s
   SET league_slug = l.slug
  FROM public.league_standings ls
  JOIN public.league_seasons se ON se.id = ls.league_season_id
  JOIN public.leagues l ON l.id = se.league_id
 WHERE ls.squad_id = s.id
   AND s.league_slug IS NULL;

-- Backfill: anything with CTFPL standings
UPDATE public.squads s
   SET league_slug = 'ctfpl'
 WHERE s.league_slug IS NULL
   AND EXISTS (SELECT 1 FROM public.ctfpl_standings cs WHERE cs.squad_id = s.id);

-- Check:
-- SELECT league_slug, count(*) FROM public.squads GROUP BY 1;
