-- Multi-server zone management - required schema change
-- =====================================================
-- Paste this into the Supabase SQL editor. Safe to run more than once.
--
-- This is the ONLY schema change required. It adds a `host` column to
-- zone_commands so a queued command can target a specific game server
-- (the daemon on each server only executes commands where host = its key,
-- e.g. 'serverA' / 'serverB').
--
-- Status reporting needs no migration: each server's daemon upserts a
-- zone_status row keyed by its server id using the existing columns
-- (id, hostname, source, zones_data, last_update). The web app maps the
-- server id to a friendly label via SERVER_META in the API route.
--
-- The required change:
ALTER TABLE zone_commands ADD COLUMN IF NOT EXISTS host text;

-- Cosmetic cleanup of leftovers from the old single-server setup. Not strictly
-- required (the API only reads rows where source = 'zone-daemon', so these are
-- already ignored), but keeps the table tidy:
DELETE FROM zone_status WHERE id LIKE 'ping-test-%' OR id = 'current';
UPDATE zone_commands SET status = 'cancelled' WHERE status IN ('pending', 'processing');
