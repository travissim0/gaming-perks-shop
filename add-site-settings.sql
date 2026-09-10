-- Staff-managed settings the site reads at runtime (Discord app id/secret,
-- CTFPL server id, …) so they can be set from /admin/ctf-management without
-- access to the hosting dashboard. Environment variables, when present, win.
-- RLS on, no browser policies: only service-role routes read/write this.

CREATE TABLE IF NOT EXISTS public.site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES public.profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
