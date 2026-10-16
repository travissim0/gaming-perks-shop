-- Crew no-shows: an admin marks a referee / commentator / recorder who signed up for a match
-- but didn't work it. Set by hand only (the site can't see a spectating ref), admin-only to read.
-- Shown in CTF management → Crew (src/components/admin/CrewPanel.tsx, /api/admin/crew).

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS no_show       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_by    UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS no_show_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_note  TEXT;
