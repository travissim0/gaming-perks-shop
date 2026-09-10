-- News bylines: replace any real name / email stored in news_posts.author_name
-- with the poster's in-game alias. Going forward the server sets author_name
-- from the alias, so this is a one-off for existing rows.

UPDATE public.news_posts np
SET    author_name = p.in_game_alias
FROM   public.profiles p
WHERE  p.id = np.author_id
  AND  p.in_game_alias IS NOT NULL
  AND  np.author_name IS DISTINCT FROM p.in_game_alias;

-- Posts with no author_id can't be matched to a profile. Check for any that
-- still carry a real name and fix them by hand:
SELECT id, title, author_name, author_id FROM public.news_posts ORDER BY created_at DESC;
