# Testing Triple Threat Stats - Complete Guide

## 🔧 Step 1: Fix Database Migration Error

The error you got is because the existing functions need to be dropped first. I've fixed the SQL file.

### Run This in Supabase SQL Editor

**Copy/paste the entire updated file:** `add-kills-deaths-to-tt-player-records.sql`

The fixed version now includes:
```sql
-- Drop existing functions that we're going to recreate with new return types
DROP FUNCTION IF EXISTS get_tt_top_players_by_game_wins(integer);
DROP FUNCTION IF EXISTS get_tt_top_players_by_series_wins(integer);
DROP FUNCTION IF EXISTS get_tt_player_record(uuid);
```

This will:
1. Drop old function signatures
2. Add kills/deaths columns
3. Create new functions with updated return types
4. Add proper indexes

**Expected Result:** "Success. No rows returned"

---

## 🎮 Step 2: Use In-Game Test Commands

I've added two new mod commands for testing:

### Command 1: `?test`
**Tests API connection and shows your current stats**

```
Usage: ?test
```

**What it shows:**
```
=== TRIPLE THREAT STATS TEST ===
Current Map: MoloTeamFights.lvl
Is MoloTeamFights: True

=== YOUR CURRENT STATS ===
Alias: YourName
Kills: 5
Deaths: 2
Team: Blue

=== TESTING API CONNECTION ===
✓ API connection test initiated - check console for results
```

**Console Output:**
```
TripleThreatStats: Testing API connection...
TripleThreatStats: connection test stats sent successfully!
Response: {"success":true,"message":"Test connection successful","timestamp":"2024-01-01T12:00:00Z"}
```

### Command 2: `?testsubmit`
**Sends test data to the API and database**

```
Usage: ?testsubmit
```

**What it does:**
- Sends fake game result (TestPlayer1-4)
- Sends fake series result
- Updates database with test data

**What you'll see:**
```
=== TESTING STATS SUBMISSION ===
Sending test game and series stats to API...
✓ Test stats submitted - check console and website
Visit http://localhost:3000/triple-threat/stats to view
```

**Console Output:**
```
TripleThreatStats: Sending test game stats...
TripleThreatStats: Game stats sent successfully!
TripleThreatStats: Sending test series stats...
TripleThreatStats: Series stats sent successfully!
```

**Check Website:**
Open `http://localhost:3000/triple-threat/stats` and look for:
- TestPlayer1 (5 kills, 2 deaths)
- TestPlayer2 (3 kills, 4 deaths)
- TestPlayer3 (2 kills, 5 deaths)
- TestPlayer4 (4 kills, 3 deaths)

---

## 🧪 Step 3: Complete Testing Sequence

### Test 1: Basic Connection
```
1. In game, type: ?test
2. Check console for API response
3. Verify your stats display correctly
```

### Test 2: Test Data Submission
```
1. In game, type: ?testsubmit
2. Wait 2 seconds
3. Open http://localhost:3000/triple-threat/stats
4. Look for TestPlayer1-4 in the list
5. Verify kills/deaths match expected values
```

### Test 3: Real Game Test
```
1. Load MoloTeamFights.lvl
2. Start a 2-team game
3. Play until one team wins
4. Check console for:
   "TripleThreatStats: Processing game result"
   "TripleThreatStats: Game stats sent successfully!"
5. Refresh stats page
6. See updated stats for real players
```

### Test 4: Series Test
```
1. Play a best-of-3 series
2. Complete all 3 games
3. Check for series completion message
4. Verify series wins/losses update
```

---

## 📊 Verifying Results

### Console Checks
✅ "TripleThreatStats: Processing game result"  
✅ "Found X winning players and Y losing players"  
✅ "Game stats sent successfully!"  
✅ API responds with success message  

### Website Checks (`http://localhost:3000/triple-threat/stats`)
✅ Players appear in stats table  
✅ Kills/deaths increment correctly  
✅ K/D ratio calculates properly  
✅ Win rates update  
✅ Sorting works  

### Database Checks (Supabase Dashboard)
```sql
-- View all records
SELECT * FROM tt_player_records ORDER BY updated_at DESC;

-- Check specific player
SELECT 
  player_alias, 
  game_wins, 
  game_losses, 
  kills, 
  deaths,
  CASE WHEN deaths > 0 THEN ROUND(kills::NUMERIC / deaths, 2) ELSE kills::NUMERIC END as kd
FROM tt_player_records 
WHERE player_alias = 'YourName';
```

---

## 🔍 Troubleshooting

### Issue: "?test" command not recognized
**Solution:**
- Make sure USLMain.cs was updated
- Restart game server
- Try `*test` if you're using admin commands

### Issue: API connection fails
**Check:**
```
1. Is Next.js dev server running? (npm run dev)
2. Is it on port 3000?
3. Check .env.local has SUPABASE_SERVICE_ROLE_KEY
4. Check TripleThreatStats.cs has USE_LOCAL_API = true
```

### Issue: Stats not updating on website
**Check:**
```
1. Did database migration run successfully?
2. Are RPC functions created?
3. Check browser console (F12) for errors
4. Check Supabase logs
5. Try hard refresh (Ctrl+Shift+R)
```

### Issue: Console shows "Could not find players"
**Check:**
```
1. Are there active players on both teams?
2. Did the game actually end?
3. Check that teams aren't spectator team
```

### Issue: Kills/deaths are 0
**Check:**
```
1. Is player.StatsCurrentGame populated?
2. Did players actually get kills in the game?
3. Check timing - stats collected after game ends
```

---

## 📝 API Endpoint Configuration

### Local Development (Default)
```csharp
// In TripleThreatStats.cs line 27:
private const bool USE_LOCAL_API = true;
```
API: `http://localhost:3000/api/triple-threat/game-stats`

### Production
```csharp
// In TripleThreatStats.cs line 27:
private const bool USE_LOCAL_API = false;
```
API: `https://freeinf.org/api/triple-threat/game-stats`

---

## 🎯 Success Criteria Checklist

Before considering it "working":

- [ ] Database migration runs without errors
- [ ] `?test` command shows your stats
- [ ] `?test` shows "API connection test initiated"
- [ ] Console shows successful API responses
- [ ] `?testsubmit` creates TestPlayer records
- [ ] TestPlayers appear on stats page with correct kills/deaths
- [ ] Real game creates stats entries
- [ ] Stats update after each game
- [ ] Kills and deaths increment correctly
- [ ] K/D ratios calculate properly
- [ ] Series wins/losses track correctly

---

## 📞 Quick Diagnostics

### Run This Sequence:
```
1. ?test                  → Shows current player info + API test
2. ?testsubmit           → Sends test data
3. Open stats page       → See TestPlayer1-4
4. Play real game        → See your stats appear
5. ?test again           → See updated stats
```

### Expected Timeline:
- Database setup: 2 minutes
- Test commands: 30 seconds each
- Real game test: 5-10 minutes
- Total: ~15 minutes to full confirmation

---

## 🚀 Quick Start Commands

```bash
# 1. Make sure Next.js is running
npm run dev

# 2. In game (as mod/admin):
?test
?testsubmit

# 3. Open browser:
http://localhost:3000/triple-threat/stats

# 4. Check for TestPlayer1-4 with stats
```

---

## 📊 Sample Test Output

### Successful Test
```
Player: ?test
=== TRIPLE THREAT STATS TEST ===
Current Map: MoloTeamFights.lvl
Is MoloTeamFights: True
=== YOUR CURRENT STATS ===
Alias: Player1
Kills: 3
Deaths: 1
Team: Blue
=== TESTING API CONNECTION ===
✓ API connection test initiated - check console for results

Console:
TripleThreatStats: Testing API connection...
TripleThreatStats: Sending connection test stats to http://localhost:3000/api/triple-threat/game-stats
TripleThreatStats: Connection test stats sent successfully! Response: {"success":true}
```

### Successful Test Submit
```
Player: ?testsubmit
=== TESTING STATS SUBMISSION ===
Sending test game and series stats to API...
✓ Test stats submitted - check console and website
Visit http://localhost:3000/triple-threat/stats to view

Console:
TripleThreatStats: Sending test game stats...
TripleThreatStats: Game stats sent successfully!
TripleThreatStats: Sending test series stats...
TripleThreatStats: Series stats sent successfully!
```

---

## 🎉 You're Ready When...

1. ✅ Both test commands work
2. ✅ TestPlayer data appears on website
3. ✅ Real games create stats
4. ✅ No console errors
5. ✅ Stats increment correctly

**Then you can switch to production!**

Change `USE_LOCAL_API = false` in TripleThreatStats.cs and restart server.

