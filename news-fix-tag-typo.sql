-- Optional: fix the "Annoucement" tag typo across all news posts.
UPDATE public.news_posts
SET    tags = array_replace(tags, 'Annoucement', 'Announcement')
WHERE  'Annoucement' = ANY(tags);
