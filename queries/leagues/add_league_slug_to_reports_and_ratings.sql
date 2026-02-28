-- =============================================================================
-- Add league_slug to match_reports and squad_ratings
-- Existing rows default to 'ctfpl' for backward compatibility
-- =============================================================================

ALTER TABLE match_reports ADD COLUMN IF NOT EXISTS league_slug TEXT DEFAULT 'ctfpl';
ALTER TABLE squad_ratings ADD COLUMN IF NOT EXISTS league_slug TEXT DEFAULT 'ctfpl';

CREATE INDEX IF NOT EXISTS idx_match_reports_league_slug ON match_reports(league_slug);
CREATE INDEX IF NOT EXISTS idx_squad_ratings_league_slug ON squad_ratings(league_slug);
