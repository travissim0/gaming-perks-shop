Usage Examples:

  1. Complete Reset (Fresh Start)

  -- Reset all standings for 2024 season - WARNING: This deletes      
  ALL data!
  SELECT * FROM sync_ctfpl_standings_with_active_squads(2024,
  false);

  2. Gentle Sync (Preserve Existing Stats)

  -- Add new active squads, remove inactive ones, but keep
  existing match data
  SELECT * FROM sync_ctfpl_standings_with_active_squads(2024,
  true);

  3. Check Current Status

  -- See what needs to be synced
  SELECT * FROM get_ctfpl_sync_status(2024);

  4. Reset Individual Squad

  -- Reset just one squad's stats to 0
  SELECT reset_squad_standings(2024, 'squad-uuid-here');

  5. View Results

  -- See current standings after sync
  SELECT rank, squad_name, squad_tag, matches_played, points
  FROM ctfpl_standings_with_rankings
  WHERE season_number = 2024
  ORDER BY rank;

  Function Outputs:

  sync_ctfpl_standings_with_active_squads() returns:

  | action          | squad_id | squad_name    | squad_tag |
  |-----------------|----------|---------------|-----------|
  | RESET_AND_ADDED | uuid     | Team Alpha    | [ALPH]    |
  | ADDED           | uuid     | Team Beta     | [BETA]    |
  | REMOVED         | uuid     | Inactive Team | [INAC]    |

  get_ctfpl_sync_status() returns:

  | status_type            | count | details
         |
  |------------------------|-------|-----------------------------     
  -------|
  | missing_from_standings | 2     | Active squads not yet in
  standings |
  | inactive_in_standings  | 1     | Inactive squads still in
  standings |
  | squads_with_stats      | 0     | Squads with actual match
  data      |
  | total_in_standings     | 4     | Total squads in standings        
         |

  Recommended Workflow:

  1. Check status first: SELECT * FROM
  get_ctfpl_sync_status(2024);
  2. If season hasn't started: Use reset mode to get clean slate      
  3. If season is active: Use sync mode to preserve match data        
  4. Individual corrections: Use reset_squad_standings() for
  specific squads