# CTF.cs Dueling Integration Guide

## Overview
This guide shows exactly what to add to your CTF.cs file to integrate shot tracking with the dueling system.

## Required Changes to CTF.cs

### 1. Add Shot Tracking Calls

You need to add two simple method calls to your existing CTF.cs code:

#### A. Track Shots Fired
Find the location where `stats.ShotsFired++` is incremented (around line 10991) and add this line right after it:

```csharp
// Existing code:
stats.ShotsFired++;

// ADD THIS LINE:
CTFGameType.DuelingSystem.TrackShotFired(from);
```

**Full context example:**
```csharp
// Update shooter stats for accuracy tracking
if (!_playerWeaponStats.ContainsKey(from))
{
    _playerWeaponStats[from] = new Dictionary<int, WeaponStats>();
}
if (!_playerWeaponStats[from].ContainsKey(usedWep.id))
{
    _playerWeaponStats[from][usedWep.id] = new WeaponStats();
}
var stats = _playerWeaponStats[from][usedWep.id];
stats.ShotsFired++;

// ADD THIS LINE FOR DUELING INTEGRATION:
CTFGameType.DuelingSystem.TrackShotFired(from);
```

#### B. Track Shots Hit
Find the location where `stats.ShotsLanded++` is incremented (around line 11609 in the DamageEvent handler) and add this line right after it:

```csharp
// Existing code:
shooterStats.ShotsLanded++;

// ADD THIS LINE:
CTFGameType.DuelingSystem.TrackShotHit(shooter);
```

**Full context example:**
```csharp
var shooterStats = _playerWeaponStats[shooter][weapon.id];
shooterStats.ShotsLanded++;
shooterStats.TotalHits++;

// ADD THIS LINE FOR DUELING INTEGRATION:
CTFGameType.DuelingSystem.TrackShotHit(shooter);
```

### 2. Add Tile Integration Calls

#### A. Handle Tile Steps
Find your tile step handler (or create one if it doesn't exist) and add:

```csharp
// In your tile step event handler:
public bool playerTileStep(Player player, short x, short y)
{
    // Your existing tile logic here...
    
    // ADD THIS LINE FOR DUELING TILES:
    CTFGameType.DuelingSystem.HandleTileStep(player, x, y);
    
    return true;
}
```

#### B. Handle Player Movement (Optional)
If you want players to be able to cancel waiting by stepping off tiles:

```csharp
// In your player movement handler:
public bool playerMove(Player player, short x, short y)
{
    // Your existing movement logic here...
    
    // ADD THIS LINE FOR TILE LEAVE DETECTION:
    CTFGameType.DuelingSystem.HandleTileLeave(player, x, y);
    
    return true;
}
```

#### C. Handle Player Deaths
Find your player death handler and add:

```csharp
// In your existing playerDeath method:
public bool playerDeath(Player victim, Player killer, Helpers.KillType killType, CS_VehicleDeath update)
{
    // Your existing death logic here...
    
    // ADD THIS LINE FOR DUELING DEATH HANDLING:
    if (killer != null)
    {
        CTFGameType.DuelingSystem.HandlePlayerDeath(victim, killer, arena);
    }
    
    // Rest of your existing code...
    return true;
}
```

## Complete Integration Example

Here's what the key sections should look like after integration:

### Shot Fired Integration
```csharp
[Scripts.Event("Player.Explosion")]
public bool playerExplosion(Player from, ItemInfo.Projectile usedWep, short posX, short posY, short posZ, byte scale)
{
    // ... existing explosion logic ...
    
    if (_playerStatsEnabled)
    {
        // Update shooter stats for accuracy tracking
        if (!_playerWeaponStats.ContainsKey(from))
        {
            _playerWeaponStats[from] = new Dictionary<int, WeaponStats>();
        }
        if (!_playerWeaponStats[from].ContainsKey(usedWep.id))
        {
            _playerWeaponStats[from][usedWep.id] = new WeaponStats();
        }
        var stats = _playerWeaponStats[from][usedWep.id];
        stats.ShotsFired++;
        
        // DUELING INTEGRATION:
        CTFGameType.DuelingSystem.TrackShotFired(from);
    }
    
    // ... rest of existing code ...
    return true;
}
```

### Shot Hit Integration
```csharp
[Scripts.Event("Player.DamageEvent")] 
public bool playerDamageEvent(Player player, ItemInfo.Projectile weapon, short posX, short posY, short posZ)
{
    // ... existing damage logic ...
    
    if (_playerStatsEnabled)
    {
        // ... existing hit detection logic ...
        
        var shooterStats = _playerWeaponStats[shooter][weapon.id];
        shooterStats.ShotsLanded++;
        shooterStats.TotalHits++;
        
        // DUELING INTEGRATION:
        CTFGameType.DuelingSystem.TrackShotHit(shooter);
    }
    
    // ... rest of existing code ...
    return true;
}
```

### Death Integration
```csharp
[Scripts.Event("Player.Death")]
public bool playerDeath(Player victim, Player killer, Helpers.KillType killType, CS_VehicleDeath update)
{
    // ... existing death logic ...
    
    // DUELING INTEGRATION:
    if (killer != null)
    {
        CTFGameType.DuelingSystem.HandlePlayerDeath(victim, killer, arena);
    }
    
    // ... rest of existing code ...
    return true;
}
```

## Testing the Integration

### 1. Compile and Start Server
After adding the integration calls, compile and start your server.

### 2. Test Tile-Based Dueling
1. Have two players step on the Bo3 tile at (775, 517)
2. System should announce "AUTO-MATCH: Player1 vs Player2!"
3. Players should be warped to opposite sides
4. After each round, players should swap sides

### 3. Test Shot Tracking
1. During a duel, shots fired and hits should be tracked
2. Check the database for accurate shot statistics
3. Frontend should display proper accuracy percentages

### 4. Verify Database Integration
Check that matches are being recorded with:
- Proper player IDs (for registered players)
- Accurate shot statistics
- Round-by-round data
- Side swapping information

## Troubleshooting

### Common Issues
1. **Compilation Errors**: Make sure CTFUtilities.cs is in the same namespace
2. **No Shot Tracking**: Verify the TrackShotFired/TrackShotHit calls are in the right places
3. **Tiles Not Working**: Check that HandleTileStep is being called
4. **No Auto-Matching**: Ensure both players are stepping on the same tile type

### Debug Output
The system provides console logging for:
- Tile step detection
- Shot tracking
- Player matching
- Warp coordinates
- Database communication

Look for messages like:
- "Warped PlayerName to side player1 at (x,y) facing direction"
- "Reset shot stats for PlayerName"
- "AUTO-MATCH: Player1 vs Player2!"

## Benefits After Integration

### For Players
- **Instant Dueling**: Step on tiles for automatic matchmaking
- **Accurate Stats**: Real shot tracking with percentages
- **Fair Gameplay**: Automatic side swapping
- **Smooth Experience**: No double-warping issues

### For Server Operators
- **Automated System**: Minimal manual intervention
- **Rich Statistics**: Detailed accuracy and performance data
- **Database Integration**: All data properly stored and accessible
- **Web Dashboard**: Statistics visible on freeinf.org

The integration is designed to be minimal and non-intrusive to your existing CTF code while providing powerful dueling functionality. 