# 🚀 Quick Start: Enhanced Triple Threat Stats

## ⚡ 3-Step Deployment

### Step 1: Database (5 minutes)
Open Supabase SQL Editor and run **in this order**:

1. **`expand-tt-player-stats-schema.sql`** - Adds new columns
2. **`tt-player-stats-rpc-functions.sql`** - Creates functions

### Step 2: Game Server (10 minutes)
In your `USLMain.cs`, add these calls:

```csharp
// When series starts (best-of begins)
TripleThreatStats.StartNewSeries(team1._name, team2._name);

// When each game starts
TripleThreatStats.StartGame();

// After series ends and SendSeriesStats() is called
TripleThreatStats.ResetSeries();
```

### Step 3: Test (2 minutes)
1. Play a game on MoloTeamFights.lvl
2. Visit http://localhost:3000/triple-threat/stats
3. Click your player name
4. See your detailed stats!

---

## ✨ What You Get

### Player Profile Modal
Click any player name to see:
- **Overview**: Total wins/losses, K/D ratio
- **Recent Games**: Last 20 games with class, accuracy, opponent
- **Series History**: All series played with game counts
- **Class Breakdown**: Performance stats per vehicle

### Enhanced Stats Page
- Stat cards showing totals (games, players, series, avg K/D)
- Clickable player names
- Detailed game records stored for analysis

### Dual Table System
- **`tt_player_stats`**: Every game recorded with full details
- **`tt_player_records`**: Aggregate totals for leaderboards

---

## 📊 What Gets Tracked

### Per Game
- Kills & Deaths
- Class/Vehicle used
- Accuracy (if available)
- Teammates
- Opponent team
- Game duration
- Win/Loss result
- Series context (series ID, game number)

### Aggregate
- Total game wins/losses
- Total series wins/losses
- Cumulative K/D
- Win rates

---

## 🎯 Key Files Created

### Database
- `expand-tt-player-stats-schema.sql`
- `tt-player-stats-rpc-functions.sql`

### Backend (Already Updated)
- `src/app/api/triple-threat/game-stats/route.ts` *(modified)*
- `src/app/api/triple-threat/player-games/route.ts` *(new)*
- `src/app/api/triple-threat/series-analysis/route.ts` *(new)*
- `src/app/api/triple-threat/class-stats/route.ts` *(new)*

### Frontend (Already Updated)
- `src/components/triple-threat/PlayerProfileModal.tsx` *(new)*
- `src/components/triple-threat/StatCards.tsx` *(new)*
- `src/app/triple-threat/stats/page.tsx` *(modified)*

### Game Server (Already Updated)
- `TripleThreatStats.cs` - Enhanced with series tracking, class detection, teammate collection

---

## 🐛 Quick Debug

### No stats showing up?
```sql
-- Check if data is being inserted
SELECT * FROM tt_player_stats 
ORDER BY recorded_at DESC LIMIT 5;
```

### Series not grouping?
- Make sure you called `StartNewSeries()` before the first game
- Check that `series_id` appears in the console logs

### Class showing "Unknown"?
- Update `GetPlayerClass()` method in C# if your game uses different property names

---

## 📚 Full Documentation
See **`TRIPLE_THREAT_ENHANCED_STATS_IMPLEMENTATION.md`** for complete details.

---

## ✅ Success Checklist
- [ ] Ran both SQL migration files
- [ ] Added `StartNewSeries()`, `StartGame()`, `ResetSeries()` calls to game code
- [ ] Played a test game
- [ ] Verified stats appear on website
- [ ] Clicked player name and saw detailed profile
- [ ] Checked "Recent Games" tab shows game details

---

🎉 **You're done! The enhanced stats system is fully operational.**

