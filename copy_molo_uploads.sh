#!/bin/bash

SOURCE_DIR="/home/molo/upload"
COPY_SCRIPT="/root/Infantry/scripts/safe-zone-file-copy-enhanced.sh"
LOG_FILE="/root/Infantry/logs/daemon.log"

log_daemon() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_daemon "Starting Molo upload daemon..."
log_daemon "Monitoring: $SOURCE_DIR"
log_daemon "Using copy script: $COPY_SCRIPT"

# Use inotify to watch for new files
inotifywait -m -e close_write "$SOURCE_DIR" --format '%f' 2>/dev/null |
while read filename; do
    if [ -f "$SOURCE_DIR/$filename" ]; then
        log_daemon "New file detected: $filename"
        
        # Call your enhanced copy script
        if "$COPY_SCRIPT" "$filename" tzmolo; then
            log_daemon "Successfully copied $filename, removing from upload"
            rm -f "$SOURCE_DIR/$filename"
            log_daemon "Removed $filename from upload directory"
        else
            log_daemon "Failed to copy $filename, leaving in upload directory"
        fi
    fi
done