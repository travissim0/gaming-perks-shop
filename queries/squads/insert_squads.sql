-- Test 2: Test basic squad insertion with System user
  INSERT INTO squads (
      name,
      tag,
      is_active,
      captain_id,
      description,
      is_legacy
  ) VALUES (
      'Test Historical Squad',
      'TEST',
      false,
      '7066f090-a1a1-4f5f-bf1a-374d0e06130c',
      'Test squad for policy debugging',
      true
  ) RETURNING id, name, tag;


    -- Test creating legacy squad with System user
  INSERT INTO squads (
      name,
      tag,
      is_active,
      captain_id,
      description,
      is_legacy
  ) VALUES (
      'Test Historical Squad Final',
      'TSTF',
      false,
      '7066f090-a1a1-4f5f-bf1a-374d0e06130c',
      'Test squad for policy debugging',
      true
  ) RETURNING id, name, tag;


  -- Remove the test squad
  DELETE FROM squads
  WHERE name = 'Test Historical Squad Final'
  AND captain_id = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';