# Infantry Online Donation Tracking System

This system allows you to track donations with in-game aliases and display them in the Infantry Online game server.

## Features

- **In-Game Alias Tracking**: Store and display the player's Infantry Online alias with each donation
- **Donation Messages**: Optional messages that donors can include with their donations
- **Real-time Display**: Show recent donations in-game with mod commands and automatic announcements
- **Web Integration**: Full integration between Stripe payments, Supabase database, and Infantry Online server

## Database Schema

The system uses the following structure:

- `donation_transactions` table: Stores donation data with `donation_message` field
- `user_profiles` table: Contains `in_game_alias` field linked via `user_id`
- `products` table: Referenced by `product_id` in donation_transactions

Key fields:
- `donation_message` (TEXT): Optional message to display with the donation
- `in_game_alias` (from user_profiles): The player's Infantry Online alias for in-game display

## Setup Instructions

### 1. Database Setup

If you're setting up a new database:
```sql
-- Run the complete setup
\i donation-tracking-setup.sql
```

If you already have a donation_transactions table:
```sql
-- Run the migration to add new fields
\i database-migration-add-donation-fields.sql
```

### 2. Website API Setup

The system includes these API endpoints:

- `/api/donation-transaction` - Get specific transaction details
- `/api/recent-donations` - Get recent donations for in-game display

### 3. Infantry Online Server Integration

#### Option A: Add to Existing CTF Script

1. Copy `DonationDisplay.cs` to your scripts folder
2. Add the integration code from `CTF_DonationIntegration_Example.cs` to your existing CTF script
3. Update the `WEBSITE_URL` constant in `DonationDisplay.cs` to match your website

#### Option B: Standalone Implementation

Use the `DonationDisplay.cs` class directly in any script.

## Usage

### In-Game Commands

**Mod Commands:**
- `*donations` or `*showdonations` - Display recent donations to the mod
- `*announcedonations` - Announce recent donations to the entire arena

**Player Commands:**
- `?donations` or `?support` - Display recent donations to the player

### Automatic Features

- **Periodic Announcements**: Recent donations are announced every 5 minutes
- **New Player Welcome**: New players see recent donations after 5 seconds
- **Game Start Display**: Recent donations shown when games start

### API Usage

**Get Recent Donations:**
```
GET /api/recent-donations?hours=24&limit=10
```

Response format:
```json
{
  "donations": [
    {
      "id": "uuid",
      "amount": "25.00",
      "currency": "USD",
      "alias": "PlayerAlias",
      "message": "Great server!",
      "timestamp": "2024-01-01T12:00:00Z",
      "displayText": "PlayerAlias donated $25.00: \"Great server!\""
    }
  ],
  "count": 1,
  "timeframe": "24 hours",
  "lastUpdated": "2024-01-01T12:00:00Z"
}
```

## Configuration

### Website URL
Update the `WEBSITE_URL` constant in `DonationDisplay.cs`:
```csharp
private const string WEBSITE_URL = "https://your-website.com";
```

### Announcement Timing
Modify the announcement interval in your CTF script:
```csharp
private const int DONATION_ANNOUNCEMENT_INTERVAL = 300000; // 5 minutes
```

### Display Limits
Adjust how many donations to show:
```csharp
// For arena announcements
await _donationDisplay.GetRecentDonations(24, 5); // 24 hours, max 5

// For individual players
await _donationDisplay.GetRecentDonations(24, 10); // 24 hours, max 10
```

## Data Flow

1. **Donation Made**: Player makes donation on website with Stripe
2. **Data Stored**: Transaction stored in Supabase with `in_game_alias` and `donation_message`
3. **Success Page**: Player sees confirmation with their alias and message
4. **In-Game Display**: Infantry Online server fetches and displays recent donations

## Security Notes

- The `/api/recent-donations` endpoint is public (no authentication required)
- Only completed donations are displayed
- Personal information (email, full name) is not exposed in the public API
- Mod commands can be restricted to admins/developers only

## Troubleshooting

### Common Issues

1. **No donations showing**: Check that donations have `status = 'completed'`
2. **API errors**: Verify `WEBSITE_URL` is correct and accessible
3. **Permission errors**: Ensure mod commands have proper permission checks

### Logging

The system logs all errors using Infantry Online's logging system:
```csharp
Log.write(TLog.Error, $"Error message: {ex.Message}");
```

Check your Infantry Online logs for detailed error information.

## Example Integration

Here's a minimal example of adding donation display to your script:

```csharp
public class Script_CTF : Scripts.IScript
{
    private DonationDisplay _donationDisplay;

    public override bool init(IEventObject invoker)
    {
        _donationDisplay = new DonationDisplay(_arena);
        return true;
    }

    public override bool playerModCommand(Player player, Player recipient, string command, string payload)
    {
        if (command.ToLower() == "donations")
        {
            Task.Run(async () => await _donationDisplay.HandleDonationsCommand(player, payload));
            return true;
        }
        return false;
    }
}
```

## Support

For issues or questions about the donation system, check:
1. Infantry Online server logs for error messages
2. Website API endpoints for connectivity
3. Database for proper data storage
4. Supabase dashboard for transaction status 