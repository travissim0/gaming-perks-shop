-- Insert current season record
  INSERT INTO ctfpl_seasons (season_number, season_name, status,      
  start_date)
  VALUES (2024, '2024 CTFPL Championship Season', 'active',
  '2024-01-01')
  ON CONFLICT (season_number) DO NOTHING;