  -- Add all active squads to current season with 0 stats

  -- View current standings (will now show all squads, even with 0 stats)
  SELECT * FROM ctfpl_standings_with_rankings WHERE season_number     
   = 2024;

  -- Finalize a season and set winners (when season ends)
  SELECT finalize_ctfpl_season(2024, '2024 Championship Season');     

  -- View season winners
  SELECT * FROM ctfpl_seasons_with_winners WHERE season_number =      
  2024;

  -- Start a new season
  INSERT INTO ctfpl_seasons (season_number, season_name, status,      
  start_date)
  VALUES (2025, '2025 CTFPL Spring Season', 'upcoming',
  '2025-01-01');

  Key Features:

  ✅ Safe squad insertion - Won't overwrite existing data✅ Tie       
  support - Multiple squads can share positions✅ Flexible 
  seasons - Track multiple seasons with winners✅ Rich data -
  Season stats, dates, and status tracking✅ Easy management -        
  Helper function to finalize seasons✅ Public access - Read-only     
   for standings display

  This setup will show all 4 active squads in your standings
  (even with 0 stats) and provide a comprehensive season
  management system!