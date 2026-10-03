-- Per-match zone automation switch. When manual_zone is true the match is left out of the
-- zone queue, so the zone opens no arena, places nobody and applies no subs for it; staff
-- and referees run that match by hand. The site-wide switch is the ZONE_AUTOMATION setting
-- in CTF management (Season tab).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS manual_zone boolean NOT NULL DEFAULT false;
