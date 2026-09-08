-- ============================================================================
-- Backfill: web sign-ups stuck at registration_status = 'pending'
-- ============================================================================
-- Web sign-up collects an alias + password up front but never set
-- registration_status, so those profiles kept the 'pending' default and were
-- hidden from admin player pickers (which filter on 'completed'). The code now
-- sets 'completed' on sign-up; this fixes the accounts created before that.
--
-- Rows left alone:
--   * 'pending_verification' — in-game invites that haven't finished
--     /auth/complete-registration (they genuinely aren't done)
--   * anything with no alias yet (OAuth accounts mid-setup)
--   * 'failed'
-- ============================================================================

-- Preview how many rows this touches:
SELECT count(*) AS will_complete
FROM public.profiles
WHERE COALESCE(registration_status, 'pending') = 'pending'
  AND in_game_alias IS NOT NULL
  AND btrim(in_game_alias) <> '';

UPDATE public.profiles
   SET registration_status = 'completed',
       updated_at = now()
 WHERE COALESCE(registration_status, 'pending') = 'pending'
   AND in_game_alias IS NOT NULL
   AND btrim(in_game_alias) <> '';

-- Check:
-- SELECT registration_status, count(*) FROM public.profiles GROUP BY 1;
