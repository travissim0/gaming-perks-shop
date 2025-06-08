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