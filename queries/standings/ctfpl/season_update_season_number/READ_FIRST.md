Usage Examples:

  1. Check Season Before Renaming

  -- See what's in season 2024 before renaming
  SELECT * FROM get_season_info(2024);

  2. Simple Season Renumber

  -- Rename season 2024 to 2025
  SELECT * FROM renumber_ctfpl_season(2024, 2025);

  3. Renumber with New Season Name

  -- Rename season 2024 to 2025 with new name
  SELECT * FROM renumber_ctfpl_season(2024, 2025, '2025 Spring        
  Championship');

  4. Check Results

  -- Verify the rename worked
  SELECT * FROM get_season_info(2025);
  SELECT rank, squad_name, points FROM
  ctfpl_standings_with_rankings WHERE season_number = 2025;

  5. Merge Duplicate Seasons (if needed)

  -- If you accidentally created duplicates, merge them
  SELECT * FROM merge_ctfpl_seasons(2024, 2025, 'ADD_STATS');

  Function Returns:

  renumber_ctfpl_season() returns:

  | table_name      | records_updated | status
                               |
  |-----------------|-----------------|--------------------------     
  -----------------------------|
  | ctfpl_standings | 4               | Successfully updated
                               |
  | ctfpl_seasons   | 1               | Successfully updated
                               |
  | SUMMARY         | 5               | Season 2024 renamed to        
  2025. Total records updated: 5 |

  get_season_info() returns:

  | table_name        | record_count | details
             |
  |-------------------|--------------|---------------------------     
  -----------|
  | ctfpl_standings   | 4            | Standings records for
  season 2024    |
  | ctfpl_seasons     | 1            | Season name: 2024 CTFPL        
  Championship |
  | squads_with_stats | 0            | Squads that have played        
  matches      |