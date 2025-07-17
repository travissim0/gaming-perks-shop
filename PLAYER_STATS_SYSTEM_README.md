# Player Statistics System

This system provides comprehensive player performance tracking with both local file storage and web-based analytics.

## System Components

### 1. Database Schema
- **File**: `setup-player-stats-table.sql`
- **Tables**:
  - `player_stats`: Individual game records with detailed stats
  - `player_aggregate_stats`: Calculated totals and averages per player/game mode
  - `player_stats_normalized_by_mode`: Calculated totals and averages per player/game mode WITH duplicate case-sensitive names grouped together with all stats combined.
  - `player_stats_normalized_by_mode`: Calculated totals and averages per player/game mode WITH duplicate case-sensitive names grouped together with all stats combined AND all player aliases.
  ----includes combined game mode (OvD + Mix)
- **Features**: Automatic aggregate calculation via triggers, RLS policies

### 2. Game Server Integration (CTF.cs)
- **Dual Storage**: Maintains both CSV file export AND API submission
- **Stats Tracked**:
  - Basic: Kills, Deaths, Captures, Carrier Kills, Carry Time
  - Advanced: Accuracy, Resource/Explosive usage, EB Hits, Turret Damage
  - Meta: Game Mode, Arena, Base Used, Side (Offense/Defense), Result

### 3. API Endpoints

#### POST `/api/player-stats`
- Receives player stats from game server
- Validates and sanitizes data
- Inserts into database with automatic aggregate updates

#### GET `/api/player-stats/leaderboard`
- Retrieves aggregate stats with filtering and pagination
- **Filters**: Game mode, date range, player name search
- **Sorting**: All major stats (kills, K/D, win rate, etc.)
- **Response**: Paginated leaderboard data

#### GET `/api/player-stats/player/{name}`
- Individual player profile with detailed breakdown
- Recent game history
- Per-game-mode statistics
- Performance metrics

### 4. Web Interface

#### `/stats` - Leaderboard Page
- **Features**:
  - Sortable columns for all stats
  - Game mode filtering
  - Date range filtering (day, week, month, year, all-time)
  - Player name search
  - Pagination with load-more
  - Responsive design with distinctive purple/blue theme

#### `/stats/player/{name}` - Individual Player Page
- **Features**:
  - Comprehensive stats overview
  - Recent games table with per-game breakdown
  - All-time statistics by game mode
  - Performance metrics and calculated averages
  - Filtering by game mode and date range

## Data Flow

1. **Game End**: CTF.cs calculates all player stats
2. **Dual Export**: 
   - Writes CSV file to local storage (debugging/backup)
   - Sends JSON payload to `/api/player-stats` endpoint
3. **Database Storage**: API validates and stores in Supabase
4. **Aggregate Updates**: Database triggers automatically update aggregate tables
5. **Web Display**: Frontend queries aggregated data for real-time leaderboards

## Key Features

### Advanced Statistics
- **Accuracy**: Best weapon accuracy per game
- **Resource Efficiency**: Average unused resources (stims, charges, etc.) per death
- **Explosive Efficiency**: Average unused explosives (frags, WPs) per death
- **EB Hits**: Energy blast hits tracking
- **Turret Damage**: Damage dealt to turrets

### Performance Metrics
- **K/D Ratio**: Kill/Death ratio with safe division
- **Win Rate**: Percentage of games won
- **Average Stats**: Per-game averages for all major metrics
- **Carry Time**: Flag carrying time tracking

### Filtering & Analysis
- **Game Mode Breakdown**: Stats separated by OvD, Mix, CTF, Pub, etc.
- **Time-based Analysis**: Performance trends over different time periods
- **Side Analysis**: Offense vs Defense performance tracking
- **Class Analysis**: Performance by player class/role

## Installation & Setup

### 1. Database Setup
```sql
-- Run the setup script in Supabase
\i setup-player-stats-table.sql
```

### 2. Environment Variables
Ensure these are set in your environment:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

### 3. Game Server Configuration
- Update `STATS_API_ENDPOINT` in `CTFUtilities.cs` if needed
- Ensure `CTFGameType.PlayerStatsIntegration` is included

### 4. Web Deployment
The stats pages are automatically available at:
- `/stats` - Main leaderboard
- `/stats/player/{playerName}` - Individual player pages

## Debugging & Maintenance

### File Exports
- CSV files continue to be generated locally for debugging
- Compare file data with database entries to verify integrity
- Files can be used for historical data import if needed

### API Monitoring
- Check console logs for API submission success/failure
- Monitor database for proper aggregate calculations
- Use Supabase dashboard for data verification

### Performance Considerations
- Database indexes on `player_name`, `game_mode`, and `game_date`
- Pagination limits prevent large data transfers
- Aggregate tables reduce query complexity for leaderboards

## Visual Design

The stats interface features a distinct visual theme:
- **Colors**: Purple/blue gradients with cyan accents
- **Layout**: Glass-morphism cards with backdrop blur
- **Animations**: Smooth transitions and loading states
- **Responsive**: Mobile-friendly design
- **Accessibility**: Clear contrast and readable fonts

This creates a visually distinct section while maintaining consistency with the overall site design. 