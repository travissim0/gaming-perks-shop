-- Season dates for the /league hero ("Registration closes Sep 20 · Draft Sep 27 · Week 3 · Playoffs")
-- plus a per-league Discord invite for the Community card.
--
-- start_date / end_date already exist on both season tables; this adds the
-- in-between milestones. All optional: the hero shows whatever is filled in.

ALTER TABLE public.league_seasons
  ADD COLUMN IF NOT EXISTS registration_closes_on DATE,
  ADD COLUMN IF NOT EXISTS draft_on               DATE,
  ADD COLUMN IF NOT EXISTS playoffs_start_on      DATE;

ALTER TABLE public.ctfpl_seasons
  ADD COLUMN IF NOT EXISTS registration_closes_on DATE,
  ADD COLUMN IF NOT EXISTS draft_on               DATE,
  ADD COLUMN IF NOT EXISTS playoffs_start_on      DATE;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS discord_url TEXT;

-- Optional: fill the CTFDL Discord invite now (or do it from /admin/ctf-management).
-- UPDATE public.leagues SET discord_url = 'https://discord.gg/XXXXXXX' WHERE slug = 'ctfdl';
