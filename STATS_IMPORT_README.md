# Player Stats CSV Import System

This system allows you to import historical player statistics from CSV files into your gaming perks shop database.

## Overview

The import system consists of two main components:
1. **CSV Import Script** (`import-player-stats-csv.js`) - Processes CSV files and imports them into the database
2. **Sync Script** (`sync-stats-from-server.ps1`) - Downloads CSV files from your Linux server and runs the import

## Features

- ✅ **Selective Import**: Only processes CSV files with "ovd" in the filename
- ✅ **Graceful Handling**: Missing fields are filled with appropriate default values
- ✅ **Duplicate Prevention**: Skips games that are already in the database
- ✅ **Batch Processing**: Handles large files efficiently
- ✅ **Error Reporting**: Detailed logging and error reporting
- ✅ **Automatic Aggregation**: Database triggers automatically update player aggregate stats

## CSV Format

Your CSV files should have the following columns (from your example):

```csv
PlayerName,Team,Kills,Deaths,Captures,CarrierKills,CarryTimeSeconds,GameLengthMinutes,Result,MainClass,ClassSwaps,TurretDamage,GameMode,Side,BaseUsed
```

### Required Fields
- `PlayerName` - Player's in-game name (required)

### Optional Fields (will use defaults if missing)
- `Team` - Team name
- `Kills` - Number of kills (default: 0)
- `Deaths` - Number of deaths (default: 0)
- `Captures` - Flag captures (default: 0)
- `CarrierKills` - Carrier kills (default: 0)
- `CarryTimeSeconds` - Time carrying flag in seconds (default: 0)
- `GameLengthMinutes` - Game duration in minutes (default: 0.0)
- `Result` - "Win" or "Loss" (default: null)
- `MainClass` - Player's primary class (default: null)
- `ClassSwaps` - Number of class changes (default: 0)
- `TurretDamage` - Turret damage dealt (default: 0)
- `GameMode` - Game mode (default: "OvD")
- `Side` - "offense" or "defense" (default: "N/A")
- `BaseUsed` - Base identifier (default: null)

### Missing Fields Handled Automatically
The following fields from your database schema will be set to defaults if not present in CSV:
- `eb_hits` - 0
- `accuracy` - 0.000
- `avg_resource_unused_per_death` - 0.00
- `avg_explosive_unused_per_death` - 0.00
- `arena_name` - null
- `game_date` - Extracted from filename or current date

## Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Environment Variables** (optional):
   ```bash
   # If not using defaults
   export NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

## Usage

### Method 1: Automatic Sync and Import (Recommended)

Use the PowerShell script to automatically download and import:

```powershell
# Full sync and import
.\sync-stats-from-server.ps1

# Preview what would happen (dry run)
.\sync-stats-from-server.ps1 -DryRun

# Only import existing files (skip download)
.\sync-stats-from-server.ps1 -ImportOnly

# Custom server settings
.\sync-stats-from-server.ps1 -ServerHost "your-server.com" -ServerUser "username"
```

### Method 2: Manual Import

1. **Copy CSV files** to the `imported-stats` directory:
   ```bash
   mkdir imported-stats
   # Copy your *ovd*.csv files here
   ```

2. **Run the import script**:
   ```bash
   node import-player-stats-csv.js
   ```

## File Naming Convention

The import script extracts game metadata from filenames. For best results, use this format:
```
game_stats_MM_DD_YYYY_HH_MM_SS_ovd.csv
```

Example: `game_stats_06_10_2025_01_22_19_ovd.csv`

This will create:
- **Game ID**: `ovd_20250610_012219`
- **Game Date**: `2025-06-10T01:22:19Z`

## Database Schema Mapping

| CSV Column | Database Field | Type | Default |
|------------|----------------|------|---------|
| PlayerName | player_name | VARCHAR | Required |
| Team | team | VARCHAR | null |
| Kills | kills | INTEGER | 0 |
| Deaths | deaths | INTEGER | 0 |
| Captures | captures | INTEGER | 0 |
| CarrierKills | carrier_kills | INTEGER | 0 |
| CarryTimeSeconds | carry_time_seconds | INTEGER | 0 |
| GameLengthMinutes | game_length_minutes | DECIMAL | 0.00 |
| Result | result | VARCHAR | null |
| MainClass | main_class | VARCHAR | null |
| ClassSwaps | class_swaps | INTEGER | 0 |
| TurretDamage | turret_damage | INTEGER | 0 |
| GameMode | game_mode | VARCHAR | "OvD" |
| Side | side | VARCHAR | "N/A" |
| BaseUsed | base_used | VARCHAR | null |

## Error Handling

The import script handles various error conditions:

- **Missing required fields**: Skips row with error message
- **Invalid data types**: Converts to appropriate type or uses default
- **Duplicate games**: Skips entire file if game ID already exists
- **Database errors**: Reports batch failures and continues

## Monitoring

The script provides detailed logging:

```
🚀 Starting CSV import process...
📁 Looking for CSV files in: ./imported-stats
📋 Found 3 OvD CSV files to process:
   - game_stats_06_10_2025_01_22_19_ovd.csv

📊 Processing: game_stats_06_10_2025_01_22_19_ovd.csv
🎮 Game ID: ovd_20250610_012219
📅 Game Date: 2025-06-10T01:22:19Z
📈 Parsed 10 valid rows
💾 Inserting 10 records in batches of 100...
✅ Batch 1: 10 records inserted
📊 Final results: 10 inserted, 0 failed

🎉 Import process completed!
📊 Summary:
   Files processed: 1
   Total records processed: 10
   Total errors: 0
```

## Troubleshooting

### Common Issues

1. **"No CSV files found"**
   - Ensure files have "ovd" in the filename
   - Check the `imported-stats` directory exists and contains CSV files

2. **"Game already exists"**
   - The script prevents duplicate imports
   - Delete existing records if you need to re-import

3. **"Player name is required"**
   - Ensure all rows have a valid PlayerName column

4. **Database connection errors**
   - Check your Supabase credentials
   - Verify network connectivity

### Manual Cleanup

If you need to remove imported data:

```sql
-- Remove specific game
DELETE FROM player_stats WHERE game_id = 'ovd_20250610_012219';

-- Remove all imported stats (careful!)
DELETE FROM player_stats WHERE game_id LIKE 'ovd_%';

-- Recalculate aggregates
DELETE FROM player_aggregate_stats;
-- Aggregates will be rebuilt automatically by triggers
```

## Integration with Live Stats

This import system works alongside your live stats streaming from CTFUtilities.cs:

- **Historical Data**: CSV imports for past games
- **Live Data**: Real-time streaming for current games
- **Unified View**: Both appear together in your stats pages

The database schema is designed to handle both sources seamlessly.

## Performance

- **Batch Size**: 100 records per batch (configurable)
- **Memory Usage**: Streams CSV files to avoid loading entire files into memory
- **Database Load**: Uses efficient batch inserts with error handling
- **Indexing**: Proper indexes ensure fast queries even with large datasets

## Next Steps

After importing your historical stats:

1. **Verify Data**: Check your stats pages to ensure data appears correctly
2. **Player Directory**: Consider implementing the player directory feature
3. **Analytics**: Add more advanced analytics and reporting features
4. **Automation**: Set up scheduled imports for regular stat dumps 