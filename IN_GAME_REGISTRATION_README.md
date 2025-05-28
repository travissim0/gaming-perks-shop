# In-Game Registration System

This document explains the in-game registration system that allows Infantry Online players to register for the donation website directly from within the game.

## Overview

The in-game registration system enables players to:
1. Register using their current in-game alias
2. Provide their email address via game chat command
3. Receive a verification email
4. Complete registration by setting a password via web interface
5. Access the full donation system and dashboard

## System Components

### 1. API Endpoint (`/api/in-game-register`)
- **Purpose**: Handles registration requests from the game server
- **Method**: POST
- **Payload**: `{ "alias": "PlayerName", "email": "player@example.com" }`
- **Features**:
  - Email format validation
  - Duplicate email/alias checking
  - User account creation with pending status
  - Automatic verification email sending

### 2. Registration Completion Page (`/auth/complete-registration`)
- **Purpose**: Allows users to set password after email verification
- **Features**:
  - Email verification handling
  - Password setting form
  - Account activation
  - Automatic redirect to dashboard

### 3. C# Game Integration (`InGameRegistration.cs`)
- **Purpose**: Provides in-game commands for registration
- **Commands**:
  - `?register email@example.com` - Initiate registration
  - `?checkregistration` - View registration info
  - `?regstatus` - Same as checkregistration

### 4. Database Schema Updates
- **Table**: `profiles`
- **New Field**: `registration_status` (pending_verification, completed)
- **Purpose**: Track registration progress

## Installation Steps

### 1. Database Migration
Run the SQL migration to add registration status tracking:

```sql
-- Execute in Supabase SQL editor
\i add-registration-status-field.sql
```

### 2. Environment Variables
Ensure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # Your website URL
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
```

### 3. Game Server Integration
Add the registration code to your Infantry Online server:

1. **Copy the C# code** from `InGameRegistration.cs` into your game server project
2. **Update the API endpoint** URL in the C# code to match your domain
3. **Add command handlers** to your main game script:

```csharp
public override bool playerChatCommand(Player player, Player recipient, string command, string payload)
{
    switch (command.ToLower())
    {
        case "register":
            _ = InGameRegistration.HandleRegisterCommand(player, command, payload);
            return true;
            
        case "checkregistration":
        case "regstatus":
            _ = InGameRegistration.HandleCheckRegistrationCommand(player, command, payload);
            return true;
    }
    
    return base.playerChatCommand(player, recipient, command, payload);
}
```

### 4. Email Configuration
Ensure Supabase email settings are configured:
- SMTP settings in Supabase dashboard
- Custom email templates (optional)
- Proper redirect URLs for verification

## Usage Flow

### Player Registration Process

1. **In-Game Command**
   ```
   Player types: ?register john.doe@gmail.com
   ```

2. **Server Processing**
   - Validates email format
   - Checks for duplicates
   - Sends API request to website
   - Displays confirmation message

3. **Email Verification**
   - Player receives verification email
   - Clicks verification link
   - Redirected to password setup page

4. **Account Completion**
   - Player sets password
   - Account status updated to 'completed'
   - Redirected to dashboard

### Example In-Game Messages

**Successful Registration:**
```
=== REGISTRATION INITIATED ===
Alias: PlayerName
Email: player@example.com

Check your email to complete registration!
You'll receive a verification link to set your password.

After completing registration, you can:
• Purchase donation perks
• Access your dashboard
• View your donation history
```

**Registration Info:**
```
=== REGISTRATION STATUS ===
Current Alias: PlayerName

To register for the donation system:
1. Use: ?register your-email@example.com
2. Check your email for verification link
3. Set your password to complete registration
4. Access your dashboard at the website

Benefits of registering:
• Purchase exclusive donation perks
• Custom kill messages
• Special weapons and abilities
• Support server development
```

## Error Handling

### Common Errors and Solutions

1. **Invalid Email Format**
   - Message: "Invalid email format. Please use a valid email address."
   - Solution: Player uses proper email format

2. **Email Already Registered**
   - API Response: 409 Conflict
   - Message: "Email already registered"
   - Solution: Player uses different email or logs into existing account

3. **Alias Already Taken**
   - API Response: 409 Conflict
   - Message: "In-game alias already taken"
   - Solution: Player changes alias or contacts admin

4. **API Connection Issues**
   - Message: "Registration failed. Please try again later."
   - Solution: Check server connectivity and API endpoint

## Security Features

### Input Validation
- Email format validation (regex)
- Alias length limits (2-20 characters)
- SQL injection prevention
- XSS protection

### Account Security
- Email verification required
- Password strength requirements (6+ characters)
- Secure session handling
- CSRF protection

### Rate Limiting
- Consider implementing rate limiting on registration endpoint
- Prevent spam registrations
- Monitor for abuse

## Monitoring and Logging

### Server Logs
The system logs important events:
- Registration attempts
- API responses
- Error conditions
- Email sending status

### Database Tracking
Monitor registration metrics:
```sql
-- Check registration status distribution
SELECT registration_status, COUNT(*) 
FROM profiles 
GROUP BY registration_status;

-- Recent registrations
SELECT email, in_game_alias, created_at, registration_status
FROM profiles 
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

## Troubleshooting

### Common Issues

1. **Emails Not Sending**
   - Check Supabase SMTP configuration
   - Verify email templates
   - Check spam folders

2. **API Endpoint Not Reachable**
   - Verify server is running
   - Check firewall settings
   - Confirm URL in C# code

3. **Registration Stuck in Pending**
   - Check email delivery
   - Verify verification link functionality
   - Manual completion if needed

### Debug Commands

Test the registration API:
```bash
# Test registration endpoint
curl -X POST http://localhost:3000/api/in-game-register \
  -H "Content-Type: application/json" \
  -d '{"alias":"TestPlayer","email":"test@example.com"}'
```

## Future Enhancements

### Potential Improvements

1. **Enhanced Validation**
   - Profanity filter for aliases
   - Disposable email detection
   - Captcha integration

2. **Additional Features**
   - Password reset from in-game
   - Account linking for existing users
   - Registration statistics dashboard

3. **Integration Enhancements**
   - Real-time registration status checking
   - In-game notifications for completed registrations
   - Automatic perk activation

## Support

### For Players
- Use `?checkregistration` for help
- Contact server administrators for issues
- Check email spam folders for verification

### For Administrators
- Monitor server logs for errors
- Check Supabase dashboard for user management
- Use debug scripts for troubleshooting

## Files Created/Modified

### New Files
- `src/app/api/in-game-register/route.ts` - Registration API endpoint
- `src/app/auth/complete-registration/page.tsx` - Password setup page
- `InGameRegistration.cs` - Game server integration
- `add-registration-status-field.sql` - Database migration

### Configuration
- Environment variables for site URL
- Supabase email settings
- Game server API endpoint configuration

This system provides a seamless bridge between the Infantry Online game and the web-based donation system, making it easy for players to register and access premium features. 