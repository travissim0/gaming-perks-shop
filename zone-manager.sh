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
        "grav"|"gb")
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
                "Sports - GravBall") short_name="gb" ;;
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

# Function to execute scheduled operations from database
execute_scheduled_operations() {
    # Check if we have database connection variables
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        log_message "ERROR: Missing database configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
        return 1
    fi
    
    # Get current timestamp in ISO format
    local current_time=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    
    # Query for scheduled operations that are due
    local query_url="${SUPABASE_URL}/rest/v1/scheduled_zone_management?status=eq.scheduled&scheduled_datetime=lte.${current_time}&order=scheduled_datetime.asc"
    
    local operations=$(curl -s \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        "$query_url")
    
    if [ $? -ne 0 ]; then
        log_message "ERROR: Failed to query scheduled operations"
        return 1
    fi
    
    # Count operations found
    local operation_count=$(echo "$operations" | jq '. | length' 2>/dev/null || echo "0")
    
    # Only log if there are operations to execute
    if [ "$operation_count" -gt 0 ]; then
        log_message "Found $operation_count scheduled operations to execute"
    fi
    
    # Parse and execute each operation
    echo "$operations" | jq -c '.[]' 2>/dev/null | while read -r operation; do
        local op_id=$(echo "$operation" | jq -r '.id')
        local zone_key=$(echo "$operation" | jq -r '.zone_key')
        local action=$(echo "$operation" | jq -r '.action')
        local zone_name=$(echo "$operation" | jq -r '.zone_name')
        
        if [ "$op_id" = "null" ] || [ "$zone_key" = "null" ] || [ "$action" = "null" ]; then
            continue
        fi
        
        log_message "Executing scheduled operation $op_id: $action on zone '$zone_key'"
        
        # Mark operation as being executed
        local executed_at=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
        curl -s -X PATCH \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"executed_at\": \"$executed_at\"}" \
            "${SUPABASE_URL}/rest/v1/scheduled_zone_management?id=eq.$op_id" > /dev/null
        
        # Execute the operation
        local result=""
        local status="executed"
        local error_message=""
        local exit_code=0
        
        case "$action" in
            "start")
                result=$(start_zone "$zone_key" 2>&1)
                exit_code=$?
                ;;
            "stop")
                result=$(stop_zone "$zone_key" 2>&1)
                exit_code=$?
                ;;
            "restart")
                result=$(restart_zone "$zone_key" 2>&1)
                exit_code=$?
                ;;
            *)
                result="Invalid action: $action"
                status="failed"
                error_message="Invalid action specified"
                exit_code=1
                ;;
        esac
        
        # Check if operation was successful
        if [ $exit_code -ne 0 ]; then
            status="failed"
            error_message="Operation failed: $result"
            log_message "ERROR: Scheduled operation $op_id failed with exit code $exit_code: $result"
        else
            log_message "SUCCESS: Scheduled operation $op_id completed successfully"
        fi
        
        # Update operation status in database
        local update_data="{\"status\": \"$status\""
        if [ -n "$result" ]; then
            update_data="$update_data, \"execution_result\": \"$(echo "$result" | sed 's/"/\\"/g')\""
        fi
        if [ -n "$error_message" ]; then
            update_data="$update_data, \"error_message\": \"$(echo "$error_message" | sed 's/"/\\"/g')\""
        fi
        update_data="$update_data}"
        
        curl -s -X PATCH \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d "$update_data" \
            "${SUPABASE_URL}/rest/v1/scheduled_zone_management?id=eq.$op_id" > /dev/null
    done
    
    # Only log completion if there were operations to execute
    if [ "$operation_count" -gt 0 ]; then
        log_message "Scheduled operations check completed"
    fi
}

# Function to add a scheduled operation (called by web interface)
schedule_operation() {
    local action=$1
    local zone=$2
    local scheduled_time=$3
    local admin_alias=$4
    
    if [ -z "$action" ] || [ -z "$zone" ] || [ -z "$scheduled_time" ]; then
        echo "ERROR: Missing required parameters for scheduling"
        exit 1
    fi
    
    log_message "Scheduling $action for zone '$zone' at $scheduled_time by $admin_alias"
    
    # Validate the zone exists
    local zone_dir=$(get_zone_directory "$zone")
    if [ -z "$zone_dir" ] || [ ! -d "$zone_dir" ]; then
        echo "ERROR: Zone directory not found for '$zone'"
        exit 1
    fi
    
    # Validate the action
    case "$action" in
        "start"|"stop"|"restart")
            echo "SUCCESS: Scheduled $action for zone $zone at $scheduled_time"
            ;;
        *)
            echo "ERROR: Invalid action '$action'. Must be start, stop, or restart"
            exit 1
            ;;
    esac
}

# Function to execute a scheduled operation by ID
execute_scheduled_operation() {
    local operation_id=$1
    local action=$2
    local zone=$3
    
    if [ -z "$operation_id" ] || [ -z "$action" ] || [ -z "$zone" ]; then
        echo "ERROR: Missing required parameters for execution"
        exit 1
    fi
    
    log_message "Executing scheduled operation $operation_id: $action on zone '$zone'"
    
    case "$action" in
        "start")
            start_zone "$zone"
            ;;
        "stop")
            stop_zone "$zone"
            ;;
        "restart")
            restart_zone "$zone"
            ;;
        *)
            log_message "ERROR: Invalid scheduled action '$action'"
            echo "ERROR: Invalid action"
            exit 1
            ;;
    esac
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
    "schedule")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Usage: $0 schedule <action> <zone_name> <scheduled_time> [admin_alias]"
            exit 1
        fi
        SCHEDULED_ACTION=$2
        SCHEDULED_TIME=$3
        ADMIN_ALIAS=${4:-"system"}
        schedule_operation "$SCHEDULED_ACTION" "$ZONE_NAME" "$SCHEDULED_TIME" "$ADMIN_ALIAS"
        ;;
    "execute-scheduled")
        if [ -z "$ZONE_NAME" ]; then
            echo "ERROR: Usage: $0 execute-scheduled <operation_id> <action> <zone_name>"
            exit 1
        fi
        OPERATION_ID=$ZONE_NAME
        SCHEDULED_ACTION=$2
        ZONE_NAME=$3
        execute_scheduled_operation "$OPERATION_ID" "$SCHEDULED_ACTION" "$ZONE_NAME"
        ;;
    "check-scheduled")
        execute_scheduled_operations
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
        echo "Scheduled Actions: schedule, execute-scheduled, check-scheduled"
        echo ""
        echo "Examples:"
        echo "  $0 start ctf"
        echo "  $0 schedule restart ctf \"2024-01-15 14:00:00\" admin_alias"
        echo "  $0 execute-scheduled 123 restart ctf"
        echo "  $0 check-scheduled"
        exit 1
        ;;
esac 