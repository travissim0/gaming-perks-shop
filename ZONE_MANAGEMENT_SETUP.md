# Infantry Zone Management System Setup

This guide will help you set up the Infantry Zone Management system to control your game zones from the web interface.

## Prerequisites

- Linux server running both Infantry zones and the Node.js web application
- Admin privileges on the server
- Root access to create scripts and directories

## 1. Server Setup (Linux Server)

### Step 1: Create the script directory
```bash
mkdir -p /root/Infantry/scripts
mkdir -p /root/Infantry/logs
```

### Step 2: Create the zone management script
Create `/root/Infantry/scripts/zone-manager.sh` with the content from the `zone-management-scripts.md` file.

### Step 3: Make scripts executable
```bash
chmod +x /root/Infantry/scripts/zone-manager.sh
```

### Step 4: Test the scripts
```bash
# List all zones
/root/Infantry/scripts/zone-manager.sh list

# Get status of all zones
/root/Infantry/scripts/zone-manager.sh status-all

# Test individual zone operations
/root/Infantry/scripts/zone-manager.sh status ctf
```

## 2. No Additional Configuration Needed!

Since your Infantry server and web application are running on the same Linux server, no SSH configuration is required. The Node.js application can execute the zone management scripts directly using local shell commands.

## 4. Database Setup (Optional)

If you want to log admin actions, create the admin_logs table:

```sql
CREATE TABLE IF NOT EXISTS admin_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view logs
CREATE POLICY "Admins can view admin logs" ON admin_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- Allow system to insert logs
CREATE POLICY "System can insert admin logs" ON admin_logs
    FOR INSERT WITH CHECK (true);
```

## 5. Zone Directory Structure

Make sure your Infantry server has the following directory structure:

```
/root/Infantry/
├── Zones/
│   ├── CTF - Twin Peaks 2.0/
│   │   └── ZoneServer.dll
│   ├── CTF - Twin Peaks Classic/
│   │   └── ZoneServer.dll
│   ├── League - USL Matches/
│   │   └── ZoneServer.dll
│   ├── League - USL Secondary/
│   │   └── ZoneServer.dll
│   └── Skirmish - Minimaps/
│       └── ZoneServer.dll
├── scripts/
│   └── zone-manager.sh
└── logs/
    └── zone-manager.log
```

## 6. Testing the System

### Test from command line:
```bash
# Test the script directly
/root/Infantry/scripts/zone-manager.sh status-all

# Test individual zone operations
/root/Infantry/scripts/zone-manager.sh status ctf
/root/Infantry/scripts/zone-manager.sh list
```

### Test from web interface:
1. Log in as an admin user
2. Navigate to `/admin/zones`
3. You should see all zones with their current status
4. Try starting/stopping/restarting a zone

## 7. Security Considerations

1. **Script Permissions**: Ensure zone management scripts have proper execution permissions (755)
2. **User Access**: Only grant zone management access to trusted administrators
3. **Logging**: All zone management actions are logged for audit purposes
4. **File System**: Ensure proper directory permissions for `/root/Infantry/` structure

## 8. Troubleshooting

### Common Issues:

1. **Script Execution Failed**
   - Check script execution permissions: `chmod +x /root/Infantry/scripts/zone-manager.sh`
   - Verify the script path exists: `ls -la /root/Infantry/scripts/`
   - Test script manually: `/root/Infantry/scripts/zone-manager.sh list`

2. **Zone Not Found**
   - Verify zone directory structure: `ls -la /root/Infantry/Zones/`
   - Check zone name mapping in the script
   - Ensure ZoneServer.dll exists in zone directories

3. **Permission Denied**
   - Verify Node.js process has access to execute scripts
   - Check screen session permissions
   - Ensure proper directory permissions for `/root/Infantry/`

4. **API Errors**
   - Check admin status in database
   - Review server logs for detailed error messages
   - Verify Node.js can execute shell commands

## 9. Monitoring

The system provides:
- Real-time zone status updates
- Automatic refresh every 30 seconds
- Action logging for security audits
- Error reporting and notifications

## 10. Extending the System

You can extend this system by:
- Adding more zone types to the mapping
- Implementing zone configuration management
- Adding player count monitoring
- Creating automated restart schedules
- Adding notification systems for zone status changes 