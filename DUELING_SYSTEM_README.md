# 🗡️ Dueling Tournament System

A comprehensive dueling system with tournament brackets, player statistics, and both pickup and tournament match tracking.

## 🏗️ Architecture

### Database Schema

The dueling system consists of 5 main tables:

1. **`dueling_stats`** - Individual duel records
2. **`tournaments`** - Tournament events  
3. **`tournament_participants`** - Player registrations
4. **`tournament_matches`** - Bracket structure
5. **`dueling_aggregate_stats`** - Player statistics

### Key Features

- **📊 Player Rankings** - Comprehensive statistics and win rates
- **🏆 Tournament System** - Single/double elimination brackets  
- **⚔️ Pickup Duels** - Casual duel tracking separate from tournaments
- **📈 Advanced Stats** - Win streaks, head-to-head records, tournament achievements
- **🎯 Visual Brackets** - Real-time tournament bracket visualization
- **🤖 Auto Stats Updates** - Automatic aggregate statistics via database triggers

## 🚀 Setup Instructions

### 1. Database Setup

Run the SQL schema in your Supabase SQL Editor:

```bash
# Run this file in Supabase SQL Editor
setup-dueling-system.sql
```

This creates all tables, indexes, constraints, and triggers for automatic stats updates.

### 2. Pages & API Endpoints

The system includes:

#### Pages:
- `/dueling` - Main dueling page with tournament simulation
- `/dueling/stats` - Player rankings and statistics

#### API Endpoints:
- `GET/POST /api/dueling/stats` - Fetch rankings or record duels
- `GET/POST /api/dueling/tournaments` - Tournament management
- `GET/PUT /api/dueling/tournaments/[id]` - Individual tournament operations

## 🎮 Usage Examples

### Recording a Duel

```javascript
const duelData = {
  player1_id: "uuid-1",
  player1_alias: "Shadowblade", 
  player2_id: "uuid-2",
  player2_alias: "Lightspeed",
  winner_id: "uuid-1",
  winner_alias: "Shadowblade",
  arena_name: "Duel Arena 1",
  duel_type: "pickup", // or "tournament"
  player1_score: 10,
  player2_score: 7,
  duel_length_minutes: 5.5
};

fetch('/api/dueling/stats', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(duelData)
});
```

### Creating a Tournament

```javascript
const tournamentData = {
  name: "Weekly Duel Championship",
  description: "Weekly tournament for all skill levels",
  tournament_type: "single_elimination",
  max_participants: 16,
  prize_pool: 5000, // in cents
  created_by: "admin-user-id"
};

fetch('/api/dueling/tournaments', {
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(tournamentData)
});
```

### Registering for Tournament

```javascript
fetch(`/api/dueling/tournaments/${tournamentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'register',
    player_id: "user-uuid",
    player_alias: "PlayerName"
  })
});
```

### Generating Tournament Bracket

```javascript
fetch(`/api/dueling/tournaments/${tournamentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'generate_bracket'
  })
});
```

## 📊 Statistics Tracking

### Individual Player Stats

Each player automatically tracks:
- **Overall**: Total duels, wins, losses, win rate
- **Pickup Duels**: Casual match statistics  
- **Tournament Duels**: Competitive match statistics
- **Tournament Achievements**: Wins, runner-up, top 3 finishes
- **Streaks**: Current and longest win/loss streaks
- **Activity**: First and last duel dates

### Automatic Updates

Statistics are automatically updated via database triggers when new duels are recorded. No manual calculation required!

## 🏆 Tournament Types

### Single Elimination
- Traditional bracket format
- One loss eliminates player
- Fastest tournament format

### Double Elimination (Future)
- Winners and losers brackets
- Two chances before elimination
- More complex but fair format

## 🎯 Tournament Workflow

1. **Registration Phase**
   - Tournament created with registration open
   - Players register until max capacity or deadline
   - Seeding can be manual or automatic

2. **Bracket Generation**
   - Admin generates bracket from registered players
   - Matches created automatically
   - Tournament status changes to "in_progress"

3. **Match Play**
   - Players compete in scheduled matches
   - Results recorded via API
   - Winners advance to next round

4. **Completion**
   - Final match determines champion
   - Tournament marked as completed
   - Final rankings recorded

## 🔮 Sample Data & Simulation

The system includes sample data generation for demonstration:

- **Player Rankings**: Shows sample leaderboard with realistic statistics
- **Recent Duels**: Displays example match history
- **Tournament Simulation**: Interactive bracket with randomized results

This allows testing the UI and logic before real data is available.

## 🎨 UI Components

### Tournament Bracket Visualization
- **Round-by-round display** with match results
- **Real-time updates** as matches complete
- **Winner highlighting** and progression tracking
- **Mobile-responsive design** for all screen sizes

### Player Statistics Dashboard
- **Sortable rankings** by multiple criteria
- **Filter options** for different match types
- **Win rate calculations** with visual indicators
- **Achievement tracking** for tournament success

### Match History
- **Recent duels display** with scores and details
- **Match type indicators** (pickup vs tournament)
- **Arena and duration tracking**
- **Player performance highlighting**

## 🚧 Future Enhancements

### Phase 1 (Current)
- ✅ Basic tournament simulation
- ✅ Player selection interface  
- ✅ Sample data visualization
- ✅ Database schema design
- ✅ API endpoints structure

### Phase 2 (Next)
- 🔄 Real duel data integration
- 🔄 Tournament registration system
- 🔄 Live bracket management
- 🔄 Admin tournament controls

### Phase 3 (Future)
- 📋 Double elimination brackets
- 📋 Head-to-head comparison tool
- 📋 Advanced analytics and charts
- 📋 Tournament scheduling system
- 📋 Prize pool management
- 📋 Player skill ratings (ELO)

## 🔧 Technical Details

### Database Triggers
Automatic statistics updates using PostgreSQL triggers:
```sql
CREATE TRIGGER trigger_update_dueling_aggregate_stats
    AFTER INSERT ON dueling_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_dueling_aggregate_stats();
```

### Bracket Generation Algorithm
```sql
CREATE OR REPLACE FUNCTION generate_tournament_bracket(tournament_uuid UUID)
```
Automatically creates bracket structure with proper seeding and match pairings.

### Performance Optimization
- Comprehensive indexing on all query paths
- Efficient aggregate stats via triggers
- Optimized API responses with selective data loading

## 🤝 Integration Points

### Player Stats System
- Links to existing `profiles` table via `player_id`
- Maintains `in_game_alias` for historical accuracy
- Separate tracking from CTF/team statistics

### Match System Integration  
- Can reference `matches` table for tournament duels
- Separate `duel_id` for unique identification
- Compatible with existing game stat infrastructure

### User Management
- Uses existing authentication system
- Integrates with current user profiles
- Maintains role-based permissions

## 📝 Development Notes

### Sample Data Strategy
The system generates realistic sample data for demonstration purposes when real tables don't exist yet. This allows:
- UI/UX testing without database setup
- Logic verification with realistic scenarios  
- Immediate visual feedback for stakeholders

### Error Handling
Comprehensive error handling for:
- Missing database tables (graceful degradation)
- Invalid tournament states
- Duplicate registrations
- Capacity limits

### Scalability Considerations
- Efficient queries with proper indexing
- Pagination support for large datasets
- Background job compatibility for match processing
- Cache-friendly data structures

This system provides a solid foundation for competitive dueling with room for extensive future enhancements! 

# Dueling System Implementation Guide

## Overview

The Dueling System is a comprehensive 1v1 combat system that integrates with your CTF game and website. It tracks detailed statistics, supports both unranked and ranked matches, and provides a complete web interface for viewing leaderboards and match history.

## Features

### 🎯 Core Dueling Features
- **Unranked Duels**: Quick 1v1 matches for practice
- **Ranked Bo3**: Best of 3 ranked matches for competitive play
- **Ranked Bo6**: Best of 6 ranked matches for extended competitive play
- **Challenge System**: Players can challenge each other with `?duel` commands
- **Tile-Based Ranked Matches**: Walk on special tiles to auto-match for ranked games

### 📊 Advanced Statistics Tracking
- **Kill/Death Ratios**: Track every kill and death in duels
- **Accuracy Statistics**: Monitor shots fired vs shots hit
- **HP Tracking**: Record remaining HP after each round
- **Burst Damage Detection**: Track double hits and triple hits within rapid succession
- **Match Duration**: Time each round and complete match
- **Weapon Statistics**: Track which weapons are used for kills

### 🏆 Ranking System
- **ELO Rating**: Competitive ranking system for ranked matches
- **Tier System**: Bronze, Silver, Gold, Platinum, Diamond, Master, Grandmaster, Legend
- **Peak ELO Tracking**: Remember your highest achieved rating
- **Separate Rankings**: Different rankings for Bo3 and Bo5 matches

### 🌐 Web Integration
- **Real-time Leaderboards**: View top players by various metrics
- **Match History**: Detailed view of recent matches with round-by-round breakdown
- **Player Profiles**: Individual statistics for each player
- **Multiple Sort Options**: Sort by win rate, ELO, accuracy, K/D ratio, etc.

## Database Schema

### Core Tables

#### `dueling_matches`
Tracks individual dueling matches:
- Match type (unranked, ranked_bo3, ranked_bo5)
- Player names and winner
- Round scores and match status
- Arena name and timestamps

#### `dueling_rounds`
Tracks individual rounds within matches:
- Round number and participants
- Winner/loser HP remaining
- Round duration
- Kill count per round

#### `dueling_kills`
Tracks individual kills within rounds:
- Killer/victim information
- Weapon used and damage dealt
- Shot accuracy (fired vs hit)
- Double/triple hit detection
- Timestamps for analysis

#### `dueling_player_stats`
Aggregated player statistics:
- Match and round win rates
- Kill/death ratios
- Accuracy statistics
- ELO ratings for ranked play
- Burst damage statistics

### Views and Functions

#### `dueling_leaderboard`
Pre-calculated leaderboard view with rankings.

#### `recent_dueling_matches`
Recent matches with round details as JSON.

#### Database Functions
- `start_dueling_match()`: Initialize a new match
- `record_dueling_kill()`: Log individual kills
- `complete_dueling_round()`: Finish a round
- `complete_dueling_match()`: Finish a match and update stats
- `update_dueling_player_stats()`: Recalculate player statistics

## CTF Script Integration

### Required Modifications

#### 1. Chat Command Handler
Add to your existing chat command processing:

```csharp
// In your chat command handler
if (command.StartsWith("?duel"))
{
    string payload = command.Length > 5 ? command.Substring(6) : "";
    await DuelingSystem.HandleDuelCommand(player, command, payload);
    return;
}
```

#### 2. Player Death Handler
Add to your player death event:

```csharp
// In your player death event handler
await DuelingSystem.HandlePlayerDeath(victim, killer, arena);
```

#### 3. Tile Step Handler (Optional)
For ranked tile functionality:

```csharp
// In your player position/tile step handler
await DuelingSystem.HandleTileStep(player, x, y);
```

#### 4. Damage Tracking (Optional)
For burst damage detection:

```csharp
// When a player deals damage (not necessarily kills)
DuelingSystem.TrackDamageHit(attacker.Name);
```

### Tile Coordinates Setup

Update the `DUELING_TILES` dictionary in `CTFUtilities.cs` with your actual map coordinates:

```csharp
private static readonly Dictionary<string, (short x, short y)> DUELING_TILES = new Dictionary<string, (short x, short y)>
{
    ["ranked_bo3"] = (512, 512),   // Replace with your Bo3 tile coordinates
    ["ranked_bo5"] = (256, 256)    // Replace with your Bo5 tile coordinates
};
```

## Web Interface Setup

### API Endpoints

#### `/api/dueling/stats`
- **GET**: Retrieve leaderboards with filtering and sorting
- **POST**: Submit match results from the game

#### `/api/dueling/matches`
- **GET**: Retrieve recent matches with detailed information

### Frontend Pages

#### `/dueling`
Main dueling page with:
- Leaderboard tab showing player rankings
- Recent matches tab showing match history
- Filtering by match type, player name
- Sorting by various statistics

### Features
- **Real-time Updates**: Statistics update immediately after matches
- **Responsive Design**: Works on desktop and mobile
- **Advanced Filtering**: Filter by match type, player name, date ranges
- **Detailed Match Views**: Click on matches to see round-by-round breakdown

## Commands Reference

### Player Commands

#### `?duel`
Show help and available commands.

#### `?duel challenge <player> [type]`
Challenge another player to a duel.
- `type`: `unranked` (default), `bo3`, or `bo6`
- Example: `?duel challenge PlayerName bo3`

#### `?duel accept`
Accept an incoming duel challenge.

#### `?duel decline`
Decline an incoming duel challenge.

#### `?duel forfeit`
Forfeit the current duel (if in progress).

#### `?duel stats [player]`
View dueling statistics for yourself or another player.

### Examples
```
?duel challenge TestPlayer
?duel challenge Enemy bo3
?duel accept
?duel stats TopDueler
```

## Configuration

### Environment Variables
Ensure these are set in your environment:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database operations

### Database Setup
1. Run the `setup-dueling-system.sql` script in your Supabase database
2. Verify all tables, views, and functions are created
3. Test with sample data if needed

### CTF Script Setup
1. Update `CTFUtilities.cs` with the dueling system code
2. Update tile coordinates for your specific map
3. Integrate the required event handlers
4. Test dueling functionality in-game

## Match Flow

### Unranked Duel Flow
1. Player A challenges Player B: `?duel challenge PlayerB`
2. Player B accepts: `?duel accept`
3. Single round duel begins
4. First death ends the match
5. Winner announced, statistics updated

### Ranked Duel Flow
1. Player A challenges Player B: `?duel challenge PlayerB bo3`
2. Player B accepts: `?duel accept`
3. Best of 3 (or 6) begins
4. Each death ends a round
5. First to win majority of rounds wins match
6. ELO ratings updated based on result

### Tile-Based Ranked Flow
1. Player walks onto ranked Bo3 or Bo6 tile
2. System looks for another player on a ranked tile
3. If found, automatically starts ranked match
4. If not found, player waits for opponent
5. Player can step off tile to cancel

## Statistics Explained

### Win Rate
Percentage of matches won out of total matches played.

### Kill/Death Ratio
Average kills per death across all dueling matches.

### Accuracy
Percentage of shots that hit their target.

### ELO Rating
Competitive rating that increases/decreases based on wins/losses against similarly rated opponents.

### Burst Damage Ratio
Percentage of kills that were double hits or triple hits (rapid successive damage).

### Double/Triple Hits
- **Double Hit**: Two hits within 500ms
- **Triple Hit**: Three hits within 750ms

## Troubleshooting

### Common Issues

#### Duels Not Starting
- Check that both players are in the same arena
- Verify neither player is already in an active duel
- Ensure the challenge hasn't expired (2-minute timeout)

#### Statistics Not Updating
- Verify API endpoint is accessible from the game server
- Check Supabase service role key permissions
- Review server logs for HTTP request errors

#### Database Errors
- Ensure all required tables and functions exist
- Verify RLS policies allow the operations
- Check that the service role key has proper permissions

### Debugging Tips

#### Enable Logging
Add console logging to track duel events:
```csharp
Console.WriteLine($"Duel started: {player1.Name} vs {player2.Name}");
```

#### Test API Endpoints
Use tools like Postman to test the API endpoints directly.

#### Verify Database Functions
Test database functions directly in Supabase SQL editor.

## Future Enhancements

### Possible Additions
- **Tournament System**: Bracket-style tournaments
- **Team Duels**: 2v2 or 3v3 team-based dueling
- **Spectator Mode**: Allow other players to watch duels
- **Replay System**: Save and replay duel matches
- **Advanced Analytics**: Heat maps, weapon effectiveness charts
- **Achievements**: Unlock achievements for various dueling milestones
- **Betting System**: Allow players to bet on duel outcomes

### Integration Opportunities
- **Discord Bot**: Post duel results to Discord
- **Twitch Integration**: Stream duel matches
- **Mobile App**: Dedicated mobile app for viewing statistics

## Support

For issues or questions about the dueling system:
1. Check the troubleshooting section above
2. Review the database logs for errors
3. Test individual components (database, API, game integration)
4. Ensure all dependencies are properly installed

Remember to backup your database before making any changes! 