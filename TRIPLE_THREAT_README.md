# Triple Threat League System

## Overview

The Triple Threat league is a comprehensive 3v3 Infantry tournament and league management system built into the CTFPL gaming platform. It features secure team management, tournament organization, and detailed statistics tracking.

## Features

### Team Management (Pods)
- **Team Creation**: Secure team creation with password protection
- **Team Joining**: Password-protected team joining system
- **Team Composition**: Maximum 4 players per team (3 active + 1 alternate)
- **Team Banners**: Optional banner upload for team customization
- **Owner Management**: Team owners can manage membership and reset passwords

### Database Structure

All Triple Threat tables use the `tt_` prefix to keep them organized:

- `tt_teams` - Team/pod information with encrypted passwords
- `tt_team_members` - Team membership tracking
- `tt_tournaments` - Tournament organization
- `tt_tournament_registrations` - Team tournament registrations
- `tt_matches` - Individual matches between teams
- `tt_match_series` - Series within matches (best-of-X format)
- `tt_match_rounds` - Individual rounds within series
- `tt_player_stats` - Comprehensive player statistics

### Statistics Tracking

The system tracks comprehensive statistics:

#### Individual Player Stats
- Round wins and losses
- Series wins and losses
- Kills and deaths
- K/D ratios
- Tournament-specific stats vs overall stats

#### Team Stats
- Match wins and losses
- Tournament performance
- Series completion rates

#### Leaderboards
- Top 10 by Series Wins
- Top 10 by Total Kills
- Top 10 by K/D Ratio
- Team Rankings

### Tournament System

- **Multiple Tournament Types**: League play, elimination brackets, Swiss format
- **Registration Management**: Team registration with deadlines
- **Bracket Generation**: Automated tournament bracket creation
- **Match Scheduling**: Flexible match scheduling system
- **Result Tracking**: Comprehensive match and series result recording

## Navigation Structure

The Triple Threat system is integrated under the "Misc" navigation section:

- **Main Page** (`/triple-threat`): Overview, features, getting started
- **Rules** (`/triple-threat/rules`): Complete tournament rules and regulations
- **Team Signup** (`/triple-threat/signup`): Team creation and joining interface
- **Matches** (`/triple-threat/matches`): Match schedule and results

## Database Setup

### 1. Run the SQL Script

Execute the `create-triple-threat-tables.sql` file in your Supabase SQL editor to create all necessary tables, indexes, RLS policies, and helper functions.

### 2. Verify Setup

Use the admin endpoint to verify all tables are created correctly:

```bash
POST /api/admin/setup-triple-threat-tables
```

### 3. Required Extensions

The system requires these PostgreSQL extensions:
- `uuid-ossp` - For UUID generation
- `pgcrypto` - For password encryption

## Key Security Features

### Password Protection
- All team passwords are encrypted using bcrypt via PostgreSQL's `crypt()` function
- Password verification is handled server-side through RPC functions
- Minimum 6-character password requirement

### Row Level Security (RLS)
- All tables have RLS enabled with appropriate policies
- Team owners can manage their teams
- Public viewing of team information and stats
- Admin-only access for tournament and match management

### Access Control
- Team creation requires authentication
- Team joining requires correct password
- Team management restricted to owners
- Tournament administration requires admin privileges

## API Endpoints

### Team Management
- Team creation and password hashing (via database triggers)
- Team joining with password verification
- Team member management
- Password reset functionality (owners only)

### Tournament Management
- Tournament creation and management (admin only)
- Team registration for tournaments
- Match scheduling and result recording

## File Structure

```
src/app/triple-threat/
├── page.tsx                 # Main Triple Threat landing page
├── rules/page.tsx          # Tournament rules and regulations
├── signup/page.tsx         # Team creation and joining
└── matches/page.tsx        # Match schedule and results

src/app/api/triple-threat/
├── reset-password/route.ts # Password reset API
└── ../admin/setup-triple-threat-tables/route.ts # Setup verification

create-triple-threat-tables.sql # Database schema and setup
```

## Usage Instructions

### For Players

1. **Join the League**: Navigate to Triple Threat from the Misc menu
2. **Create or Join Team**: Use the Team Signup page to create a new pod or join existing team
3. **Team Management**: Team owners can manage membership and upload banners
4. **Tournament Participation**: Register for tournaments when registration opens
5. **Track Performance**: View match results and personal statistics

### For Tournament Administrators

1. **Tournament Creation**: Use admin tools to create tournaments
2. **Registration Management**: Set registration deadlines and team limits
3. **Match Scheduling**: Schedule matches and manage brackets
4. **Result Recording**: Record match results and update statistics
5. **Leaderboard Management**: Monitor and maintain ranking systems

## Integration with Existing System

The Triple Threat system is designed to integrate seamlessly with the existing CTFPL platform:

- Uses existing authentication system
- Follows established UI/UX patterns
- Leverages existing Supabase infrastructure
- Maintains consistency with squad/team management patterns
- Reuses existing image upload and storage systems

## Future Enhancements

Based on the creator's wishlist, potential future additions include:

- **Advanced Statistics**: Round-by-round stat tracking within series
- **Bracket Visualization**: Built-in tournament bracket display
- **Live Match Tracking**: Real-time match status and scoring
- **Streaming Integration**: Featured match streaming capabilities
- **Enhanced Leaderboards**: More detailed ranking categories
- **Tournament History**: Historical tournament performance tracking

## Technical Notes

### Database Performance
- Comprehensive indexing on all frequently queried columns
- Optimized RPC functions for complex queries
- Efficient foreign key relationships

### Security Considerations
- All passwords encrypted using industry-standard bcrypt
- RLS policies prevent unauthorized data access
- Input validation on all user inputs
- SQL injection prevention through parameterized queries

### Scalability
- Designed to handle multiple concurrent tournaments
- Efficient team and player management
- Optimized for fast leaderboard calculations
- Support for large numbers of teams and matches

## Support and Maintenance

The system includes comprehensive error handling, logging, and administrative tools for ongoing maintenance. All database operations are wrapped in try-catch blocks with appropriate user feedback.

For questions or issues with the Triple Threat system, contact the tournament administrators through the platform's existing support channels.
