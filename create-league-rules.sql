-- ============================================================================
-- league_rules — structured, per-league rulebook sections
-- ============================================================================
-- Powers the interactive /rules page (click a category, or read it all) and
-- the /admin/rules editor. One row per rulebook section. `body` is a TipTap
-- document (the same JSON the site's rich-text editor produces).
--
-- `source` = 'pdf-seed' for rows generated from the league PDFs, 'admin' once
-- an admin edits/creates a section. Re-running the seed file only replaces
-- 'pdf-seed' rows, so admin-authored content survives.
--
-- Additive only. Safe to re-run. Paste into the Supabase SQL editor, then run
-- create-league-rules-seed-ctfdl-ovdl.sql to load the CTFDL + OVDL rulebooks.
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_slug   TEXT NOT NULL,                 -- matches leagues.slug
    category      TEXT NOT NULL,                 -- short nav label, e.g. "Scheduling"
    title         TEXT NOT NULL,                 -- section heading, e.g. "4.0 Scheduling Rules"
    body          JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_published  BOOLEAN NOT NULL DEFAULT true,
    source        TEXT NOT NULL DEFAULT 'admin', -- 'admin' | 'pdf-seed'
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_by    UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_league_rules_league ON league_rules(league_slug, sort_order);

ALTER TABLE league_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_rules_read  ON league_rules;
DROP POLICY IF EXISTS league_rules_admin ON league_rules;

-- Anyone can read published sections; admins can read everything.
CREATE POLICY league_rules_read ON league_rules
    FOR SELECT USING (
        is_published = true
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

CREATE POLICY league_rules_admin ON league_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

COMMENT ON TABLE league_rules IS 'Per-league rulebook sections (TipTap JSON bodies) for the interactive /rules page.';
