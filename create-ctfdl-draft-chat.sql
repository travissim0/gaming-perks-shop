-- ============================================================================
-- CTFDL draft chat — private to staff + the captains in that draft
-- ============================================================================
-- Run once in the Supabase SQL editor (after create-ctfdl-draft.sql). Idempotent.

CREATE TABLE IF NOT EXISTS public.ctfdl_draft_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    UUID NOT NULL REFERENCES public.ctfdl_drafts(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- NULL = system line
  kind        TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'system')),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ctfdl_draft_messages_draft_idx ON public.ctfdl_draft_messages (draft_id, created_at);

ALTER TABLE public.ctfdl_draft_messages ENABLE ROW LEVEL SECURITY;

-- Read: league staff, or the captain of a squad that is in this draft.
-- (No policy chain back to this table, so no recursion risk.)
DROP POLICY IF EXISTS ctfdl_draft_messages_read ON public.ctfdl_draft_messages;
CREATE POLICY ctfdl_draft_messages_read ON public.ctfdl_draft_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND (p.is_admin = true OR p.ctf_role = 'ctf_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.ctfdl_draft_teams dt
        JOIN public.squads s ON s.id = dt.squad_id
       WHERE dt.draft_id = ctfdl_draft_messages.draft_id AND s.captain_id = auth.uid()
    )
  );
-- Writes: none for clients; the /api/ctfdl/draft/chat route (service role) inserts.

-- Realtime (delivery respects the read policy above, so viewers never receive it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ctfdl_draft_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ctfdl_draft_messages;
  END IF;
END $$;

COMMENT ON TABLE public.ctfdl_draft_messages IS 'Private draft-room chat for CTFDL staff + captains; system lines record picks/pauses.';
