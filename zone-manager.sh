#!/bin/bash

# Zone Management Script
# Usage: ./zone-manager.sh <action> <zone_name>
# Actions: start, stop, restart, status, list

ACTION=$1
ZONE_NAME=$2
ZONES_DIR="/root/Infantry/Zones"
LOG_FILE="/root/Infantry/logs/zone-manager.log"

# Create logs directory if it doesn't exist
mkdir -p "/root/Infantry/logs"

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to get zone directory mapping
get_zone_directory() {
    local zone=$1
    case "$zone" in
        "ctf")
            echo "$ZONES_DIR/CTF - Twin Peaks 2.0"
            ;;
        "tp")
            echo "$ZONES_DIR/CTF - Twin Peaks Classic"
            ;;
        "usl")
            echo "$ZONES_DIR/League - USL Matches"
            ;;
        "usl2")
            echo "$ZONES_DIR/League - USL Secondary"
            ;;
        "skMini")
            echo "$ZONES_DIR/Skirmish - Minimaps"
            ;;
        "grav")
            echo "$ZONES_DIR/Sports - GravBall"
            ;;
        "arena")
            echo "$ZONES_DIR/Arcade - The Arena"
            ;;
        *)
            # Try to find directory by name
            find "$ZONES_DIR" -type d -name "*$zone*" | head -1
            ;;
    esac
}

# Function to check if zone is running
is_zone_running() {
    local zone=$1
    
    # Only check for screen sessions that are Detached (not Dead)
    # Look for pattern: "PID.zonename" followed by "(Detached)"
    if screen -list | grep -E "\.${zone}[[:space:]].*\(Detached\)" >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

# Function to start a zone
start_zone() {
    local zone=$1
    local zone_dir=$(get_zone_directory "$zone")
    
    if [ -z "$zone_dir" ] || [ ! -d "$zone_dir" ]; then
        log_message "ERROR: Zone directory not found for '$zone'"
        echo "ERROR: Zone directory not found"
        exit 1
    fi
    
    if is_zone_running "$zone"; then
        log_message "WARNING: Zone '$zone' is already running"
        echo "WARNING: Zone is already running"
        exit 1
    fi
    
    log_message "Starting zone '$zone' in directory '$zone_dir'"
    cd "$zone_dir"
    screen -dmS "$zone" dotnet ZoneServer.dll
    
    # Wait and verify
    sleep 3
    if is_zone_running "$zone"; then
        log_message "SUCCESS: Zone '$zone' started successfully"
        echo "SUCCESS: Zone started"
    else
        log_message "ERROR: Failed to start zone '$zone'"
        echo "ERROR: Failed to start zone"
        exit 1
    fi
}

# Function to stop a zone
stop_zone() {
    local zone=$1
    
    if ! is_zone_running "$zone"; then
        log_message "WARNING: Zone '$zone' is not running"
        echo "WARNING: Zone is not running"
        exit 1
    fi
    
    log_message "Stopping zone '$zone'"
    screen -S "$zone" -X quit
    
    # Wait and verify
    sleep 2
    if ! is_zone_running "$zone"; then
        log_message "SUCCESS: Zone '$zone' stopped successfully"
        echo "SUCCESS: Zone stopped"
    else
        log_message "ERROR: Failed to stop zone '$zone'"
        echo "ERROR: Failed to stop zone"
        exit 1
    fi
}

# Function to restart a zone
restart_zone() {
    local zone=$1
    
    if is_zone_running "$zone"; then
        log_message "Restarting zone '$zone' (stopping first)"
        stop_zone "$zone"
        sleep 2
    else
        log_message "Zone '$zone' not running, starting fresh"
    fi
    
    start_zone "$zone"
}

# Function to get zone status
get_zone_status() {
    local zone=$1
    
    if is_zone_running "$zone"; then
        echo "RUNNING"
    else
        echo "STOPPED"
    fi
}

# Function to check if directory should be filtered out
is_filtered_directory() {
    local dir_name=$1
    case "$dir_name" in
        "BIN"|"Blobs"|"Global"|"assets"|"net8.0"|"TEST ZONES")
            return 0  # Should be filtered (excluded)
            ;;
        *)
            return 1  # Should not be filtered (included)
            ;;
    esac
}

# Function to list all available zones
list_zones() {
    echo "Available zones:"
    for dir in "$ZONES_DIR"/*; do
        if [ -d "$dir" ]; then
            zone_name=$(basename "$dir")
            if ! is_filtered_directory "$zone_name"; then
                echo "$zone_name"
            fi
        fi
    done
}

# Function to get all zones with status
get_all_zones_status() {
    echo "{"
    first=true
    for dir in "$ZONES_DIR"/*; do
        if [ -d "$dir" ]; then
            zone_name=$(basename "$dir")
            
            # Skip filtered directories
            if is_filtered_directory "$zone_name"; then
                continue
            fi
            
            # Try to map to short name
            short_name=""
            case "$zone_name" in
                "CTF - Twin Peaks 2.0") short_name="ctf" ;;
                "CTF - Twin Peaks Classic") short_name="tp" ;;
                "League - USL Matches") short_name="usl" ;;
                "League - USL Secondary") short_name="usl2" ;;
                "Skirmish - Minimaps") short_name="skMini" ;;
                "Sports - GravBall") short_name="grav" ;;
                "Arcade - The Arena") short_name="arena" ;;
                *) short_name=$(echo "$zone_name" | tr ' ' '_' | tr '[:upper:]' '[:lower:]') ;;
            esac
            
            status=$(get_zone_status "$short_name")
            
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            echo "  \"$short_name\": {\"name\": \"$zone_name\", \"status\": \"$status\"}"
        fi
    done
    echo "}"
}

# Main script logic
case "$ACTION" in
    "start")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Zone name required"
            exit 1
        fi
        start_zone "$ZONE_NAME"
        ;;
    "stop")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Zone name required"
            exit 1
        fi
        stop_zone "$ZONE_NAME"
        ;;
    "restart")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Zone name required"
            exit 1
        fi
        restart_zone "$ZONE_NAME"
        ;;
    "status")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Zone name required"
            exit 1
        fi
        get_zone_status "$ZONE_NAME"
        ;;
    "list")
        list_zones
        ;;
    "status-all")
        get_all_zones_status
        ;;
    "debug")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Zone name required for debug"
            exit 1
        fi
        echo "Debug info for zone: $ZONE_NAME"
        echo "Zone directory: $(get_zone_directory "$ZONE_NAME")"
        echo "Screen sessions:"
        screen -list | grep "$ZONE_NAME" || echo "No screen sessions found for $ZONE_NAME"
        echo "All screen sessions:"
        screen -list
        echo "ZoneServer processes:"
        pgrep -f "ZoneServer" | xargs ps -p {} -o pid,cmd --no-headers 2>/dev/null || echo "No ZoneServer processes found"
        echo "Dotnet processes:"
        pgrep -f "dotnet.*ZoneServer" | xargs ps -p {} -o pid,cmd --no-headers 2>/dev/null || echo "No dotnet ZoneServer processes found"
        ;;
    *)
        echo "Usage: $0 <action> [zone_name]"
        echo "Actions: start, stop, restart, status, list, status-all, debug"
        exit 1
        ;;
esac 