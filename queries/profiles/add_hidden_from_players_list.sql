-- Add column so admins can hide profiles from the Squads → Players list.
-- Run this in the Supabase SQL Editor. The table appears as "profiles" in the dashboard (public schema).
-- If you don't see a "profiles" table, create it first or skip this; the app will still work without the column.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hidden_from_players_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.hidden_from_players_list IS 'When true, profile is excluded from the Squads → Players list. Set by admins to remove Unknown/0-stat entries.';
