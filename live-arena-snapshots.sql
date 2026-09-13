-- ============================================================================
-- Live arena snapshots (USL + CTF zones -> freeinf.org home page / API)
--
-- Each zone script POSTs one snapshot per arena about once a minute to
-- /api/live/ingest: the player list grouped by team, every player's class,
-- who is spectating, the game clock / score and the ticker "bubbles" as a
-- spectator sees them. The site keeps only the LATEST snapshot per arena
-- (one row per game|zone|arena) and treats anything older than a couple of
-- minutes as gone, so a zone that stops posting simply disappears from the
-- panel - nothing to clean up.
--
-- Like live_game_state, this is a shared row store rather than process
-- memory because every Vercel request may land on a different instance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_arena_snapshots (
    key            text        PRIMARY KEY,           -- "<game>|<zone>|<arena>"
    game           text        NOT NULL,              -- usl | ctf
    zone           text        NOT NULL,
    arena          text        NOT NULL,
    players_total  integer     NOT NULL DEFAULT 0,
    data           jsonb       NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_arena_snapshots_updated_idx
    ON live_arena_snapshots (updated_at DESC);

-- Public read: the home page panel and the public /api/live feed are for anonymous
-- visitors. Writes go through /api/live/ingest on the service role (bypasses RLS).
ALTER TABLE live_arena_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_arena_snapshots_public_read" ON live_arena_snapshots;
CREATE POLICY "live_arena_snapshots_public_read" ON live_arena_snapshots
    FOR SELECT USING (true);
