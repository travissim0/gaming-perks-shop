-- Roster lock support for non-CTFPL leagues (CTFDL, OVDL, etc.)
-- CTFPL continues to use season_roster_locks + ctfpl_seasons.
-- Run this in Supabase SQL Editor after leagues and league_seasons exist.

-- 1. Create league_season_roster_locks table
CREATE TABLE IF NOT EXISTS league_season_roster_locks (
  id SERIAL PRIMARY KEY,
  league_season_id UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_current BOOLEAN DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_league_season_roster_locks_league_season_id
  ON league_season_roster_locks(league_season_id);
CREATE INDEX IF NOT EXISTS idx_league_season_roster_locks_current
  ON league_season_roster_locks(league_season_id, is_current) WHERE is_current = true;

-- 2. RLS
ALTER TABLE league_season_roster_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league_season_roster_locks_read"
  ON league_season_roster_locks FOR SELECT USING (true);

CREATE POLICY "league_season_roster_locks_admin_write"
  ON league_season_roster_locks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.site_admin = true OR profiles.is_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.site_admin = true OR profiles.is_admin = true)
    )
  );

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION update_league_season_roster_locks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS league_season_roster_locks_updated_at ON league_season_roster_locks;
CREATE TRIGGER league_season_roster_locks_updated_at
  BEFORE UPDATE ON league_season_roster_locks
  FOR EACH ROW
  EXECUTE FUNCTION update_league_season_roster_locks_updated_at();

-- 4. Cancel pending invites when locking (same behavior as CTFPL)
CREATE OR REPLACE FUNCTION cancel_invites_on_league_roster_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR OLD.is_locked = false) THEN
    UPDATE squad_invites
    SET status = 'cancelled',
        responded_at = NOW()
    WHERE status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cancel_invites_on_league_roster_lock ON league_season_roster_locks;
CREATE TRIGGER trigger_cancel_invites_on_league_roster_lock
  AFTER UPDATE ON league_season_roster_locks
  FOR EACH ROW
  EXECUTE FUNCTION cancel_invites_on_league_roster_lock();

-- 5. Set current roster lock (history-friendly, same pattern as set_season_roster_lock)
CREATE OR REPLACE FUNCTION set_league_season_roster_lock(
  p_league_season_id UUID,
  p_is_locked BOOLEAN,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := COALESCE(p_user_id, auth.uid());

  UPDATE league_season_roster_locks
  SET is_current = false
  WHERE league_season_id = p_league_season_id;

  INSERT INTO league_season_roster_locks (
    league_season_id, is_locked, locked_at, unlocked_at,
    locked_by, reason, is_current
  ) VALUES (
    p_league_season_id, p_is_locked,
    CASE WHEN p_is_locked THEN NOW() ELSE NULL END,
    CASE WHEN NOT p_is_locked THEN NOW() ELSE NULL END,
    current_user_id, p_reason, true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
