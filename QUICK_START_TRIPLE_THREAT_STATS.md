# Triple Threat Stats - Quick Start Guide

## 🚀 3-Step Setup

### 1️⃣ Run Database Migration (5 minutes)
```sql
-- Open Supabase → SQL Editor → Copy/Paste this file:
add-kills-deaths-to-tt-player-records.sql
-- Click "Run" button
-- Should see "Success. No rows returned"
```

### 2️⃣ Rename C# File (1 minute)
```powershell
# On your Windows machine, run in PowerShell:
cd "G:\Users\Travis\Desktop\New folder (2)\Infantry Online Map Folder\Infantry-Online-Server-master\bin\scripts\GameTypes\USL"
Move-Item "TripleThreatStats.cs.disabled" "TripleThreatStats.cs"
```

### 3️⃣ Restart Game Server
- Stop Infantry Online server
- Start Infantry Online server
- Load MoloTeamFights.lvl

## ✅ Quick Test

### Test API Connection
```csharp
// In game console or via command:
await TripleThreatStats.TestConnection();
```
**Expected Output:**
```
TripleThreatStats: Testing API connection...
TripleThreatStats: connection test stats sent successfully!
```

### Test Stats Submission
```csharp
await TripleThreatStats.SendTestStats();
```
**Expected Output:**
```
TripleThreatStats: Sending test game stats...
TripleThreatStats: Game stats sent successfully!
TripleThreatStats: Sending test series stats...
TripleThreatStats: Series stats sent successfully!
```

### View Results
1. Open browser: `http://localhost:3001/triple-threat/stats` (or your production URL)
2. Look for `TestPlayer1`, `TestPlayer2`, etc.
3. Should see their stats with kills/deaths

## 🎮 Play a Real Game

1. Load `MoloTeamFights.lvl`
2. Start a game with 2+ teams
3. Play until one team wins
4. Check console for:
   ```
   TripleThreatStats: Processing game result - [Winner] vs [Loser]
   TripleThreatStats: Found X winning players and Y losing players
   TripleThreatStats: Game stats sent successfully!
   ```
5. Refresh stats page - see updated stats!

## 📊 What Gets Tracked

### Per Game
- ✅ Game wins/losses
- ✅ Kills per player
- ✅ Deaths per player

### Per Series (Best-of-X)
- ✅ Series wins/losses
- ✅ Best-of-3, 5, 7, 9, etc.

### Aggregated Stats
- ✅ Total game wins/losses
- ✅ Total series wins/losses
- ✅ Total kills
- ✅ Total deaths
- ✅ K/D ratio
- ✅ Win percentages

## 🔧 Configuration

### Switch Between Local and Production
Edit `TripleThreatStats.cs`:
```csharp
// Line 27:
private const bool USE_LOCAL_API = true; // Set to false for production
```

### API Endpoints
- **Local:** `http://localhost:3001/api/triple-threat/game-stats`
- **Production:** `https://freeinf.org/api/triple-threat/game-stats`

## ⚠️ Important Notes

1. **Map-Specific**: Only works on `MoloTeamFights.lvl`
2. **Alias-Based**: Tracks by player alias (in-game name)
3. **No Account Required**: Players without accounts still tracked
4. **Async**: Stats sent in background, doesn't lag game
5. **Error-Safe**: Failed stats don't crash server

## 🐛 Troubleshooting

### Stats Not Sending?
```
❌ Problem: No console output when game ends
✅ Solution: Check if file was renamed from .disabled to .cs
✅ Solution: Restart server after renaming file
✅ Solution: Verify map is MoloTeamFights.lvl
```

### API Errors?
```
❌ Problem: 401 Unauthorized
✅ Solution: Check SUPABASE_SERVICE_ROLE_KEY in .env.local
✅ Solution: Verify key matches in TripleThreatStats.cs

❌ Problem: Database errors
✅ Solution: Run migration SQL in Supabase
✅ Solution: Check Supabase → Logs for errors
```

### Stats Show 0 Kills?
```
❌ Problem: Kills/deaths are 0 even after game
✅ Solution: Check if player.StatsLastGame is populated
✅ Solution: Verify timing - stats collected after game ends
```

## 📈 Success Indicators

✅ Console shows "TripleThreatStats: Processing game result"  
✅ Console shows "Game stats sent successfully"  
✅ Stats page updates after each game  
✅ Kills and deaths increment correctly  
✅ K/D ratios calculate properly  

## 🎯 Next Steps

1. Complete the 3-step setup above
2. Run quick tests
3. Play a real game
4. Verify stats on website
5. Switch to production when ready

## 💡 Pro Tips

- Use `?testconnection` command in-game (if implemented)
- Check Supabase logs for detailed error messages
- Test with 2 players minimum (1 per team)
- Stats update immediately after game ends
- Refresh stats page to see new data

---

**Need Help?** Check `TRIPLE_THREAT_STATS_FIX_SUMMARY.md` for detailed info

