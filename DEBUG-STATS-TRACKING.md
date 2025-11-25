# 🔍 Debug: Stats Tracking Issues

## ❌ Current Problems

Looking at your terminal logs, the payloads show:
```json
{
  "alias": "Axidus",
  "kills": 0,              ← Should have values
  "deaths": 0,             ← Should have values
  "total_hits": 0,         ← Should have values
  "total_shots": 0,        ← Should have values
  "accuracy": null,        ← Should be calculated
  "teammates": [],         ← Empty (OK for 1v1, but needs debugging for team games)
  ...
}
```

---

## 🔧 Debug Logging Added

I've added extensive console debug output to **TripleThreatStats.cs** that will now show:

### When Processing Stats:
```
=== DEBUG: Creating winner player stats ===
DEBUG: Processing winner: Axidus
DEBUG:   Kills: X, Deaths: Y
DEBUG: Getting total hits for player: Axidus
DEBUG: weaponStatsDict has N entries
DEBUG: Available player aliases in weaponStatsDict:
  - 'Axidus'
  - 'OtherPlayer'
DEBUG: Player 'Axidus' has M weapons tracked
DEBUG:   Weapon ID 123: 45 hits
DEBUG:   Weapon ID 456: 30 hits
DEBUG: Total hits for Axidus: 75
DEBUG: Getting total shots for player: Axidus
DEBUG:   Weapon ID 123: 60 shots
DEBUG:   Weapon ID 456: 40 shots
DEBUG: Total shots for Axidus: 100
DEBUG:   Calculated - Hits: 75, Shots: 100, Accuracy: 75.0
DEBUG:   Teammates: [Player2, Player3]
```

---

## 🎯 What to Look For

### Test 1: Play a Game with Shooting
1. **Fire some shots** and land some hits
2. **Finish the game**
3. **Check game server console** for debug output
4. **Look for these key lines:**

#### ✅ Good Output (Working):
```
DEBUG: weaponStatsDict has 2 entries
DEBUG: Available player aliases in weaponStatsDict:
  - 'Axidus'
  - 'OBS'
DEBUG: Player 'Axidus' has 3 weapons tracked
DEBUG:   Weapon ID 789: 45 hits
DEBUG: Total hits for Axidus: 45
DEBUG: Total shots for Axidus: 60
DEBUG:   Calculated - Hits: 45, Shots: 60, Accuracy: 75.0
```

#### ❌ Bad Output (Broken):
```
DEBUG: weaponStatsDict has 0 entries
```
**OR**
```
DEBUG: weaponStatsDict has 2 entries
DEBUG: Available player aliases in weaponStatsDict:
  - 'SomeOtherPlayer'
  - 'NotYourAlias'
DEBUG: Player 'Axidus' NOT FOUND in weaponStatsDict
```

---

## 🐛 Possible Issues & Fixes

### Issue 1: weaponStatsDict is Empty (0 entries)
**Cause:** `_lastGameWeaponStats` hasn't been populated yet
**Likely Reason:** Stats are being sent BEFORE `CacheGameStats()` runs

**Check in USLMain.cs around line 6663:**
```csharp
CacheGameStats();                    // This must run FIRST
_playerWeaponStats.Clear();          // Then this
// THEN Triple Threat stats should be sent
```

**Solution:** Make sure Triple Threat stats are sent AFTER `CacheGameStats()` is called.

---

### Issue 2: Player Alias Not Found in Dictionary
**Cause:** Player's alias in `_lastGameWeaponStats` doesn't match the alias we're looking up

**Possible reasons:**
- Alias has extra spaces or different casing
- Player object vs cached data mismatch
- Timing issue - player left before stats were cached

**Look for debug output:**
```
DEBUG: Available player aliases in weaponStatsDict:
  - 'Axidus '  ← Extra space!
```

---

### Issue 3: Kills/Deaths are 0
**Cause:** `StatsLastGame` is null or hasn't been populated

**Check:** Look at the debug output:
```
DEBUG:   Kills: 0, Deaths: 0  ← If you actually got kills, this is wrong
```

**This means:** The game's internal stats tracking (`StatsLastGame`) is not working or is cleared before we access it.

---

## 🔍 Timing Diagram

Here's the current flow and where things might be breaking:

```
Game Ends
   ↓
[1] CacheGameStats()
   └─ Copies _playerWeaponStats → _lastGameWeaponStats (keyed by alias)
   └─ Should have weapon stats for all players
   ↓
[2] _playerWeaponStats.Clear()
   └─ Current stats now empty
   ↓
[3] TripleThreatStats.SendGameStats(..., _lastGameWeaponStats)
   └─ Should use cached data from [1]
   └─ Looks up by player alias string
   ↓
[4] Build payload with stats
   └─ Kills/Deaths from p.StatsLastGame
   └─ Hits/Shots from _lastGameWeaponStats
```

---

## 📊 Expected vs Actual

### Teammates Array
- **Empty array `[]` is NORMAL for 1v1 games** (only 1 player per team)
- **Should have values for team games** (2+ players per team)

### Kills/Deaths
- Sourced from: `player.StatsLastGame.kills` / `player.StatsLastGame.deaths`
- **If 0:** Either no kills happened OR `StatsLastGame` is not populated

### Total Hits/Shots/Accuracy
- Sourced from: `_lastGameWeaponStats` dictionary
- **If 0/null:** Dictionary is empty or player not found in dictionary

---

## 🚀 Next Steps

1. **Play a game with shooting**
2. **Paste the debug console output** from the game server
3. **Look for the lines:**
   - `DEBUG: weaponStatsDict has X entries`
   - `DEBUG: Available player aliases in weaponStatsDict:`
   - `DEBUG: Total hits for [player]: X`
4. **Share the output** so we can see exactly where it's breaking

---

## 📝 Database Schema Note

You mentioned these columns don't make sense in `tt_player_stats`:
- `series_wins`
- `series_losses`
- `round_wins`
- `round_losses`

**You're right!** These are aggregate stats that belong in a summary table, not individual game records.

**Current behavior in `insert_tt_game_stat`:**
```sql
round_wins = CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
round_losses = CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
series_wins = 0,  -- Always 0
series_losses = 0, -- Always 0
```

**We can clean this up once the main stats are working.**

---

## 🎯 Summary

1. ✅ Debug logging added
2. ⏳ Play a game and check console output
3. 🔍 Look for weaponStatsDict contents
4. 📤 Share debug output to diagnose the issue

The comprehensive debug output will tell us exactly where the data is getting lost! 🚀

