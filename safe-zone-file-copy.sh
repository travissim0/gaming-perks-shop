#!/bin/bash

# Safe Zone File Copy Script
# Copies files from user upload directories to zone asset directories
# Usage: ./safe-zone-file-copy.sh <filename> [zone_name]
# Example: ./safe-zone-file-copy.sh mymap.lvl tzmolo

FILENAME="$1"
ZONE_NAME="${2:-tzmolo}"  # Default to tzmolo if not specified

# Configuration
SOURCE_DIR="/home/molo/upload"
LOG_FILE="/root/Infantry/logs/file-copy.log"

# Zone directory mappings
declare -A ZONE_DIRS
ZONE_DIRS["tzmolo"]="/root/Infantry/Zones/TEST ZONE - Molo/assets"
# Add more zones as needed:
# ZONE_DIRS["ctf"]="/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets"
# ZONE_DIRS["arena"]="/root/Infantry/Zones/Arcade - The Arena/assets"

# Create logs directory if it doesn't exist
mkdir -p "/root/Infantry/logs"

# Function to log messages
log_message() {
    local message="$(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo "$message" | tee -a "$LOG_FILE"
}

# Validate inputs
if [ -z "$FILENAME" ]; then
    log_message "ERROR: No filename provided"
    echo "Usage: $0 <filename> [zone_name]"
    echo "Available zones: ${!ZONE_DIRS[@]}"
    exit 1
fi

# Check if zone is supported
if [ -z "${ZONE_DIRS[$ZONE_NAME]}" ]; then
    log_message "ERROR: Unknown zone '$ZONE_NAME'"
    echo "Available zones: ${!ZONE_DIRS[@]}"
    exit 1
fi

SOURCE_FILE="$SOURCE_DIR/$FILENAME"
DEST_DIR="${ZONE_DIRS[$ZONE_NAME]}"
DEST_FILE="$DEST_DIR/$FILENAME"
BACKUP_FILE="$DEST_DIR/$FILENAME.backup.$(date +%s)"
TEMP_FILE="$DEST_DIR/$FILENAME.tmp.$(date +%s)"

log_message "=== Starting file copy operation ==="
log_message "Zone: $ZONE_NAME"
log_message "Source: $SOURCE_FILE"
log_message "Destination: $DEST_FILE"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    log_message "ERROR: Source file does not exist: $SOURCE_FILE"
    echo "ERROR: File '$FILENAME' not found in $SOURCE_DIR"
    exit 1
fi

# Check if destination directory exists
if [ ! -d "$DEST_DIR" ]; then
    log_message "ERROR: Destination directory does not exist: $DEST_DIR"
    echo "ERROR: Zone assets directory not found: $DEST_DIR"
    exit 1
fi

# Check file permissions
if [ ! -r "$SOURCE_FILE" ]; then
    log_message "ERROR: Cannot read source file: $SOURCE_FILE"
    echo "ERROR: Permission denied reading source file"
    exit 1
fi

if [ ! -w "$DEST_DIR" ]; then
    log_message "ERROR: Cannot write to destination directory: $DEST_DIR"
    echo "ERROR: Permission denied writing to destination directory"
    exit 1
fi

# Get file info
SOURCE_SIZE=$(stat -f%z "$SOURCE_FILE" 2>/dev/null || stat -c%s "$SOURCE_FILE" 2>/dev/null || echo "unknown")
SOURCE_HASH=$(md5sum "$SOURCE_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

log_message "Source file size: $SOURCE_SIZE bytes"
log_message "Source file hash: $SOURCE_HASH"

# Check if destination file exists and get its info
if [ -f "$DEST_FILE" ]; then
    DEST_SIZE=$(stat -f%z "$DEST_FILE" 2>/dev/null || stat -c%s "$DEST_FILE" 2>/dev/null || echo "unknown")
    DEST_HASH=$(md5sum "$DEST_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
    
    log_message "Existing file size: $DEST_SIZE bytes"
    log_message "Existing file hash: $DEST_HASH"
    
    # Check if files are identical
    if [ "$SOURCE_HASH" = "$DEST_HASH" ] && [ "$SOURCE_HASH" != "unknown" ]; then
        log_message "Files are identical, no copy needed"
        echo "SUCCESS: File is already up to date"
        exit 0
    fi
else
    log_message "Destination file does not exist, performing new file copy"
fi

# Step 1: Copy to temporary file first
log_message "Copying to temporary file: $TEMP_FILE"
if ! cp "$SOURCE_FILE" "$TEMP_FILE"; then
    log_message "ERROR: Failed to copy to temporary file"
    echo "ERROR: Failed to copy file to temporary location"
    exit 1
fi

# Verify temporary file
TEMP_SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null || echo "unknown")
TEMP_HASH=$(md5sum "$TEMP_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

log_message "Temporary file size: $TEMP_SIZE bytes"
log_message "Temporary file hash: $TEMP_HASH"

# Verify integrity
if [ "$SOURCE_HASH" != "$TEMP_HASH" ] && [ "$SOURCE_HASH" != "unknown" ] && [ "$TEMP_HASH" != "unknown" ]; then
    log_message "ERROR: File corruption detected during copy"
    echo "ERROR: File integrity check failed"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Step 2: If destination file exists, create backup
if [ -f "$DEST_FILE" ]; then
    log_message "Creating backup of existing file: $BACKUP_FILE"
    if ! cp "$DEST_FILE" "$BACKUP_FILE"; then
        log_message "WARNING: Failed to create backup, continuing anyway"
        echo "WARNING: Could not create backup of existing file"
    else
        log_message "Backup created successfully"
    fi
fi

# Step 3: Atomic move (this is usually faster and less likely to cause issues)
log_message "Performing atomic move to final destination"
if mv "$TEMP_FILE" "$DEST_FILE"; then
    # Verify final file
    FINAL_SIZE=$(stat -f%z "$DEST_FILE" 2>/dev/null || stat -c%s "$DEST_FILE" 2>/dev/null || echo "unknown")
    FINAL_HASH=$(md5sum "$DEST_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
    
    log_message "Final file size: $FINAL_SIZE bytes"
    log_message "Final file hash: $FINAL_HASH"
    
    # Final integrity check
    if [ "$SOURCE_HASH" != "$FINAL_HASH" ] && [ "$SOURCE_HASH" != "unknown" ] && [ "$FINAL_HASH" != "unknown" ]; then
        log_message "ERROR: Final file integrity check failed"
        echo "ERROR: File corruption detected in final file"
        
        # Restore backup if it exists
        if [ -f "$BACKUP_FILE" ]; then
            log_message "Restoring backup file"
            mv "$BACKUP_FILE" "$DEST_FILE"
        fi
        exit 1
    fi
    
    log_message "SUCCESS: File copied successfully to zone $ZONE_NAME"
    echo "SUCCESS: File '$FILENAME' copied to $ZONE_NAME zone assets"
    
    # Clean up old backups (keep only last 5 per file)
    log_message "Cleaning up old backups"
    find "$DEST_DIR" -name "$FILENAME.backup.*" -type f | sort | head -n -5 | xargs -r rm
    
    # Set appropriate permissions
    chmod 644 "$DEST_FILE" 2>/dev/null || log_message "WARNING: Could not set file permissions"
    
    log_message "=== File copy operation completed successfully ==="
    exit 0
else
    log_message "ERROR: Failed to move temporary file to destination"
    echo "ERROR: Failed to finalize file copy"
    
    # Clean up temp file
    rm -f "$TEMP_FILE"
    
    # Restore backup if it exists
    if [ -f "$BACKUP_FILE" ]; then
        log_message "Attempting to restore backup"
        echo "Attempting to restore original file..."
        if mv "$BACKUP_FILE" "$DEST_FILE"; then
            log_message "Backup restored successfully"
            echo "Original file restored"
        else
            log_message "ERROR: Failed to restore backup"
            echo "ERROR: Could not restore original file"
        fi
    fi
    
    log_message "=== File copy operation failed ==="
    exit 1
fi







