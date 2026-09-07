-- ============================================================================
-- League registry — presentation metadata on the existing `leagues` table
-- ============================================================================
-- ADDITIVE ONLY. Each league keeps its own backend (ctfpl_* vs league_*).
-- This just tells the site which leagues exist, how to label them, which
-- data source each uses, and which one is featured right now.
-- Safe to re-run. Paste into the Supabase SQL editor.
-- ============================================================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS tagline       TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS format        TEXT;      -- 'squad' | 'draft' | 'ovd'
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS accent_color  TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules_pdf_url TEXT;
-- Which tables back this league: 'ctfpl' = ctfpl_seasons/ctfpl_standings,
-- 'generic' = league_seasons/league_standings (CTFDL, OVDL).
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS data_source   TEXT NOT NULL DEFAULT 'generic';

-- At most one featured league at a time.
CREATE UNIQUE INDEX IF NOT EXISTS leagues_one_featured
    ON leagues (is_featured) WHERE is_featured = true;

-- Correct names + metadata (the DB previously called CTFDL a "Duel League"
-- and OVDL "Other League").
UPDATE leagues SET
    name = 'CTFPL',
    description = 'Capture the Flag Players League',
    tagline = 'Squad league with fixed rosters',
    format = 'squad',
    data_source = 'ctfpl',
    display_order = 1,
    accent_color = '#22D3EE'
WHERE slug = 'ctfpl';

UPDATE leagues SET
    name = 'CTFDL',
    description = 'CTF Draft League',
    tagline = 'Captains draft players each season',
    format = 'draft',
    data_source = 'generic',
    display_order = 2,
    accent_color = '#F59E0B',
    rules_pdf_url = '/CTFDL-S3-Rules.pdf'
WHERE slug = 'ctfdl';

UPDATE leagues SET
    name = 'OVDL',
    description = 'Offense vs Defense League',
    tagline = 'Offense versus defense',
    format = 'ovd',
    data_source = 'generic',
    display_order = 3,
    accent_color = '#A78BFA',
    rules_pdf_url = '/OVD-League-2024_2025-Season-1.pdf'
WHERE slug = 'ovdl';

-- Feature the league that's running now.
UPDATE leagues SET is_featured = false;
UPDATE leagues SET is_featured = true WHERE slug = 'ctfdl';
