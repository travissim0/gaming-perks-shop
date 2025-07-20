-- Get the table structure and constraints
  SELECT
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
  FROM information_schema.columns
  WHERE table_name = 'squads'
      AND table_schema = 'public'
  ORDER BY ordinal_position;