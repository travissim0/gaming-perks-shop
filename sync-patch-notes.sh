#!/bin/bash

# Patch Notes Sync Script
# Syncs ctfpl.nws from game server to web application only when modified
# Designed to minimize performance impact on game server

# Configuration
GAME_NWS_FILE="/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws"
WEB_NWS_FILE="/var/www/gaming-perks-shop/public/ctfpl.nws"
BACKUP_DIR="/var/www/gaming-perks-shop/patch-notes-backups"
LOG_FILE="/var/www/gaming-perks-shop/logs/patch-sync.log"
LOCK_FILE="/tmp/patch-sync.lock"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    rm -f "$LOCK_FILE"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Check if script is already running
if [ -f "$LOCK_FILE" ]; then
    if ps -p $(cat "$LOCK_FILE") > /dev/null 2>&1; then
        log "Sync already running (PID: $(cat $LOCK_FILE)). Exiting."
        exit 0
    else
        log "Removing stale lock file"
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

# Create necessary directories
mkdir -p "$(dirname "$LOG_FILE")" || error_exit "Cannot create log directory"
mkdir -p "$BACKUP_DIR" || error_exit "Cannot create backup directory"
mkdir -p "$(dirname "$WEB_NWS_FILE")" || error_exit "Cannot create web directory"

# Check if game file exists
if [ ! -f "$GAME_NWS_FILE" ]; then
    error_exit "Game NWS file not found: $GAME_NWS_FILE"
fi

# Check if game file is readable
if [ ! -r "$GAME_NWS_FILE" ]; then
    error_exit "Game NWS file not readable: $GAME_NWS_FILE"
fi

# Get file modification times
GAME_MTIME=$(stat -c %Y "$GAME_NWS_FILE" 2>/dev/null)
if [ $? -ne 0 ]; then
    error_exit "Cannot get modification time of game file"
fi

WEB_MTIME=0
if [ -f "$WEB_NWS_FILE" ]; then
    WEB_MTIME=$(stat -c %Y "$WEB_NWS_FILE" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log "Warning: Cannot get modification time of web file, forcing sync"
        WEB_MTIME=0
    fi
fi

# Check if sync is needed
if [ "$GAME_MTIME" -le "$WEB_MTIME" ]; then
    log "No sync needed - web file is up to date"
    exit 0
fi

log "Game file is newer ($(date -d @$GAME_MTIME)) than web file ($(date -d @$WEB_MTIME))"
log "Starting sync process..."

# Create backup of existing web file if it exists
if [ -f "$WEB_NWS_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/ctfpl.nws.$(date +%Y%m%d_%H%M%S)"
    if cp "$WEB_NWS_FILE" "$BACKUP_FILE"; then
        log "Created backup: $BACKUP_FILE"
        
        # Keep only last 10 backups
        find "$BACKUP_DIR" -name "ctfpl.nws.*" -type f | sort | head -n -10 | xargs -r rm
        log "Cleaned old backups (keeping last 10)"
    else
        log "Warning: Failed to create backup"
    fi
fi

# Perform the sync with atomic operation
TEMP_FILE=$(mktemp)
if [ $? -ne 0 ]; then
    error_exit "Cannot create temporary file"
fi

# Copy with error checking
if cp "$GAME_NWS_FILE" "$TEMP_FILE"; then
    # Verify the copy
    if [ -s "$TEMP_FILE" ]; then
        # Atomic move to final location
        if mv "$TEMP_FILE" "$WEB_NWS_FILE"; then
            # Set appropriate permissions
            chmod 644 "$WEB_NWS_FILE"
            chown www-data:www-data "$WEB_NWS_FILE" 2>/dev/null || true
            
            # Preserve modification time for future comparisons
            touch -r "$GAME_NWS_FILE" "$WEB_NWS_FILE"
            
            log "Successfully synced patch notes"
            echo -e "${GREEN}✓ Patch notes synced successfully${NC}"
            
            # Optional: Trigger Next.js to rebuild if using ISR
            # You can add a webhook call here if needed
            
        else
            error_exit "Failed to move temporary file to final location"
        fi
    else
        error_exit "Copied file is empty or invalid"
    fi
else
    error_exit "Failed to copy game file to temporary location"
fi

# Cleanup temporary file if it still exists
rm -f "$TEMP_FILE"

# Log file sizes for verification
GAME_SIZE=$(stat -c %s "$GAME_NWS_FILE" 2>/dev/null || echo "unknown")
WEB_SIZE=$(stat -c %s "$WEB_NWS_FILE" 2>/dev/null || echo "unknown")

log "Sync completed - Game file: ${GAME_SIZE} bytes, Web file: ${WEB_SIZE} bytes"

# Success
exit 0 