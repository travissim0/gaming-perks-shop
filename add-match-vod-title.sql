-- ============================================================================
-- Match video title
--
-- The match page's "Add video" form saves a link and a title. The link column
-- (matches.vod_url) exists, but the title column was never created, so saving
-- a video failed with "Could not find the 'vod_title' column of 'matches'".
-- Safe to run more than once.
-- ============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS vod_title TEXT;

-- Tell the API layer about the new column right away.
NOTIFY pgrst, 'reload schema';
