--This user is handy for creating legacy squads
-- Create system user in auth.users table
  INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      role,
      aud,
      confirmation_token,
      email_change_token_new,
      email_change_confirm_status,
      banned_until,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      last_sign_in_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      email_change_token_current,
      email_change_sent_at,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
  ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'system@historicalrecords.internal',
      '$2a$10$dummy.encrypted.password.hash',
      NOW(),
      NOW(),
      NOW(),
      'authenticated',
      'authenticated',
      '',
      '',
      0,
      NULL,
      '{"provider": "system", "providers": ["system"]}',
      '{"name": "System"}',
      false,
      NULL,
      NULL,
      NULL,
      '',
      '',
      NULL,
      '',
      NULL,
      '',
      NULL,
      false,
      NULL
  )
  RETURNING id;
  --7066f090-a1a1-4f5f-bf1a-374d0e06130c


   -- Create system profile using the user ID
  INSERT INTO profiles (
      id,
      email,
      in_game_alias,
      registration_status
  )
  SELECT
      u.id,
      u.email,
      'System',
      'approved'
  FROM auth.users u
  WHERE u.email = 'system@historicalrecords.internal'
  ON CONFLICT (id) DO NOTHING
  RETURNING id;
  --7066f090-a1a1-4f5f-bf1a-374d0e06130c

  -- Get the system user ID
  SELECT id FROM auth.users WHERE email =
  'system@historicalrecords.internal';


    -- Test 3: Check if System user exists and has proper access
  SELECT
      id,
      in_game_alias,
      email,
      created_at
  FROM profiles
  WHERE id = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';

     -- Test 3: Check if System user exists and is admin
  SELECT
      id,
      in_game_alias,
      email,
      is_admin,
      ctf_role,
      created_at
  FROM profiles
  WHERE id = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';


     -- Make System user an admin
  UPDATE profiles
  SET
      is_admin = true,
      ctf_role = 'ctf_admin'
  WHERE id = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';