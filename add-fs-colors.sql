-- FS Red / FS Green (CTFDL S5 rules update, 2026-10-02).
-- matches.fs_color: what the two captains declared when the FS match was booked.
-- league_matches.fs_color: what the result SCORES as (a Green match in which a round 1-3
-- pick played is recorded as red). NULL means red.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS fs_color TEXT CHECK (fs_color IS NULL OR fs_color IN ('red', 'green'));
ALTER TABLE public.league_matches
  ADD COLUMN IF NOT EXISTS fs_color TEXT CHECK (fs_color IS NULL OR fs_color IN ('red', 'green'));
