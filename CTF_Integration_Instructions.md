# CTF Live Game Data Integration Instructions

## Step 1: Add the LiveGameDataIntegration Class

1. **Copy the entire `LiveGameDataIntegration` class** from `CTF_LiveGameDataIntegration.cs` 
2. **Add it to your `CTF.cs` file** after your existing `WebIntegration` class (around line 900+)

## Step 2: Initialize the Live Data System

Find your arena initialization code (likely in a method where you set up the arena or when the first player joins). Add this initialization:

```csharp
// Add this after your existing initialization code
// Usually in playerJoinGame or arena setup method
if (currentPlayersInArena == 1) // When first player joins
{
    LiveGameDataIntegration.Initialize(
        arena,                    // Your arena instance
        playerClassPlayTimes,     // Your existing class tracking dictionary
        playerLastClassSwitch,    // Your existing class switch tracking
        activeDuels              // Your existing active duels dictionary
    );
}
```

## Step 3: Add Manual Update Triggers (Optional)

For immediate updates during important events, add these calls:

### A. When Game Starts/Ends
```csharp
// In your game start method
public async Task GameStart()
{
    // Your existing game start code...
    
    // Send immediate live data update
    string baseUsed = GetCurrentBase(arena); // Adapt to your base detection
    await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
}
```

### B. When Players Join/Leave
```csharp
// In your playerJoinGame method - add after existing code
[Scripts.Event("Player.JoinGame")]
public bool playerJoinGame(Player player)
{
    // Your existing join code...
    
    // Send live data update (async, don't block the join)
    Task.Run(async () => {
        await Task.Delay(1000); // Wait 1 second for player to fully join
        string baseUsed = GetCurrentBase(arena);
        await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
    });
    
    return true;
}

// In your playerLeaveArena method
[Scripts.Event("Player.LeaveArena")]
public void playerLeaveArena(Player player, Arena arena)
{
    // Your existing leave code...
    
    // Stop live data if no players left
    if (arena.Players.Count() == 0)
    {
        LiveGameDataIntegration.Stop();
    }
    else
    {
        // Send update with remaining players
        Task.Run(async () => {
            await Task.Delay(500); // Brief delay for clean leave
            string baseUsed = GetCurrentBase(arena);
            await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
        });
    }
}
```

### C. When Duels Start/End
```csharp
// In your StartDuel method - add after duel creation
private static async Task StartDuel(Player player1, Player player2, DuelType duelType)
{
    // Your existing duel start code...
    
    // Send immediate update to show duel status
    string baseUsed = GetCurrentBase(player1._arena);
    await LiveGameDataIntegration.SendLiveGameData(player1._arena, baseUsed);
}

// In your CompleteDuel method - add after duel completion
private static async Task CompleteDuel(DuelMatch match, Arena arena)
{
    // Your existing duel completion code...
    
    // Send update to clear duel status
    string baseUsed = GetCurrentBase(arena);
    await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
}
```

## Step 4: Configure API Endpoint

In the `LiveGameDataIntegration` class, update the API configuration:

```csharp
// For testing locally (your dev server on port 3002)
private const bool USE_LOCAL_API = true;

// For production (switch to false when ready)
private const bool USE_LOCAL_API = false;
```

## Step 5: Adapt Helper Methods

You may need to adapt these methods based on your specific CTF implementation:

### A. Base Detection
```csharp
private static string GetCurrentBase(Arena arena)
{
    // Replace this with your actual base detection logic
    // Examples:
    // return arena._name.Contains("North") ? "North Base" : "South Base";
    // return currentBaseUsed; // if you have a variable tracking this
    // return "Unknown"; // temporary fallback
    
    return "Current Base"; // Replace with your logic
}
```

### B. Health/Energy Access
If the default health/energy access doesn't work, update these methods:

```csharp
private static int GetPlayerHealth(Player player)
{
    try
    {
        // Try different ways to access health based on your Player class
        // Option 1: Direct state access
        return (int)player._baseVehicle._state.health;
        
        // Option 2: If you have a health property
        // return player.Health;
        
        // Option 3: If health is stored elsewhere
        // return player._state.health;
    }
    catch
    {
        return 60; // Default CTF health
    }
}
```

## Step 6: Testing the Integration

### A. Test with Your Dev Server
1. **Start your Next.js dev server**: `npm run dev` (should be on port 3002)
2. **Set `USE_LOCAL_API = true`** in the LiveGameDataIntegration class
3. **Compile and start your CTF server**
4. **Join the arena** with a test player
5. **Visit**: `http://localhost:3002/livegamedata`
6. **You should see**: Live player data updating every 15 seconds

### B. Test Live Updates
1. **Join players** to different teams
2. **Switch classes** and watch class play times update
3. **Start duels** and see duel status appear
4. **Check the browser console** for any API errors

### C. Test Production
1. **Set `USE_LOCAL_API = false`**
2. **Recompile CTF server**
3. **Test with production site**: `https://freeinf.org/livegamedata`

## Step 7: Troubleshooting

### Common Issues:

#### No Data Appearing
```csharp
// Add debug logging to check if data is being sent
Console.WriteLine($"[LiveGameData] Sending data for {players.Count} players to {LIVE_API_ENDPOINT}");
```

#### Compilation Errors
- Ensure all your existing methods are accessible to the LiveGameDataIntegration class
- Add `public static` to methods that need to be called from the integration class

#### Connection Errors
- Check your firewall settings for outbound HTTP requests
- Verify the API endpoint URL is correct
- Test with a simple GET request first

#### Class Play Times Not Showing
- Verify `playerClassPlayTimes` dictionary is populated
- Check that class switching events are properly tracked
- Add debug output to see what class times are being sent

## Step 8: Production Deployment

When ready for production:

1. **Set `USE_LOCAL_API = false`**
2. **Test thoroughly** with production endpoint
3. **Monitor server logs** for any errors
4. **Check website logs** for successful data receipt
5. **Use the live page** to verify accuracy during real matches

## Additional Features You Can Add

### A. Custom Events
```csharp
// Send immediate updates for specific events
await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
```

### B. Conditional Updates
```csharp
// Only send updates during active games
if (gameInProgress && arena.Players.Count() > 4)
{
    await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
}
```

### C. Error Handling
```csharp
// Wrap in try-catch for production stability
try
{
    await LiveGameDataIntegration.SendLiveGameData(arena, baseUsed);
}
catch (Exception ex)
{
    Console.WriteLine($"[LiveGameData] Non-critical error: {ex.Message}");
    // Continue normal game operation
}
```

The live data system will now automatically send updates every 15 seconds and provide real-time visibility into your CTF matches!