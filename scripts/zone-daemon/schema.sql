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
-- NOTE: zone_commands has a CHECK constraint on status that does not allow
-- 'cancelled', so delete orphaned old-format rows (no host) instead.
DELETE FROM zone_commands WHERE status IN ('pending', 'processing') AND host IS NULL;


-- =====================================================================
-- Map rotation (inline per-zone lvl/lio swap) - run this section to enable
-- the per-zone "Maps" panel on /admin/zones.
-- =====================================================================

-- 1. Carry swap arguments {cfg,lvl,lio} on the command row.
ALTER TABLE zone_commands ADD COLUMN IF NOT EXISTS args jsonb;

-- 2. Allow the new 'swap-lvl-lio' action. (Recreate the action CHECK to include
--    every action we now use. If your constraint has a different name, swap it
--    into the DROP line - find it with:
--      SELECT conname FROM pg_constraint
--      WHERE conrelid='zone_commands'::regclass AND contype='c';)
ALTER TABLE zone_commands DROP CONSTRAINT IF EXISTS zone_commands_action_check;
ALTER TABLE zone_commands ADD CONSTRAINT zone_commands_action_check
  CHECK (action IN ('start','stop','restart','rebuild','swap-lvl-lio'));

-- 3. Per-zone map inventory the daemon upserts (one row per "<server>:<zone>").
--    Read by the API with the service-role client, so no RLS policy is needed.
CREATE TABLE IF NOT EXISTS zone_maps (
  id          text PRIMARY KEY,           -- "<server_key>:<zone_key>", e.g. "serverA:usl"
  server_key  text,
  zone_key    text,
  current_cfg text,
  current_lvl text,
  current_lio text,
  zone_name   text,
  cfgs        jsonb DEFAULT '[]'::jsonb,   -- [{cfg,lvl,lio}, ...]
  lvls        jsonb DEFAULT '[]'::jsonb,   -- ["map.lvl", ...]
  lios        jsonb DEFAULT '[]'::jsonb,   -- ["map.lio", ...]
  updated_at  timestamptz
);
