-- Admin "Delete account" (used by /admin/users -> /api/admin/delete-account).
--
-- admin_account_delete_plan(user)  read-only: every row that points at the account and what
--                                  deleting it will do (deleted / unlinked / blocked).
-- admin_delete_account(user)       does the delete in one transaction. Any error rolls the whole
--                                  thing back, so a failed delete changes nothing.
--
-- What the delete does, in order:
--   1. Removes the user's squad_members rows while the profile still exists. The squad_members
--      delete trigger logs a "left squad" player_event for the profile; if that ran as part of the
--      profile cascade instead, the event insert fails its FK and the whole delete aborts.
--   2. Refuses if the user captains an active squad (hand the squad over first).
--   3. For links that would otherwise BLOCK the delete (NO ACTION / RESTRICT) on nullable columns,
--      blanks the link (e.g. created_by on a draft). NOT NULL blockers refuse with their names.
--   4. Deletes auth.users -> profiles cascade -> every ON DELETE CASCADE / SET NULL link.
--
-- Both functions are SECURITY DEFINER and executable only by service_role (the API route).

CREATE OR REPLACE FUNCTION public.admin_account_delete_plan(p_user_id uuid)
RETURNS TABLE (table_name text, column_name text, row_count bigint, action text, note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  n bigint;
  n_active bigint;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           a.attname::text            AS col,
           c.confdeltype              AS deltype,
           a.attnotnull               AS not_null
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
      AND NOT (c.conrelid = 'public.profiles'::regclass AND a.attname = 'id')
    ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_user_id;
    CONTINUE WHEN n = 0;

    table_name := r.tbl;
    column_name := r.col;
    row_count := n;
    note := NULL;

    IF r.tbl = 'public.squads' AND r.col = 'captain_id' THEN
      SELECT count(*) INTO n_active FROM public.squads s
       WHERE s.captain_id = p_user_id AND s.is_active = true;
      IF n_active > 0 THEN
        row_count := n_active;
        action := 'blocked';
        note := 'Captains an active squad - transfer captaincy first';
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    IF r.deltype = 'c' THEN
      action := 'deleted';
    ELSIF r.deltype IN ('n', 'd') THEN
      action := 'unlinked';
    ELSIF NOT r.not_null THEN
      action := 'unlink_first';      -- blocker on a nullable column: blanked before the delete
    ELSE
      action := 'blocked';
      note := 'Required link with no delete rule - needs a manual decision';
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias   text;
  v_email   text;
  v_blocked text;
  v_plan    jsonb;
  r record;
BEGIN
  SELECT p.in_game_alias INTO v_alias FROM public.profiles p WHERE p.id = p_user_id;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_alias IS NULL AND v_email IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Account % not found', p_user_id;
  END IF;

  -- 1. Squad memberships first, so the leave-event trigger can still see the profile.
  DELETE FROM public.squad_members WHERE player_id = p_user_id;

  -- 2/3. Check blockers, then blank the nullable ones.
  SELECT string_agg(format('%s.%s (%s)', pl.table_name, pl.column_name,
                           coalesce(pl.note, pl.row_count || ' rows')), '; ')
    INTO v_blocked
    FROM public.admin_account_delete_plan(p_user_id) pl
   WHERE pl.action = 'blocked';
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete account: %', v_blocked;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(pl)), '[]'::jsonb) INTO v_plan
    FROM public.admin_account_delete_plan(p_user_id) pl;

  FOR r IN SELECT * FROM public.admin_account_delete_plan(p_user_id) pl WHERE pl.action = 'unlink_first' LOOP
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', r.table_name, r.column_name, r.column_name)
      USING p_user_id;
  END LOOP;

  -- 4. The account itself (profile cascades from auth.users; the second delete covers an orphan profile).
  DELETE FROM auth.users WHERE id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('user_id', p_user_id, 'alias', v_alias, 'email', v_email, 'plan', v_plan);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_account_delete_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_delete_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid)      TO service_role;
