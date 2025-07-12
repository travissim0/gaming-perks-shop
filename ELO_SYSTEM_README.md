# ELO Ranking System

A comprehensive skill-based ranking system for your gaming community that provides fair and meaningful player rankings based on performance against opponents of similar skill levels.

## 🎯 Overview

The ELO system addresses the common problem where players with only 1-2 games show 100% win rates but aren't truly skilled. Our implementation uses:

- **Weighted ELO**: Combines raw ELO with confidence levels for fair rankings
- **Confidence System**: New players have lower confidence, reducing rating volatility
- **Tier System**: Visual ranking tiers from Unranked to Legend
- **Automatic Updates**: ELO updates automatically with each new game

## 🏆 How It Works

### Core Formula
```
New ELO = Old ELO + K-Factor × (Actual Score - Expected Score) × Confidence Multiplier

Where:
- K-Factor = 32 (standard chess ELO)
- Expected Score = 1 / (1 + 10^((Opponent ELO - Player ELO) / 400))
- Confidence Multiplier = min(games_played / 10, 1.0)
- Actual Score = 1 for win, 0 for loss
```

### Key Features

1. **Fair Starting Point**: All players start at 1200 ELO
2. **Confidence Building**: Rating confidence increases with games played
3. **Weighted Rankings**: Display rankings use weighted ELO (raw ELO × confidence + 1200 × (1 - confidence))
4. **Team-Based**: Calculates opponent strength based on team average ELO
5. **Peak Tracking**: Records highest ELO achieved

## 🎮 Tier System

| Tier | ELO Range | Color | Description |
|------|-----------|-------|-------------|
| Unranked | 0-999 | Gray | New or inactive players |
| Bronze | 1000-1199 | Bronze | Below average skill |
| Silver | 1200-1399 | Silver | Average skill (starting tier) |
| Gold | 1400-1599 | Gold | Above average skill |
| Platinum | 1600-1799 | Platinum | High skill level |
| Diamond | 1800-1999 | Light Blue | Very high skill |
| Master | 2000-2199 | Red | Elite players |
| Grandmaster | 2200-2399 | Purple | Top tier players |
| Legend | 2400-2800 | Orange | Legendary skill level |

## 🚀 Installation & Setup

### 1. Database Migration

**Option A: Manual (Recommended)**
```bash
# Show manual instructions
node run-elo-migration.js --manual
```

Then copy the SQL from `add-elo-system.sql` into Supabase SQL Editor and execute.

**Option B: Automated**
```bash
# Run automated migration (may have limitations)
node run-elo-migration.js
```

### 2. Recalculate Historical Data

```bash
# Recalculate ELO for all existing games
node recalculate-elo.js

# Check system status
node recalculate-elo.js --status

# Test API
node recalculate-elo.js --test
```

### 3. Import Historical Stats (Optional)

```bash
# Import CSV stats from your server
node import-remote-stats.js
```

## 📊 Database Schema

### New Columns in `player_aggregate_stats`
- `elo_rating` - Current ELO rating (800-2800)
- `elo_confidence` - Rating confidence (0.0-1.0)
- `elo_peak` - Highest ELO achieved
- `elo_last_updated` - Last ELO update timestamp

### New Columns in `player_stats`
- `elo_before` - ELO before this game
- `elo_after` - ELO after this game
- `elo_change` - ELO change from this game

### New View: `elo_leaderboard`
Comprehensive view combining player stats with ELO rankings and tier information.

### New View: `elo_leaderboard_agg`
Comprehensive view combining player stats with ELO rankings and tier information, but contains an aggregate of similar player names (case sensitivity and caps duplicates) and combines data together

## 🌐 API Endpoints

### GET `/api/player-stats/elo-leaderboard`

**Parameters:**
- `gameMode` - Filter by game mode (default: 'all')
- `sortBy` - Sort column (default: 'weighted_elo')
- `sortOrder` - 'asc' or 'desc' (default: 'desc')
- `minGames` - Minimum games played (default: 3)
- `playerName` - Search by player name
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:**
```bash
GET /api/player-stats/elo-leaderboard?gameMode=OvD&minGames=5&limit=20
```

### POST `/api/player-stats/elo-leaderboard`

**Recalculate ELO (Admin only):**
```json
{
  "action": "recalculate"
}
```

## 🎨 Frontend Components

### ELO Leaderboard Page
- **Location**: `/stats/elo`
- **Features**: Filtering, sorting, search, pagination
- **Responsive**: Works on desktop and mobile

### Integration with Stats Page
- ELO sorting options added to main stats page
- Default sort changed to weighted ELO

## 🔧 Configuration

### ELO Parameters (in SQL functions)
```sql
-- Adjustable parameters in calculate_elo_rating function
k_factor := 32.0;                    -- Rating change multiplier
confidence_games := 10.0;            -- Games needed for full confidence
min_elo := 800.0;                    -- Minimum possible ELO
max_elo := 2800.0;                   -- Maximum possible ELO
starting_elo := 1200.0;              -- Starting ELO for new players
```

### Tier Boundaries (in API)
```javascript
// Adjustable in src/app/api/player-stats/elo-leaderboard/route.ts
const tiers = [
  { name: 'Unranked', color: '#6B7280', min: 0, max: 999 },
  { name: 'Bronze', color: '#CD7F32', min: 1000, max: 1199 },
  // ... etc
];
```

## 📈 Usage Examples

### View ELO Leaderboard
```bash
# Visit in browser
http://localhost:3000/stats/elo
```

### Filter High-Skill Players
```bash
# Players with 10+ games, sorted by peak ELO
GET /api/player-stats/elo-leaderboard?minGames=10&sortBy=elo_peak
```

### Search Specific Player
```bash
# Find player by name
GET /api/player-stats/elo-leaderboard?playerName=Axidus
```

## 🛠 Maintenance

### Regular Tasks
1. **Monitor ELO Distribution**: Check tier balance
2. **Adjust Parameters**: Modify K-factor or confidence requirements if needed
3. **Recalculate**: Run recalculation after major data imports

### Troubleshooting

**ELO not updating for new games:**
- Check if trigger is active: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_update_player_elo';`
- Verify function exists: `SELECT * FROM pg_proc WHERE proname = 'update_player_elo';`

**Leaderboard showing incorrect data:**
- Refresh materialized view if using one
- Check ELO confidence calculations
- Verify weighted ELO formula

**Performance issues:**
- Add indexes on ELO columns (included in migration)
- Consider pagination limits
- Monitor query performance

## 🎯 Benefits

### For Players
- **Fair Rankings**: Skill-based rather than just win count
- **Progression**: Clear advancement through tiers
- **Confidence**: Ratings stabilize as you play more games
- **Competition**: Meaningful matches against similar skill levels

### For Community
- **Balanced Matches**: ELO can be used for matchmaking
- **Engagement**: Players motivated to improve rankings
- **Recognition**: Top players clearly identified
- **Analytics**: Rich data for community insights

## 🔮 Future Enhancements

### Potential Additions
1. **Seasonal Rankings**: Reset ELO periodically
2. **Decay System**: Reduce ELO for inactive players
3. **Placement Matches**: Special handling for new players
4. **Team ELO**: Squad-based rankings
5. **ELO History**: Track rating changes over time
6. **Matchmaking**: Use ELO for balanced games

### Advanced Features
1. **Multiple Game Modes**: Separate ELO per mode
2. **Role-Based ELO**: Different ratings for different classes
3. **Tournament Integration**: Special ELO events
4. **Prediction System**: Forecast match outcomes

## 📞 Support

If you encounter issues:

1. **Check Status**: `node recalculate-elo.js --status`
2. **View Logs**: Check console output for errors
3. **Manual Migration**: Use `--manual` flag if automated fails
4. **Database Access**: Verify Supabase permissions
5. **API Testing**: Test endpoints directly

The ELO system provides a robust foundation for competitive gaming rankings that grows with your community! 