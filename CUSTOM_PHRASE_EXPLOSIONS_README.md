# Custom Phrase Explosions Integration Guide

This guide explains how to integrate custom phrase explosions into your Infantry Online CTF game mode, allowing players to have personalized text explosions (like "BLOOP" from Albert's EMP grenade) based on their purchased phrases from your website.

## Overview

The system works by:
1. **Database Storage**: Custom phrases are stored in your Supabase `user_products` table
2. **Game Server Cache**: The CTF server caches player phrases for performance
3. **Dynamic Explosions**: When players trigger explosions, their custom phrases are displayed
4. **Fallback System**: If no custom phrase exists, defaults to "BLOOP"

## Setup Instructions

### 1. Database Setup

Run the SQL function in your Supabase SQL Editor:

```sql
-- Copy and paste the content from get-player-phrases.sql
```

This creates a function that returns active player phrases with their expiration status.

### 2. Configure CTF.cs Integration

Add the code from `CTF_WithWebIntegration.cs` to your main CTF.cs file, specifically:

1. **Update Configuration** (lines 25-27):
```csharp
private const string SUPABASE_URL = "https://your-project.supabase.co"; // Replace with your Supabase URL
private const string SUPABASE_ANON_KEY = "your-anon-key"; // Replace with your anon key
```

2. **Find Your Values**:
   - **Supabase URL**: Found in your Supabase project settings → API → Project URL
   - **Anon Key**: Found in your Supabase project settings → API → Project API keys → anon public

### 3. Integration Points

In your existing CTF.cs, find where explosions are created (usually in weapon hit events or EMP grenade functions) and replace with:

```csharp
// OLD: Basic explosion
CreateExplosion(x, y, explosionType);

// NEW: Custom phrase explosion
await ExplosionHelper.CreateCustomExplosion(killerPlayer, victimPlayer, x, y);
```

### 4. Adapt the Explosion Method

Update the `CreateTextExplosion` method in `ExplosionHelper` class to match your server's explosion system. Examples:

```csharp
private static void CreateTextExplosion(Arena arena, string text, short x, short y, Team team)
{
    // Option 1: Using Helpers.Player_RouteExplosion
    Helpers.Player_RouteExplosion(
        arena.Players,
        724, // Your explosion type ID
        x, y,
        0, 0, // Velocity
        0     // Duration
    );
    
    // Option 2: Send text message to area
    arena.sendArenaMessage($"💥 {text} 💥", team._id);
    
    // Option 3: Create banner message
    arena.sendArenaBanner($"{text}", x, y, 2000); // 2 second duration
}
```

## Usage Examples

### Basic Usage
```csharp
// In your weapon hit event or EMP grenade function
public async void OnPlayerKill(Player killer, Player victim, short x, short y)
{
    // Create custom explosion with player's phrase
    await ExplosionHelper.CreateCustomExplosion(killer, victim, x, y);
}
```

### Manual Cache Refresh
```csharp
// For admin commands to refresh phrases
public async void AdminRefreshPhrases()
{
    await PhraseExplosionManager.ForceRefreshPhrases();
    Console.WriteLine("Phrases cache manually refreshed!");
}
```

### Debug Information
```csharp
// Get all cached phrases for debugging
var cachedPhrases = PhraseExplosionManager.GetCachedPhrases();
foreach (var phrase in cachedPhrases)
{
    Console.WriteLine($"{phrase.Key}: {phrase.Value}");
}
```

## Data Flow

1. **Player purchases** a customizable product on your website with phrase "BOOM"
2. **Database stores** the purchase in `user_products` table with their custom phrase
3. **Game server** calls `get_player_phrases()` function every 5 minutes
4. **Phrases cached** in game server memory for fast access
5. **Player triggers** explosion (EMP grenade, weapon hit, etc.)
6. **System looks up** player's cached phrase
7. **Explosion displays** "BOOM" instead of default "BLOOP"

## Customization Options

### Phrase Validation
The system validates phrases to be 1-12 alphanumeric characters. Modify in:
- **Website**: `src/app/api/checkout/route.ts` line 17
- **Database**: The function automatically filters valid phrases

### Cache Duration
Modify cache expiry time in `PhraseExplosionManager`:
```csharp
private static readonly TimeSpan cacheExpiryTime = TimeSpan.FromMinutes(5); // Change as needed
```

### Default Phrase
Change the fallback phrase:
```csharp
return "BLOOP"; // Change to any default you prefer
```

### Explosion Types
Customize explosion appearance in `CreateTextExplosion`:
- Change explosion type ID numbers
- Modify text formatting
- Add colors or special effects
- Adjust duration and positioning

## Troubleshooting

### Common Issues

1. **Phrases not loading**:
   - Check Supabase URL and API key
   - Verify the database function was created successfully
   - Check network connectivity from game server

2. **Cache not updating**:
   - Default cache refreshes every 5 minutes
   - Call `ForceRefreshPhrases()` manually for immediate updates
   - Check console for error messages

3. **Explosions not showing**:
   - Verify `CreateTextExplosion` method matches your server's explosion system
   - Check explosion type IDs are correct for your server
   - Ensure coordinates are valid

### Debug Commands

Add these admin commands for debugging:

```csharp
// Command: ?refreshphrases
if (command == "refreshphrases")
{
    await PhraseExplosionManager.ForceRefreshPhrases();
    player.sendMessage(0, "Phrases cache refreshed!");
}

// Command: ?myphrase
if (command == "myphrase")
{
    string phrase = await PhraseExplosionManager.GetPlayerPhrase(player._alias);
    player.sendMessage(0, $"Your current phrase: {phrase}");
}

// Command: ?testexplosion
if (command == "testexplosion")
{
    await ExplosionHelper.CreateCustomExplosion(player, player, player._state.positionX, player._state.positionY);
}
```

## Security Considerations

- The database function uses `SECURITY DEFINER` to bypass RLS safely
- Only active, non-expired purchases are returned
- Phrases are validated for appropriate content
- Cache limits exposure of database queries

## Performance Notes

- **Cache System**: Reduces database calls to once every 5 minutes
- **Async Operations**: Non-blocking phrase lookups
- **Fallback Handling**: Graceful degradation if service is unavailable
- **Memory Usage**: Minimal - only stores alias→phrase mappings

## Support

If you encounter issues:
1. Check console logs for error messages
2. Verify database function is properly created
3. Test with simple debug commands first
4. Ensure your Supabase credentials are correct 