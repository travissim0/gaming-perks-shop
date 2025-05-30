#!/bin/bash

# Setup script for patch notes sync system
# Run this on your Linux server to configure automatic patch notes syncing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Patch Notes Sync Setup ===${NC}"
echo "This script will set up automatic syncing of patch notes from your game server to the web application."
echo

# Configuration
GAME_NWS_FILE="/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws"
WEB_NWS_FILE="/var/www/gaming-perks-shop/public/ctfpl.nws"
SYNC_SCRIPT="/var/www/gaming-perks-shop/sync-patch-notes.sh"
LOG_DIR="/var/www/gaming-perks-shop/logs"
BACKUP_DIR="/var/www/gaming-perks-shop/patch-notes-backups"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run this script as root (use sudo)${NC}"
    exit 1
fi

echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if game file exists
if [ ! -f "$GAME_NWS_FILE" ]; then
    echo -e "${RED}Game NWS file not found: $GAME_NWS_FILE${NC}"
    echo "Please ensure your Infantry server is set up correctly."
    exit 1
fi

# Check if web directory exists
if [ ! -d "/var/www/gaming-perks-shop" ]; then
    echo -e "${RED}Web application directory not found: /var/www/gaming-perks-shop${NC}"
    echo "Please ensure your web application is deployed correctly."
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"

# Create necessary directories
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$WEB_NWS_FILE")"

# Set proper ownership
chown -R www-data:www-data "/var/www/gaming-perks-shop" || true

echo -e "${GREEN}✓ Directories created${NC}"

# Copy sync script to web directory
echo -e "${YELLOW}Installing sync script...${NC}"
if [ -f "sync-patch-notes.sh" ]; then
    cp "sync-patch-notes.sh" "$SYNC_SCRIPT"
    chmod +x "$SYNC_SCRIPT"
    echo -e "${GREEN}✓ Sync script installed${NC}"
else
    echo -e "${RED}sync-patch-notes.sh not found in current directory${NC}"
    echo "Please ensure you're running this from the correct directory."
    exit 1
fi

# Test the sync script
echo -e "${YELLOW}Testing sync script...${NC}"
if "$SYNC_SCRIPT"; then
    echo -e "${GREEN}✓ Initial sync completed successfully${NC}"
else
    echo -e "${RED}Sync script test failed${NC}"
    echo "Please check the error messages above."
    exit 1
fi

# Set up cron job
echo -e "${YELLOW}Setting up cron job...${NC}"

# Create cron job that runs every 2 minutes
CRON_JOB="*/2 * * * * $SYNC_SCRIPT >/dev/null 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$SYNC_SCRIPT"; then
    echo -e "${YELLOW}Cron job already exists, updating...${NC}"
    # Remove existing cron job
    crontab -l 2>/dev/null | grep -v "$SYNC_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Cron job installed (runs every 2 minutes)${NC}"

# Create a manual sync command
echo -e "${YELLOW}Creating manual sync command...${NC}"
cat > /usr/local/bin/sync-patch-notes << 'EOF'
#!/bin/bash
/var/www/gaming-perks-shop/sync-patch-notes.sh "$@"
EOF

chmod +x /usr/local/bin/sync-patch-notes
echo -e "${GREEN}✓ Manual sync command created: sync-patch-notes${NC}"

# Create log rotation
echo -e "${YELLOW}Setting up log rotation...${NC}"
cat > /etc/logrotate.d/patch-sync << EOF
/var/www/gaming-perks-shop/logs/patch-sync.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 www-data www-data
}
EOF

echo -e "${GREEN}✓ Log rotation configured${NC}"

# Show current status
echo
echo -e "${BLUE}=== Installation Complete ===${NC}"
echo
echo "📁 Game file: $GAME_NWS_FILE"
echo "📁 Web file: $WEB_NWS_FILE"
echo "📁 Logs: $LOG_DIR/patch-sync.log"
echo "📁 Backups: $BACKUP_DIR"
echo
echo -e "${GREEN}✓ Automatic sync runs every 2 minutes${NC}"
echo -e "${GREEN}✓ Manual sync available: ${YELLOW}sync-patch-notes${NC}"
echo -e "${GREEN}✓ Logs are rotated weekly${NC}"
echo

# Show recent log entries
if [ -f "$LOG_DIR/patch-sync.log" ]; then
    echo -e "${BLUE}Recent log entries:${NC}"
    tail -n 5 "$LOG_DIR/patch-sync.log"
    echo
fi

echo -e "${YELLOW}Commands you can use:${NC}"
echo "• View logs: tail -f $LOG_DIR/patch-sync.log"
echo "• Manual sync: sync-patch-notes"
echo "• Check cron: crontab -l"
echo "• Test sync: $SYNC_SCRIPT"
echo

echo -e "${GREEN}🎮 Your patch notes will now automatically sync from the game server!${NC}" 