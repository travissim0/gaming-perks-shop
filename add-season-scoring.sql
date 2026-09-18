-- Season scoring rules + free-scheduled (FS) matches.
--
-- Standings for generic leagues (CTFDL, OVDL…) are now REBUILT from
-- league_matches using the season's scoring_rules, instead of being
-- incremented with hard-coded 3/1/0 points. CTFPL is untouched.
--
-- Run once in the Supabase SQL editor.

-- 1. Per-season rules (NULL = classic 3 win / 1 loss / 0 no-show).
ALTER TABLE public.league_seasons
  ADD COLUMN IF NOT EXISTS scoring_rules JSONB;

-- 2. Recorded results carry what the rules need.
ALTER TABLE public.league_matches
  ADD COLUMN IF NOT EXISTS match_kind  TEXT NOT NULL DEFAULT 'rs' CHECK (match_kind IN ('rs', 'fs')),
  ADD COLUMN IF NOT EXISTS win_type    TEXT CHECK (win_type IS NULL OR win_type IN ('regulation', 'ot', '2ot')),
  ADD COLUMN IF NOT EXISTS no_contest  BOOLEAN NOT NULL DEFAULT false,   -- forfeited FS: nobody scores
  ADD COLUMN IF NOT EXISTS verified    BOOLEAN NOT NULL DEFAULT false,   -- ref present or recording exists (required for FS)
  ADD COLUMN IF NOT EXISTS fixture_id  UUID REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS league_matches_season_kind_idx ON public.league_matches (league_season_id, match_kind);

-- 3. Standings gain the split the new rules rank on. computed_rank is written
--    by the rebuild (full tiebreakers incl. head-to-head); the view prefers it.
ALTER TABLE public.league_standings
  ADD COLUMN IF NOT EXISTS rs_wins            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rs_losses          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fs_wins            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fs_losses          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forfeits           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rs_win_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS computed_rank      INTEGER;

CREATE OR REPLACE VIEW public.league_standings_with_rankings AS
SELECT
    s.*,
    sq.name AS squad_name,
    sq.tag AS squad_tag,
    sq.banner_url,
    p.in_game_alias AS captain_alias,
    ls.season_number,
    l.slug AS league_slug,
    l.name AS league_name,
    COALESCE(
      s.computed_rank,
      ROW_NUMBER() OVER (
        PARTITION BY s.league_season_id
        ORDER BY s.points DESC, s.win_percentage DESC, s.regulation_wins DESC, s.overtime_wins DESC, s.kill_death_difference DESC, s.wins DESC
      )
    )::INTEGER AS rank,
    (SELECT MAX(points) FROM public.league_standings s2 WHERE s2.league_season_id = s.league_season_id) - s.points AS points_behind
FROM public.league_standings s
JOIN public.squads sq ON s.squad_id = sq.id
LEFT JOIN public.profiles p ON sq.captain_id = p.id
JOIN public.league_seasons ls ON s.league_season_id = ls.id
JOIN public.leagues l ON ls.league_id = l.id
ORDER BY s.league_season_id, rank;

-- 4. Free-scheduled fixtures live on the schedule (matches) with stage 'fs'.
--    Captains propose; the other captain accepts. fs_week_start = the Monday
--    of the Mon–Sun week the match falls in (America/New_York), for the caps.
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_stage_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_stage_check CHECK (stage IS NULL OR stage IN ('regular', 'playoff', 'fs'));

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS fs_status      TEXT CHECK (fs_status IS NULL OR fs_status IN ('pending', 'accepted', 'declined', 'cancelled')),
  ADD COLUMN IF NOT EXISTS proposed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fs_week_start  DATE;

CREATE INDEX IF NOT EXISTS matches_fs_idx ON public.matches (league_slug, season_number, fs_week_start) WHERE stage = 'fs';
