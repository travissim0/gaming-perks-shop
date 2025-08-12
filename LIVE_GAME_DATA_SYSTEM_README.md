# Live Game Data Monitoring System

## Overview

The Live Game Data Monitoring System provides real-time visibility into active CTF games with comprehensive player state tracking, team grouping, class play time analysis, and dueling status monitoring. This system was created to improve the accuracy of match results and ensure perfect synchronization between the game server and website.

## Features

### Real-Time Player Monitoring
- **Team Grouping**: Players separated by teams with offense/defense designators
- **Class Color Coding**: Visual class identification using established color schemes
- **Spectator Management**: Separate grouping for Team NP and Team Spec players
- **Dueling Status**: Live tracking of active duels with opponent information
- **Health/Energy Monitoring**: Real-time player condition tracking

### Game State Tracking
- **Game Type Detection**: OvD (Offense vs Defense) vs Mix game identification
- **Base Usage**: Current map base being used
- **Player Counts**: Total players, active players, and spectators
- **Server Status**: Active/Idle status with connection health

### Class Play Time Analysis
- **Individual Class Times**: Time spent in each class per player
- **Total Play Time**: Cumulative game participation time
- **Class Switching**: Historical class usage patterns
- **Minimum Thresholds**: Only displays classes with meaningful play time (5+ seconds)

### Data Synchronization
- **30-Second Polling**: Automatic updates every 30 seconds
- **Staleness Detection**: Alerts when data is older than 2 minutes
- **Connection Status**: Real-time sync status monitoring
- **Error Handling**: Graceful degradation when server is unavailable

## Technical Architecture

### API Endpoints

#### `/api/live-game-data` (Enhanced)
- **POST**: Receives live game data from CTF server
- **GET**: Provides enhanced game data with metrics
- **HEAD**: Quick status check for monitoring tools

#### Data Flow
```
CTF Game Server → POST /api/live-game-data → In-Memory Storage → GET /api/live-game-data → Live Monitoring Page
```

### Page Location
- **URL**: `/livegamedata`
- **Visibility**: Hidden from navigation (manual access only)
- **Purpose**: Real-time monitoring and debugging

## Data Structure

### Player Data
```typescript
interface PlayerData {
  alias: string;                    // Player name
  team: string;                     // Team name (e.g., "WC C", "PT T")
  teamType: string;                 // "Titan" or "Collective"
  className: string;                // Current class
  isOffense: boolean;               // Offense/Defense role
  weapon: string;                   // Special weapon if any
  classPlayTimes?: { [className: string]: number }; // Class time in ms
  totalPlayTime?: number;           // Total game time in ms
  isDueling?: boolean;              // Currently dueling
  duelOpponent?: string;            // Opponent name
  duelType?: string;                // Duel type (Bo3, Bo5, etc.)
  currentHealth?: number;           // Current HP
  currentEnergy?: number;           // Current energy
  isAlive?: boolean;                // Alive/dead status
}
```

### Game Data
```typescript
interface GameData {
  arenaName: string;                // Arena/map name
  gameType: string;                 // "OvD" or "Mix"
  baseUsed: string;                 // Current base
  players: PlayerData[];            // All players
  lastUpdated: string;              // ISO timestamp
  totalPlayers: number;             // Total count
  playingPlayers: number;           // Active players
  spectators: number;               // Spectator count
  serverStatus: 'active' | 'idle';  // Server state
  dataStale: boolean;               // Data freshness
  dataAge: number;                  // Age in seconds
}
```

## Usage Guide

### Accessing the Monitor
1. Navigate to `https://freeinf.org/livegamedata`
2. Page will automatically start polling for data
3. Updates refresh every 30 seconds

### Visual Indicators

#### Connection Status
- **🟢 SYNCED**: Data is fresh and current
- **🟡 SYNCING...**: Fetching new data
- **🟠 STALE DATA**: Data is older than 2 minutes
- **🔴 DISCONNECTED**: Cannot reach server

#### Team Organization
- **Offense Teams**: Display first with red indicator
- **Defense Teams**: Display second with blue indicator
- **Spectators**: Display last, grouped separately, with reduced opacity

#### Player Information
- **Class Colors**: Each class has a distinct color (Infantry=red, Heavy=blue, etc.)
- **Play Times**: Shows total time and individual class times
- **Dueling Status**: Red "DUELING" badge when in active duel
- **Health Status**: Orange badge when below full health
- **Weapons**: Special weapons displayed in gray badges

### Class Color Scheme
- **Infantry**: Red (#ef4444)
- **Heavy Weapons**: Blue (#0891b2)
- **Squad Leader**: Green (#22c55e)
- **Combat Engineer**: Brown (#a3621b)
- **Field Medic**: Yellow (#ca8a04)
- **Infiltrator**: Purple (#d946ef)
- **Jump Trooper**: Gray (#6b7280)

## CTF Server Integration

### Sending Data to Website
The CTF server should POST data to `/api/live-game-data` with the following structure:

```json
{
  "arenaName": "CTF_Arena",
  "gameType": "OvD",
  "baseUsed": "North Base",
  "players": [
    {
      "alias": "PlayerName",
      "team": "WC C",
      "teamType": "Collective",
      "className": "Infantry",
      "isOffense": false,
      "weapon": "Standard",
      "classPlayTimes": {
        "Infantry": 45000,
        "Heavy Weapons": 12000
      },
      "totalPlayTime": 57000,
      "isDueling": false,
      "currentHealth": 60,
      "currentEnergy": 600,
      "isAlive": true
    }
  ]
}
```

### Recommended Update Frequency
- **During Active Games**: Every 10-15 seconds
- **Between Games**: Every 30-60 seconds
- **No Players**: Stop sending updates

## Monitoring and Debugging

### Debug Information
- Click "Debug Information" at the bottom to see raw JSON data
- Check browser developer console for API errors
- Monitor network tab for failed requests

### Common Issues

#### No Data Appearing
1. Check if CTF server is sending data to `/api/live-game-data`
2. Verify JSON structure matches expected format
3. Check server logs for POST request errors

#### Stale Data Warning
1. CTF server may have stopped sending updates
2. Network connectivity issues between server and website
3. Server-side processing delays

#### Connection Errors
1. Website API endpoint may be down
2. CORS issues if CTF server is on different domain
3. Rate limiting or request blocking

## Performance Considerations

### Memory Usage
- Data stored in server memory (not persistent)
- Automatic cleanup of stale data after 2 minutes
- No historical data retention

### Network Traffic
- Minimal payload size (~1-5KB per update)
- Compressed JSON responses
- Efficient polling with cache headers

### Scalability
- Single active game supported
- No concurrent game handling
- Suitable for single-server deployments

## Future Enhancements

### Potential Improvements
1. **Historical Data**: Store game history in database
2. **Multiple Arenas**: Support concurrent games
3. **Real-time WebSocket**: Replace polling with live connections
4. **Performance Metrics**: Add latency and accuracy tracking
5. **Alert System**: Notifications for game events
6. **Mobile Optimization**: Responsive design improvements

### Integration Options
1. **Admin Dashboard**: Integrate with existing admin panel
2. **Public API**: Expose read-only endpoints for third parties
3. **Game Recording**: Automatic match recording triggers
4. **Statistics Integration**: Feed into existing stats system

## Security Notes

- Page is hidden from main navigation
- No authentication required (monitoring only)
- Read-only access to game data
- No sensitive information exposed
- Rate limiting recommended for API endpoints

## Troubleshooting

### Testing Without Game Server
1. Use browser developer tools to POST test data to `/api/live-game-data`
2. Create mock data matching the expected JSON structure
3. Monitor the live page for proper data display

### Verification Steps
1. **API Connectivity**: GET `/api/live-game-data` should return current data
2. **Data Format**: Verify all required fields are present
3. **Update Frequency**: Confirm 30-second refresh cycles
4. **Visual Display**: Check team grouping and class colors
5. **Status Indicators**: Verify connection status accuracy

For additional support or bug reports, check the game server logs and website API logs for detailed error information.