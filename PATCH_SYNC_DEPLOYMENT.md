# Patch Notes Sync System - Deployment Guide

This guide will help you set up automatic syncing of patch notes from your Infantry Online game server to your web application.

## 📋 Overview

The sync system automatically copies your game's `ctfpl.nws` file to the web application whenever it's updated, ensuring your website always shows the latest patch notes without manual intervention.

### ✨ Features

- ⚡ **Smart Sync**: Only copies when the game file has been modified
- 🔒 **Safe Operation**: Uses atomic operations and file locking
- 📊 **Comprehensive Logging**: Detailed logs for monitoring and debugging
- 🔄 **Automatic Backups**: Keeps the last 10 versions of patch notes
- 🚫 **Non-Intrusive**: Minimal impact on game server performance
- ⏰ **Flexible Scheduling**: Runs every 2 minutes via cron job

## 🛠️ Installation

### Prerequisites

- Linux server with both Infantry Online and the web application
- Root/sudo access
- Infantry Online server at: `/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws`
- Web application at: `/var/www/gaming-perks-shop`

### Step 1: Upload Files

Upload these files to your server (any directory):
- `sync-patch-notes.sh`
- `setup-patch-sync.sh`

```bash
# Make the setup script executable
chmod +x setup-patch-sync.sh
chmod +x sync-patch-notes.sh
```

### Step 2: Run Setup

```bash
# Run the setup script as root
sudo ./setup-patch-sync.sh
```

The setup script will:
- ✅ Check prerequisites
- 📁 Create necessary directories
- 🔧 Install the sync script
- ⏰ Set up automatic cron job (every 2 minutes)
- 📝 Configure log rotation
- 🧪 Perform initial sync test

### Step 3: Verify Installation

```bash
# Check if sync is working
tail -f /var/www/gaming-perks-shop/logs/patch-sync.log

# Manual sync test
sync-patch-notes

# Check cron job
crontab -l
```

## 📂 File Structure

After installation, you'll have:

```
/var/www/gaming-perks-shop/
├── public/
│   └── ctfpl.nws                    # Synced patch notes file
├── logs/
│   └── patch-sync.log               # Sync operation logs
├── patch-notes-backups/
│   ├── ctfpl.nws.20241201_143022    # Backup files
│   └── ...
└── sync-patch-notes.sh              # Sync script
```

## 🎛️ Management Commands

### View Live Logs
```bash
tail -f /var/www/gaming-perks-shop/logs/patch-sync.log
```

### Manual Sync
```bash
sync-patch-notes
```

### Check Sync Status
```bash
# View recent sync activity
tail -n 20 /var/www/gaming-perks-shop/logs/patch-sync.log

# Check file modification times
ls -la /root/Infantry/Zones/CTF\ -\ Twin\ Peaks\ 2.0/assets/ctfpl.nws
ls -la /var/www/gaming-perks-shop/public/ctfpl.nws
```

### Cron Job Management
```bash
# View current cron jobs
crontab -l

# Edit cron jobs (if needed)
crontab -e

# Disable sync temporarily
crontab -l | grep -v sync-patch-notes | crontab -

# Re-enable sync
(crontab -l 2>/dev/null; echo "*/2 * * * * /var/www/gaming-perks-shop/sync-patch-notes.sh >/dev/null 2>&1") | crontab -
```

## 🔧 Configuration

### Sync Frequency

Default: Every 2 minutes

To change frequency, edit the cron job:
```bash
crontab -e

# Examples:
# Every minute:     * * * * * /var/www/gaming-perks-shop/sync-patch-notes.sh >/dev/null 2>&1
# Every 5 minutes:  */5 * * * * /var/www/gaming-perks-shop/sync-patch-notes.sh >/dev/null 2>&1
# Every 10 minutes: */10 * * * * /var/www/gaming-perks-shop/sync-patch-notes.sh >/dev/null 2>&1
```

### File Paths

To change file paths, edit `sync-patch-notes.sh`:
```bash
nano /var/www/gaming-perks-shop/sync-patch-notes.sh

# Modify these variables:
GAME_NWS_FILE="/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws"
WEB_NWS_FILE="/var/www/gaming-perks-shop/public/ctfpl.nws"
```

## 📊 Monitoring

### Log Analysis
```bash
# View sync frequency
grep "Successfully synced" /var/www/gaming-perks-shop/logs/patch-sync.log | tail -10

# Check for errors
grep "ERROR" /var/www/gaming-perks-shop/logs/patch-sync.log | tail -10

# View sync statistics
grep "Sync completed" /var/www/gaming-perks-shop/logs/patch-sync.log | tail -5
```

### Health Check Script
```bash
#!/bin/bash
# Save as: check-patch-sync-health.sh

echo "=== Patch Sync Health Check ==="
echo

# Check if cron job exists
if crontab -l 2>/dev/null | grep -q sync-patch-notes; then
    echo "✓ Cron job is active"
else
    echo "✗ Cron job is missing"
fi

# Check file existence
if [ -f "/var/www/gaming-perks-shop/public/ctfpl.nws" ]; then
    echo "✓ Synced file exists"
    echo "  Size: $(stat -c%s /var/www/gaming-perks-shop/public/ctfpl.nws) bytes"
    echo "  Modified: $(stat -c%y /var/www/gaming-perks-shop/public/ctfpl.nws)"
else
    echo "✗ Synced file missing"
fi

# Check recent sync activity
if [ -f "/var/www/gaming-perks-shop/logs/patch-sync.log" ]; then
    LAST_SYNC=$(grep "Sync completed\|Successfully synced" /var/www/gaming-perks-shop/logs/patch-sync.log | tail -1)
    if [ -n "$LAST_SYNC" ]; then
        echo "✓ Recent sync activity found"
        echo "  $LAST_SYNC"
    else
        echo "✗ No recent sync activity"
    fi
else
    echo "✗ Log file missing"
fi
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Permission Denied
```bash
# Fix file permissions
sudo chown -R www-data:www-data /var/www/gaming-perks-shop
sudo chmod 755 /var/www/gaming-perks-shop/sync-patch-notes.sh
```

#### 2. Game File Not Found
```bash
# Check if game file exists
ls -la "/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws"

# If path is different, update the script
sudo nano /var/www/gaming-perks-shop/sync-patch-notes.sh
```

#### 3. Sync Not Running
```bash
# Check cron service
sudo systemctl status cron

# Restart cron if needed
sudo systemctl restart cron

# Check cron job syntax
crontab -l
```

#### 4. Web App Not Seeing Updates
```bash
# Check Next.js API endpoint
curl http://localhost:3000/api/patch-notes

# Restart Next.js application
sudo systemctl restart your-nextjs-service
```

### Debug Mode

To run sync with verbose output:
```bash
# Edit the sync script to enable debug mode
sudo nano /var/www/gaming-perks-shop/sync-patch-notes.sh

# Add this near the top:
set -x  # Enable debug mode
```

## 🔄 Updates and Maintenance

### Updating the Sync Script

1. Upload new version of `sync-patch-notes.sh`
2. Copy to production location:
   ```bash
   sudo cp sync-patch-notes.sh /var/www/gaming-perks-shop/
   sudo chmod +x /var/www/gaming-perks-shop/sync-patch-notes.sh
   ```
3. Test the update:
   ```bash
   sync-patch-notes
   ```

### Log Rotation

Logs are automatically rotated weekly (keeping 4 weeks). To manually clean:
```bash
# Clean old logs
sudo logrotate /etc/logrotate.d/patch-sync
```

### Backup Management

Backups are automatically cleaned (keeping last 10). To manually manage:
```bash
# View backups
ls -la /var/www/gaming-perks-shop/patch-notes-backups/

# Clean old backups manually
find /var/www/gaming-perks-shop/patch-notes-backups/ -name "ctfpl.nws.*" -mtime +7 -delete
```

## 🎯 Performance Impact

The sync system is designed to have minimal impact on game performance:

- **File Access**: Only reads the file, never writes or locks it
- **Frequency**: Runs every 2 minutes, but exits immediately if no changes
- **Operation Time**: Typical sync takes < 100ms
- **Resource Usage**: Minimal CPU and memory footprint

## 🔐 Security Considerations

- Script runs with minimal required permissions
- Atomic file operations prevent corruption
- File locking prevents concurrent access
- Comprehensive error handling and logging
- No network access required

## 📞 Support

If you encounter issues:

1. Check the logs: `tail -f /var/www/gaming-perks-shop/logs/patch-sync.log`
2. Run manual sync: `sync-patch-notes`
3. Check health: Run the health check script above
4. Review this documentation
5. Contact support with log excerpts if needed

---

🎮 **Your patch notes will now automatically sync from the game server to your website!** 