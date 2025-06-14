# Tile-Based Dueling System

## Overview
Enhanced dueling system with automatic tile-based matchmaking, precise warping, and side swapping mechanics.

## Features

### 🎯 Tile-Based Auto-Matching
- **Bo3 Tile**: Coordinates (775, 517) with 3x3 radius detection
- **Bo5 Tile**: Coordinates (784, 517) with 3x3 radius detection
- **Auto-Challenge**: When two players step on the same tile type, they automatically start a duel
- **Waiting System**: Players wait up to 30 seconds for an opponent
- **Cancel by Movement**: Step off the tile to cancel waiting

### ⚔️ Precise Warping System
- **Left Spawn**: Position (764, 533) facing direction 57°
- **Right Spawn**: Position (794, 532) facing direction 180°
- **Anti-Double-Warp**: Includes `resetWarp()` calls and delays to prevent warping issues
- **Immediate Death Reset**: Players' death states are immediately reset to prevent glitches

### 🔄 Side Swapping Mechanics
- **Round-by-Round**: Players swap sides after each round completion
- **Fair Play**: Ensures both players experience both spawn positions
- **Automatic**: No manual intervention required

### 🛡️ Enhanced Death Handling
- **Immediate Reset**: Death state is reset immediately upon death in duels
- **Health/Energy Restore**: Players are restored to full health and energy
- **Clean Transitions**: Smooth transitions between rounds

## Technical Implementation

### Tile Detection
```csharp
// Radius detection (3x3 grid around center)
if (Math.Abs(x - tileX) <= 1 && Math.Abs(y - tileY) <= 1)
```

### Spawn Positions (16x16 pixel scaling)
```csharp
{ "player1", new Tuple<short, short, byte>((short)(764 * 16), (short)(533 * 16), 57) }
{ "player2", new Tuple<short, short, byte>((short)(794 * 16), (short)(532 * 16), 180) }
```

### Side Assignment Tracking
- `DuelSideAssignment` class tracks which player is on which side
- Automatically swaps sides after each round
- Cleaned up when duel completes

## Usage

### For Players
1. **Step on Tile**: Walk onto Bo3 (775,517) or Bo5 (784,517) tile
2. **Wait for Match**: System announces "Waiting for opponent..."
3. **Auto-Start**: When second player steps on same tile type, duel begins
4. **Fight**: Players are warped to opposite sides of dueling area
5. **Side Swap**: After each round, players automatically swap sides
6. **Cancel**: Step off tile to cancel waiting

### Commands
- `?duel help` - Shows help including tile coordinates
- All existing duel commands still work for manual challenges

## Integration Points

### CTF.cs Integration
The tile system integrates with the main CTF game mode through:
- `HandleTileStep(player, x, y)` - Called when player steps on tile
- `HandleTileLeave(player, x, y)` - Called when player leaves tile area
- `HandlePlayerDeath(victim, killer, arena)` - Enhanced for immediate reset

### Database Integration
- All existing dueling database functions work unchanged
- Match data includes proper player IDs and statistics
- Side swapping is transparent to the database layer

## Configuration

### Tile Coordinates
```csharp
private static readonly Dictionary<string, Tuple<short, short>> DUELING_TILES = new Dictionary<string, Tuple<short, short>>
{
    { "ranked_bo3", new Tuple<short, short>(775, 517) },
    { "ranked_bo5", new Tuple<short, short>(784, 517) }
};
```

### Spawn Positions
```csharp
private static readonly Dictionary<string, Tuple<short, short, byte>> DUEL_SPAWN_POSITIONS = new Dictionary<string, Tuple<short, short, byte>>
{
    { "player1", new Tuple<short, short, byte>((short)(764 * 16), (short)(533 * 16), 57) },
    { "player2", new Tuple<short, short, byte>((short)(794 * 16), (short)(532 * 16), 180) }
};
```

## Benefits

### For Players
- **Instant Matchmaking**: No need to manually challenge players
- **Fair Competition**: Side swapping ensures balanced gameplay
- **Smooth Experience**: No double-warping or death state issues
- **Clear Feedback**: System messages guide the process

### For Server Operators
- **Automated System**: Minimal manual intervention required
- **Robust Error Handling**: Comprehensive exception handling
- **Performance Optimized**: Thread-safe operations with proper cleanup
- **Backwards Compatible**: Existing manual duel system still works

## Troubleshooting

### Common Issues
1. **Double Warping**: Fixed with `resetWarp()` calls and delays
2. **Death State Glitches**: Immediate death state reset prevents issues
3. **Side Assignment Confusion**: Clear console logging tracks all assignments
4. **Memory Leaks**: Proper cleanup of side assignments and waiting players

### Debug Output
The system provides comprehensive console logging:
- Tile step detection
- Player matching
- Warp coordinates and facing directions
- Side assignments and swaps
- Death state resets

## Future Enhancements

### Potential Additions
- **Multiple Arenas**: Support for different dueling maps
- **Tournament Mode**: Bracket-style tournaments using tiles
- **Spectator Mode**: Allow players to watch tile-based duels
- **Custom Spawn Points**: Per-arena spawn configuration
- **Warmup Rounds**: Practice rounds before ranked matches

### Performance Optimizations
- **Tile Caching**: Cache tile calculations for better performance
- **Batch Operations**: Group multiple tile operations
- **Memory Management**: Further optimize data structure usage 