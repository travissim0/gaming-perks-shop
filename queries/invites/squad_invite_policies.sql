-- Check total pending invites
  SELECT COUNT(*) as pending_count
  FROM squad_invites
  WHERE status = 'pending';

  SELECT
      si.id,
      si.created_at,
      si.expires_at,
      si.status,
      s.name as squad_name,
      s.tag as squad_tag,
      p.in_game_alias as invited_player_alias,
      p.email as invited_player_email
  FROM squad_invites si
  LEFT JOIN squads s ON s.id = si.squad_id
  LEFT JOIN profiles p ON p.id = si.invited_player_id
  WHERE si.status = 'pending'
  ORDER BY si.created_at DESC;


   SELECT status, COUNT(*) as count
  FROM squad_invites
  GROUP BY status
  ORDER BY count DESC;


   SELECT
      COUNT(*) as expired_pending_count
  FROM squad_invites
  WHERE status = 'pending'
  AND expires_at < NOW();


  -- Check current RLS policies on squad_invites table
  SELECT schemaname, tablename, policyname, permissive, roles, cmd,       
  qual
  FROM pg_policies
  WHERE tablename = 'squad_invites';


   CREATE POLICY "squad_invites_admin_read" ON squad_invites
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND profiles.site_admin = true
          )
      );

       SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE tablename = 'profiles' AND policyname =
  'profiles_read_admin_status';

CREATE POLICY "profiles_read_admin_status" ON profiles
      FOR SELECT USING (true);


SELECT
      COUNT(*) as expired_pending_count,
      MIN(expires_at) as oldest_expiry,
      MAX(expires_at) as newest_expiry
  FROM squad_invites
  WHERE status = 'pending'
  AND expires_at < NOW();

  -- Update expired pending invites to 'expired' status
  UPDATE squad_invites
  SET
      status = 'expired',
      responded_at = expires_at  -- Set responded_at to when they
  expired
  WHERE status = 'pending'
  AND expires_at < NOW();

  -- Verify the update worked
  SELECT status, COUNT(*) as count
  FROM squad_invites
  GROUP BY status
  ORDER BY count DESC;

  This will:
  1. Show you how many expired invites exist and their date range
  2. Update all expired pending invites to have status = 'expired'        
  3. Set the responded_at timestamp to when they actually expired
  4. Show you the final count by status

  You might also want to add a database trigger to automatically
  expire invites:

  -- Create function to automatically expire old invites
  CREATE OR REPLACE FUNCTION expire_old_invites()
  RETURNS void AS $$
  BEGIN
      UPDATE squad_invites
      SET
          status = 'expired',
          responded_at = expires_at
      WHERE status = 'pending'
      AND expires_at < NOW();
  END;
  $$ LANGUAGE plpgsql;


  CREATE OR REPLACE FUNCTION expire_old_squad_invites()
  RETURNS INTEGER AS $$
  DECLARE
      expired_count INTEGER;
  BEGIN
      UPDATE squad_invites
      SET
          status = 'expired',
          responded_at = expires_at
      WHERE status = 'pending'
      AND expires_at < NOW();

      GET DIAGNOSTICS expired_count = ROW_COUNT;
      RETURN expired_count;
  END;
  $$ LANGUAGE plpgsql;