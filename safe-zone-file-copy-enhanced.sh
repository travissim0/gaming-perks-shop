#!/bin/bash

# Enhanced Safe Zone File Copy Script
# Optimized for large file transfers with robust error handling
# Usage: ./safe-zone-file-copy-enhanced.sh <filename> [zone_name]
# Example: ./safe-zone-file-copy-enhanced.sh mymap.lvl tzmolo

FILENAME="$1"
ZONE_NAME="${2:-tzmolo}"  # Default to tzmolo if not specified

# Configuration
SOURCE_DIR="/home/molo/upload"
LOG_FILE="/root/Infantry/logs/file-copy.log"

# Large file handling configuration
LARGE_FILE_THRESHOLD=104857600  # 100MB in bytes
CHUNK_SIZE=1048576             # 1MB chunks for very large files
MAX_COPY_TIME=3600             # Maximum copy time in seconds (1 hour)
MIN_FREE_SPACE_MB=1024         # Minimum free space required (1GB)

# Zone directory mappings
declare -A ZONE_DIRS
ZONE_DIRS["tzmolo"]="/root/Infantry/Zones/TEST ZONE - Molo/assets"
# Add more zones as needed:
# ZONE_DIRS["ctf"]="/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets"
# ZONE_DIRS["arena"]="/root/Infantry/Zones/Arcade - The Arena/assets"

# Create logs directory if it doesn't exist
mkdir -p "/root/Infantry/logs"

# Function to log messages with enhanced formatting
log_message() {
    local level="${2:-INFO}"
    local message="$(date '+%Y-%m-%d %H:%M:%S') [$level] - $1"
    echo "$message" | tee -a "$LOG_FILE"
}

# Function to check available disk space
check_disk_space() {
    local target_dir="$1"
    local required_space="$2"  # in bytes
    
    # Get available space in bytes
    local available_space=$(df -B1 "$target_dir" | awk 'NR==2 {print $4}')
    local available_mb=$((available_space / 1048576))
    local required_mb=$((required_space / 1048576))
    
    log_message "Available space: ${available_mb}MB, Required: ${required_mb}MB + ${MIN_FREE_SPACE_MB}MB buffer"
    
    if [ "$available_space" -lt $((required_space + MIN_FREE_SPACE_MB * 1048576)) ]; then
        log_message "ERROR: Insufficient disk space. Available: ${available_mb}MB, Need: $((required_mb + MIN_FREE_SPACE_MB))MB" "ERROR"
        return 1
    fi
    
    return 0
}

# Function to copy file with progress monitoring
copy_with_progress() {
    local source="$1"
    local dest="$2"
    local file_size="$3"
    
    log_message "Starting copy operation (${file_size} bytes)"
    
    # For very large files, use dd with progress monitoring
    if [ "$file_size" -gt "$LARGE_FILE_THRESHOLD" ]; then
        log_message "Large file detected, using optimized copy method"
        
        # Use dd with progress monitoring via pv if available, otherwise use rsync
        if command -v pv >/dev/null 2>&1; then
            log_message "Using pv for progress monitoring"
            timeout "$MAX_COPY_TIME" pv "$source" > "$dest"
            local exit_code=$?
        elif command -v rsync >/dev/null 2>&1; then
            log_message "Using rsync for reliable transfer"
            timeout "$MAX_COPY_TIME" rsync --progress --inplace "$source" "$dest"
            local exit_code=$?
        else
            log_message "Using dd with status monitoring"
            timeout "$MAX_COPY_TIME" dd if="$source" of="$dest" bs="$CHUNK_SIZE" status=progress 2>&1 | \
                while IFS= read -r line; do
                    if [[ "$line" =~ [0-9]+.*copied ]]; then
                        log_message "Progress: $line"
                    fi
                done
            local exit_code=${PIPESTATUS[0]}
        fi
    else
        # For smaller files, use standard cp with timeout
        log_message "Using standard copy method"
        timeout "$MAX_COPY_TIME" cp "$source" "$dest"
        local exit_code=$?
    fi
    
    # Check timeout
    if [ $exit_code -eq 124 ]; then
        log_message "ERROR: Copy operation timed out after ${MAX_COPY_TIME} seconds" "ERROR"
        return 124
    elif [ $exit_code -ne 0 ]; then
        log_message "ERROR: Copy operation failed with exit code $exit_code" "ERROR"
        return $exit_code
    fi
    
    log_message "Copy operation completed successfully"
    return 0
}

# Function to calculate hash with progress for large files
calculate_hash_with_progress() {
    local file="$1"
    local file_size="$2"
    
    if [ "$file_size" -gt "$LARGE_FILE_THRESHOLD" ]; then
        log_message "Calculating hash for large file (this may take a while)..."
        if command -v pv >/dev/null 2>&1; then
            pv "$file" | md5sum | cut -d' ' -f1
        else
            md5sum "$file" 2>/dev/null | cut -d' ' -f1
        fi
    else
        md5sum "$file" 2>/dev/null | cut -d' ' -f1
    fi
}

# Function to cleanup on exit
cleanup_on_exit() {
    local temp_file="$1"
    if [ -n "$temp_file" ] && [ -f "$temp_file" ]; then
        log_message "Cleaning up temporary file: $temp_file"
        rm -f "$temp_file"
    fi
}

# Set up trap for cleanup
trap 'cleanup_on_exit "$TEMP_FILE"' EXIT INT TERM

# Validate inputs
if [ -z "$FILENAME" ]; then
    log_message "ERROR: No filename provided" "ERROR"
    echo "Usage: $0 <filename> [zone_name]"
    echo "Available zones: ${!ZONE_DIRS[@]}"
    exit 1
fi

# Check if zone is supported
if [ -z "${ZONE_DIRS[$ZONE_NAME]}" ]; then
    log_message "ERROR: Unknown zone '$ZONE_NAME'" "ERROR"
    echo "Available zones: ${!ZONE_DIRS[@]}"
    exit 1
fi

SOURCE_FILE="$SOURCE_DIR/$FILENAME"
DEST_DIR="${ZONE_DIRS[$ZONE_NAME]}"
DEST_FILE="$DEST_DIR/$FILENAME"
BACKUP_FILE="$DEST_DIR/$FILENAME.backup.$(date +%s)"
TEMP_FILE="$DEST_DIR/$FILENAME.tmp.$(date +%s)"

log_message "=== Starting enhanced file copy operation ===" "INFO"
log_message "Zone: $ZONE_NAME"
log_message "Source: $SOURCE_FILE"
log_message "Destination: $DEST_FILE"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    log_message "ERROR: Source file does not exist: $SOURCE_FILE" "ERROR"
    echo "ERROR: File '$FILENAME' not found in $SOURCE_DIR"
    exit 1
fi

# Check if destination directory exists
if [ ! -d "$DEST_DIR" ]; then
    log_message "ERROR: Destination directory does not exist: $DEST_DIR" "ERROR"
    echo "ERROR: Zone assets directory not found: $DEST_DIR"
    exit 1
fi

# Check file permissions
if [ ! -r "$SOURCE_FILE" ]; then
    log_message "ERROR: Cannot read source file: $SOURCE_FILE" "ERROR"
    echo "ERROR: Permission denied reading source file"
    exit 1
fi

if [ ! -w "$DEST_DIR" ]; then
    log_message "ERROR: Cannot write to destination directory: $DEST_DIR" "ERROR"
    echo "ERROR: Permission denied writing to destination directory"
    exit 1
fi

# Get file info
SOURCE_SIZE=$(stat -f%z "$SOURCE_FILE" 2>/dev/null || stat -c%s "$SOURCE_FILE" 2>/dev/null || echo "0")
SOURCE_SIZE_MB=$((SOURCE_SIZE / 1048576))

log_message "Source file size: $SOURCE_SIZE bytes (${SOURCE_SIZE_MB}MB)"

# Check disk space before proceeding
if ! check_disk_space "$DEST_DIR" "$SOURCE_SIZE"; then
    echo "ERROR: Insufficient disk space for file copy"
    exit 1
fi

# Calculate source hash (simplified for reliability)
log_message "Calculating source file hash..."
SOURCE_HASH=$(timeout 30 md5sum "$SOURCE_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
if [ -z "$SOURCE_HASH" ] || [ "$SOURCE_HASH" = "unknown" ]; then
    log_message "WARNING: Could not calculate source file hash, skipping hash checks" "WARN"
    SOURCE_HASH="unknown"
else
    log_message "Source file hash: $SOURCE_HASH"
fi

# Check if destination file exists and get its info
if [ -f "$DEST_FILE" ]; then
    DEST_SIZE=$(stat -f%z "$DEST_FILE" 2>/dev/null || stat -c%s "$DEST_FILE" 2>/dev/null || echo "0")
    DEST_SIZE_MB=$((DEST_SIZE / 1048576))
    
    log_message "Existing file size: $DEST_SIZE bytes (${DEST_SIZE_MB}MB)"
    
    # Calculate existing file hash
    if [ "$SOURCE_HASH" != "unknown" ]; then
        log_message "Calculating existing file hash..."
        DEST_HASH=$(timeout 30 md5sum "$DEST_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        
        if [ -n "$DEST_HASH" ] && [ "$DEST_HASH" != "unknown" ]; then
            log_message "Existing file hash: $DEST_HASH"
            
            # Check if files are identical
            if [ "$SOURCE_HASH" = "$DEST_HASH" ]; then
                log_message "Files are identical, no copy needed"
                echo "SUCCESS: File is already up to date"
                exit 0
            fi
        fi
    fi
else
    log_message "Destination file does not exist, performing new file copy"
fi

# Step 1: Copy to temporary file with enhanced method
log_message "Copying to temporary file: $TEMP_FILE"
if ! copy_with_progress "$SOURCE_FILE" "$TEMP_FILE" "$SOURCE_SIZE"; then
    log_message "ERROR: Failed to copy to temporary file" "ERROR"
    echo "ERROR: Failed to copy file to temporary location"
    exit 1
fi

# Verify temporary file
TEMP_SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null || echo "0")
TEMP_SIZE_MB=$((TEMP_SIZE / 1048576))

log_message "Temporary file size: $TEMP_SIZE bytes (${TEMP_SIZE_MB}MB)"

# Size verification
if [ "$SOURCE_SIZE" != "$TEMP_SIZE" ]; then
    log_message "ERROR: File size mismatch. Source: $SOURCE_SIZE, Temp: $TEMP_SIZE" "ERROR"
    echo "ERROR: File size verification failed"
    exit 1
fi

# Hash verification (if source hash was available)
if [ "$SOURCE_HASH" != "unknown" ]; then
    log_message "Verifying temporary file integrity..."
    TEMP_HASH=$(timeout 30 md5sum "$TEMP_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
    
    if [ -n "$TEMP_HASH" ] && [ "$TEMP_HASH" != "unknown" ]; then
        log_message "Temporary file hash: $TEMP_HASH"
        
        if [ "$SOURCE_HASH" != "$TEMP_HASH" ]; then
            log_message "ERROR: File corruption detected during copy" "ERROR"
            echo "ERROR: File integrity check failed"
            exit 1
        fi
    else
        log_message "WARNING: Could not verify temporary file hash" "WARN"
    fi
fi

# Step 2: If destination file exists, create backup
if [ -f "$DEST_FILE" ]; then
    log_message "Creating backup of existing file: $BACKUP_FILE"
    if ! cp "$DEST_FILE" "$BACKUP_FILE"; then
        log_message "WARNING: Failed to create backup, continuing anyway" "WARN"
        echo "WARNING: Could not create backup of existing file"
    else
        log_message "Backup created successfully"
    fi
fi

# Step 3: Atomic move (this is usually faster and less likely to cause issues)
log_message "Performing atomic move to final destination"
if mv "$TEMP_FILE" "$DEST_FILE"; then
    # Verify final file
    FINAL_SIZE=$(stat -f%z "$DEST_FILE" 2>/dev/null || stat -c%s "$DEST_FILE" 2>/dev/null || echo "0")
    FINAL_SIZE_MB=$((FINAL_SIZE / 1048576))
    
    log_message "Final file size: $FINAL_SIZE bytes (${FINAL_SIZE_MB}MB)"
    
    # Final size check
    if [ "$SOURCE_SIZE" != "$FINAL_SIZE" ]; then
        log_message "ERROR: Final file size verification failed" "ERROR"
        echo "ERROR: File size mismatch in final file"
        
        # Restore backup if it exists
        if [ -f "$BACKUP_FILE" ]; then
            log_message "Restoring backup file"
            mv "$BACKUP_FILE" "$DEST_FILE"
        fi
        exit 1
    fi
    
    # Final hash check (if possible)
    if [ "$SOURCE_HASH" != "unknown" ]; then
        log_message "Performing final integrity check..."
        FINAL_HASH=$(timeout 30 md5sum "$DEST_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        
        if [ -n "$FINAL_HASH" ] && [ "$FINAL_HASH" != "unknown" ]; then
            log_message "Final file hash: $FINAL_HASH"
            
            if [ "$SOURCE_HASH" != "$FINAL_HASH" ]; then
                log_message "ERROR: Final file integrity check failed" "ERROR"
                echo "ERROR: File corruption detected in final file"
                
                # Restore backup if it exists
                if [ -f "$BACKUP_FILE" ]; then
                    log_message "Restoring backup file"
                    mv "$BACKUP_FILE" "$DEST_FILE"
                fi
                exit 1
            fi
        fi
    fi
    
    log_message "SUCCESS: File copied successfully to zone $ZONE_NAME" "SUCCESS"
    echo "SUCCESS: File '$FILENAME' (${SOURCE_SIZE_MB}MB) copied to $ZONE_NAME zone assets"
    
    # Clean up old backups (keep only last 5 per file)
    log_message "Cleaning up old backups"
    find "$DEST_DIR" -name "$FILENAME.backup.*" -type f | sort | head -n -5 | xargs -r rm
    
    # Set appropriate permissions
    chmod 644 "$DEST_FILE" 2>/dev/null || log_message "WARNING: Could not set file permissions" "WARN"
    
    # Sync filesystem to ensure data is written to disk
    sync
    
    log_message "=== Enhanced file copy operation completed successfully ===" "SUCCESS"
    exit 0
else
    log_message "ERROR: Failed to move temporary file to destination" "ERROR"
    echo "ERROR: Failed to finalize file copy"
    
    # Restore backup if it exists
    if [ -f "$BACKUP_FILE" ]; then
        log_message "Attempting to restore backup"
        echo "Attempting to restore original file..."
        if mv "$BACKUP_FILE" "$DEST_FILE"; then
            log_message "Backup restored successfully"
            echo "Original file restored"
        else
            log_message "ERROR: Failed to restore backup" "ERROR"
            echo "ERROR: Could not restore original file"
        fi
    fi
    
    log_message "=== Enhanced file copy operation failed ===" "ERROR"
    exit 1
fi
