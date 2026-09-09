-- ============================================================================
-- Live game state
--
-- The live feed was kept in a module-scope variable in the Next.js process.
-- That cannot work on Vercel: every request is served by its own serverless
-- instance, so the zone POSTs to one instance and the browser GETs from a
-- different one. Six consecutive requests to /api/live-game-data returned six
-- distinct x-vercel-id instances, so the data almost never survived the trip.
--
-- One shared row fixes it. Single row by construction - the CHECK plus the
-- fixed primary key means an upsert can only ever replace the same row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_game_state (
    id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data        jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Public read: the live game panel is visible to anonymous visitors.
-- Writes go through /api/live-game-data on the service role, which bypasses RLS.
ALTER TABLE live_game_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_game_state_public_read" ON live_game_state;
CREATE POLICY "live_game_state_public_read" ON live_game_state
    FOR SELECT USING (true);
