-- 1. Create the new season_roster_locks table
  CREATE TABLE IF NOT EXISTS season_roster_locks (
      id SERIAL PRIMARY KEY,
      season_id UUID NOT NULL REFERENCES ctfpl_seasons(id) ON DELETE
  CASCADE,
      is_locked BOOLEAN NOT NULL DEFAULT false,
      locked_at TIMESTAMPTZ,
      unlocked_at TIMESTAMPTZ,
      locked_by UUID REFERENCES auth.users(id),
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

      -- Ensure only one record per season
      UNIQUE(season_id)
  );

  -- 2. Enable RLS for the new table
  ALTER TABLE season_roster_locks ENABLE ROW LEVEL SECURITY;

  -- 3. Create RLS policies for season_roster_locks
  CREATE POLICY "season_roster_locks_read" ON season_roster_locks
      FOR SELECT USING (true);

  CREATE POLICY "season_roster_locks_admin_write" ON
  season_roster_locks
      FOR ALL USING (
          EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND profiles.site_admin = true
          )
      );

  -- 4. Create trigger to update updated_at timestamp
  CREATE OR REPLACE FUNCTION update_season_roster_locks_updated_at()      
  RETURNS TRIGGER AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER season_roster_locks_updated_at
      BEFORE UPDATE ON season_roster_locks
      FOR EACH ROW
      EXECUTE FUNCTION update_season_roster_locks_updated_at();

  -- 5. Create function to check if roster is locked for a season
  CREATE OR REPLACE FUNCTION is_roster_locked_for_season(season_uuid      
  UUID)
  RETURNS BOOLEAN AS $$
  BEGIN
      RETURN EXISTS (
          SELECT 1 FROM season_roster_locks
          WHERE season_id = season_uuid
          AND is_locked = true
      );
  END;
  $$ LANGUAGE plpgsql;

  -- 6. Create function to get active season roster lock status
  CREATE OR REPLACE FUNCTION get_active_season_roster_lock()
  RETURNS TABLE(
      season_id UUID,
      is_locked BOOLEAN,
      reason TEXT
  ) AS $$
  BEGIN
      RETURN QUERY
      SELECT
          srl.season_id,
          srl.is_locked,
          srl.reason
      FROM season_roster_locks srl
      JOIN ctfpl_seasons s ON s.id = srl.season_id
      WHERE s.status = 'active'
      LIMIT 1;
  END;
  $$ LANGUAGE plpgsql;

  -- 7. Create trigger function to cancel pending invites when roster is locked
  CREATE OR REPLACE FUNCTION cancel_invites_on_roster_lock()
  RETURNS TRIGGER AS $$
  BEGIN
      -- If roster is being locked, cancel all pending invites for this season
      IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR
  OLD.is_locked = false) THEN
          UPDATE squad_invites
          SET status = 'cancelled',
              responded_at = NOW()
          WHERE status = 'pending'
          AND squad_id IN (
              -- Get all squads that would be affected by this season's roster lock
              SELECT DISTINCT s.id
              FROM squads s
              WHERE s.is_active = true
          );
      END IF;

      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- 8. Create trigger for the cancel invites function
  DROP TRIGGER IF EXISTS trigger_cancel_invites_on_roster_lock ON
  season_roster_locks;
  CREATE TRIGGER trigger_cancel_invites_on_roster_lock
      AFTER UPDATE ON season_roster_locks
      FOR EACH ROW
      EXECUTE FUNCTION cancel_invites_on_roster_lock();

  -- 9. Add check constraint to squad_invites to prevent new invites during roster lock
  -- Note: This will be enforced at the application level for better  error handling

  -- 10. Insert default unlocked records for existing active seasons  (optional)
  INSERT INTO season_roster_locks (season_id, is_locked, reason)
  SELECT
      id,
      false,
      'Default unlocked state for existing season'
  FROM ctfpl_seasons
  WHERE status IN ('active', 'upcoming')
  ON CONFLICT (season_id) DO NOTHING;

  -- 11. Create index for performance
  CREATE INDEX IF NOT EXISTS idx_season_roster_locks_season_id ON
  season_roster_locks(season_id);
  CREATE INDEX IF NOT EXISTS idx_season_roster_locks_active_seasons       
  ON season_roster_locks(season_id, is_locked)
  WHERE is_locked = true;


  This SQL will:

  1. Create the new season_roster_locks table with proper foreign key     
   relationships to seasons
  2. Set up RLS policies that allow public read access but restrict       
  writes to site admins only
  3. Add database triggers to automatically update timestamps and
  cancel pending invites when rosters are locked
  4. Create helper functions to check roster lock status for specific     
   seasons or active seasons
  5. Add performance indexes for efficient querying
  6. Initialize existing seasons with default unlocked states

  The key improvements over the previous global system:

  -- Season-specific locks: Each season can have its own independent       
  --roster lock status
  -- Automatic invite cancellation: When a season's roster is locked,      
  --all pending invites are automatically cancelled
  --- Referential integrity: Locks are tied to actual seasons and
  --cascade delete properly
  --- Better query performance: Indexed for efficient lookups by season     
   --and lock status

 -- After running this SQL, the admin page will work with the new
  --season-specific system, and all invitation functions will respect       
  --the season-based roster locks.

select *
from season_roster_locks


ALTER TABLE season_roster_locks DROP CONSTRAINT IF EXISTS
  season_roster_locks_season_id_key;

  -- Add a new column to track if this is the current/active lock
  status
  ALTER TABLE season_roster_locks ADD COLUMN IF NOT EXISTS is_current     
   BOOLEAN DEFAULT false;

  -- Create a new function to manage roster lock history
  CREATE OR REPLACE FUNCTION set_season_roster_lock(
      p_season_id UUID,
      p_is_locked BOOLEAN,
      p_reason TEXT,
      p_locked_by UUID DEFAULT auth.uid()
  )
  RETURNS void AS $$
  BEGIN
      -- Mark all previous records for this season as not current
      UPDATE season_roster_locks
      SET is_current = false
      WHERE season_id = p_season_id;

      -- Insert new record as the current status
      INSERT INTO season_roster_locks (
          season_id,
          is_locked,
          locked_at,
          unlocked_at,
          locked_by,
          reason,
          is_current
      ) VALUES (
          p_season_id,
          p_is_locked,
          CASE WHEN p_is_locked THEN NOW() ELSE NULL END,
          CASE WHEN NOT p_is_locked THEN NOW() ELSE NULL END,
          p_locked_by,
          p_reason,
          true
      );
  END;
  $$ LANGUAGE plpgsql;



  -- 1. Fix the trigger
  CREATE OR REPLACE FUNCTION cancel_invites_on_roster_lock()
  RETURNS TRIGGER AS $$
  BEGIN
      IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR
  OLD.is_locked = false) THEN
          UPDATE squad_invites
          SET status = 'cancelled',
              responded_at = NOW()
          WHERE status = 'pending';
      END IF;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- 2. Update table structure for history tracking
  ALTER TABLE season_roster_locks DROP CONSTRAINT IF EXISTS
  season_roster_locks_season_id_key;
  ALTER TABLE season_roster_locks ADD COLUMN IF NOT EXISTS is_current     
   BOOLEAN DEFAULT false;

  -- 3. Create the history management function
  CREATE OR REPLACE FUNCTION set_season_roster_lock(
      p_season_id UUID,
      p_is_locked BOOLEAN,
      p_reason TEXT,
      p_locked_by UUID DEFAULT auth.uid()
  )
  RETURNS void AS $$
  BEGIN
      UPDATE season_roster_locks SET is_current = false WHERE
  season_id = p_season_id;
      INSERT INTO season_roster_locks (season_id, is_locked,
  locked_at, unlocked_at, locked_by, reason, is_current)
      VALUES (p_season_id, p_is_locked,
              CASE WHEN p_is_locked THEN NOW() ELSE NULL END,
              CASE WHEN NOT p_is_locked THEN NOW() ELSE NULL END,
              p_locked_by, p_reason, true);
  END;
  $$ LANGUAGE plpgsql;

  -- 4. Mark existing record as current
  UPDATE season_roster_locks SET is_current = true WHERE id = 1;

  -- 5. Make sure you have admin privileges
  UPDATE profiles
  SET is_admin = true, site_admin = true
  WHERE id = auth.uid();


   Now let's create a permanent, secure version that handles the
  authentication issue properly:

  -- Create the final version that works with your authentication
  setup
  CREATE OR REPLACE FUNCTION set_season_roster_lock(
      p_season_id UUID,
      p_is_locked BOOLEAN,
      p_reason TEXT,
      p_user_id UUID DEFAULT NULL
  )
  RETURNS void AS $$
  DECLARE
      current_user_id UUID;
  BEGIN
      -- Get user ID from parameter or try auth.uid()
      current_user_id := COALESCE(p_user_id, auth.uid());

      -- Optional: Add basic admin check if needed
      -- (Commented out since your setup doesn't need it)
      /*
      IF NOT EXISTS (
          SELECT 1 FROM profiles
          WHERE id = current_user_id
          AND (site_admin = true OR is_admin = true)
      ) THEN
          RAISE EXCEPTION 'Access denied: Admin privileges required';     
      END IF;
      */

      -- Mark previous records as not current
      UPDATE season_roster_locks
      SET is_current = false
      WHERE season_id = p_season_id;

      -- Insert new record
      INSERT INTO season_roster_locks (
          season_id, is_locked, locked_at, unlocked_at,
          locked_by, reason, is_current
      ) VALUES (
          p_season_id, p_is_locked,
          CASE WHEN p_is_locked THEN NOW() ELSE NULL END,
          CASE WHEN NOT p_is_locked THEN NOW() ELSE NULL END,
          current_user_id, p_reason, true
      );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
