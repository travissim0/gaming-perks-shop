-- League schedule: tag a scheduled match with the league, season, week and
-- stage it belongs to, so the Schedule page can list fixtures week by week,
-- generate round-robin / playoff rounds, and match fixtures to reported
-- results. Existing matches are untouched (columns stay NULL).

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS league_slug   TEXT,
  ADD COLUMN IF NOT EXISTS season_number INTEGER,
  ADD COLUMN IF NOT EXISTS week          INTEGER CHECK (week IS NULL OR week BETWEEN 1 AND 52),
  ADD COLUMN IF NOT EXISTS stage         TEXT CHECK (stage IS NULL OR stage IN ('regular', 'playoff')),
  ADD COLUMN IF NOT EXISTS playoff_round INTEGER CHECK (playoff_round IS NULL OR playoff_round BETWEEN 1 AND 6);

CREATE INDEX IF NOT EXISTS matches_league_schedule_idx
  ON public.matches (league_slug, season_number, week, scheduled_at)
  WHERE league_slug IS NOT NULL;
