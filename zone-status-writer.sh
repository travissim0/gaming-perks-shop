#!/bin/bash

# Zone Status Writer - Runs continuously and writes status to files
# This script runs as a daemon/cron job and updates zone status files
# The web application simply reads these files instead of executing commands

ZONES_DIR="/root/Infantry/Zones"
STATUS_DIR="/var/www/gaming-perks-shop/zone-status"
LOG_FILE="/root/Infantry/logs/zone-status-writer.log"

# Create directories
mkdir -p "$STATUS_DIR"
mkdir -p "/root/Infantry/logs"

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check if zone is running
is_zone_running() {
    local zone=$1
    if screen -list | grep -E "\.${zone}[[:space:]].*\(Detached\)" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Function to check if directory should be filtered out
is_filtered_directory() {
    local dir_name=$1
    case "$dir_name" in
        "BIN"|"Blobs"|"Global"|"assets"|"net8.0"|"TEST ZONES")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to write zone status to JSON file
write_zone_status() {
    local output_file="$STATUS_DIR/zones.json"
    local temp_file="$STATUS_DIR/zones.json.tmp"
    
    echo "{" > "$temp_file"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"," >> "$temp_file"
    echo "  \"zones\": {" >> "$temp_file"
    
    local first=true
    for dir in "$ZONES_DIR"/*; do
        if [ -d "$dir" ]; then
            zone_name=$(basename "$dir")
            
            # Skip filtered directories
            if is_filtered_directory "$zone_name"; then
                continue
            fi
            
            # Map to short name for consistency
            short_name=""
            case "$zone_name" in
                "CTF - Twin Peaks 2.0") short_name="ctf" ;;
                "CTF - Twin Peaks Classic") short_name="tp" ;;
                "League - USL Matches") short_name="usl" ;;
                "League - USL Secondary") short_name="usl2" ;;
                "Skirmish - Minimaps") short_name="skMini" ;;
                "Sports - GravBall") short_name="grav" ;;
                "Arcade - The Arena") short_name="arena" ;;
                "TEST ZONE - Molo") short_name="tzmolo" ;;
                "Bots - Zombie Zone") short_name="zz" ;;
                *) short_name=$(echo "$zone_name" | tr ' ' '_' | tr '[:upper:]' '[:lower:]') ;;
            esac
            
            if is_zone_running "$short_name"; then
                status="RUNNING"
            else
                status="STOPPED"
            fi
            
            if [ "$first" = true ]; then
                first=false
            else
                echo "," >> "$temp_file"
            fi
            
            echo "    \"$short_name\": {" >> "$temp_file"
            echo "      \"name\": \"$zone_name\"," >> "$temp_file"
            echo "      \"status\": \"$status\"," >> "$temp_file"
            echo "      \"last_checked\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"" >> "$temp_file"
            echo -n "    }" >> "$temp_file"
        fi
    done
    
    echo "" >> "$temp_file"
    echo "  }" >> "$temp_file"
    echo "}" >> "$temp_file"
    
    # Atomically replace the status file
    mv "$temp_file" "$output_file"
    
    # Set permissions so web server can read it
    chmod 644 "$output_file"
}

# Function to handle zone actions from command files
process_zone_commands() {
    local command_dir="$STATUS_DIR/commands"
    mkdir -p "$command_dir"
    
    # Process any pending command files
    for command_file in "$command_dir"/*.json; do
        if [ -f "$command_file" ]; then
            local command_id=$(basename "$command_file" .json)
            log_message "Processing command: $command_id"
            
            # Read the command
            local action=$(jq -r '.action' "$command_file" 2>/dev/null)
            local zone=$(jq -r '.zone' "$command_file" 2>/dev/null)
            local timestamp=$(jq -r '.timestamp' "$command_file" 2>/dev/null)
            
            if [ "$action" != "null" ] && [ "$zone" != "null" ]; then
                log_message "Executing: $action on zone $zone (requested at $timestamp)"
                
                local result_file="$STATUS_DIR/results/$command_id.json"
                mkdir -p "$STATUS_DIR/results"
                
                # Execute the command using the original zone-manager.sh logic
                case "$action" in
                    "start")
                        if execute_zone_action "$zone" "start"; then
                            echo "{\"success\": true, \"message\": \"Zone $zone started successfully\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        else
                            echo "{\"success\": false, \"error\": \"Failed to start zone $zone\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        fi
                        ;;
                    "stop")
                        if execute_zone_action "$zone" "stop"; then
                            echo "{\"success\": true, \"message\": \"Zone $zone stopped successfully\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        else
                            echo "{\"success\": false, \"error\": \"Failed to stop zone $zone\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        fi
                        ;;
                    "restart")
                        if execute_zone_action "$zone" "restart"; then
                            echo "{\"success\": true, \"message\": \"Zone $zone restarted successfully\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        else
                            echo "{\"success\": false, \"error\": \"Failed to restart zone $zone\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" > "$result_file"
                        fi
                        ;;
                esac
                
                chmod 644 "$result_file"
            fi
            
            # Remove the processed command file
            rm "$command_file"
        fi
    done
}

# Zone action execution functions (from original script)
get_zone_directory() {
    local zone=$1
    case "$zone" in
        "ctf") echo "$ZONES_DIR/CTF - Twin Peaks 2.0" ;;
        "tp") echo "$ZONES_DIR/CTF - Twin Peaks Classic" ;;
        "usl") echo "$ZONES_DIR/League - USL Matches" ;;
        "usl2") echo "$ZONES_DIR/League - USL Secondary" ;;
        "skMini") echo "$ZONES_DIR/Skirmish - Minimaps" ;;
        "grav") echo "$ZONES_DIR/Sports - GravBall" ;;
        "arena") echo "$ZONES_DIR/Arcade - The Arena" ;;
        "tzmolo") echo "$ZONES_DIR/TEST ZONE - Molo" ;;
        "zz") echo "$ZONES_DIR/Bots - Zombie Zone" ;;
        *) find "$ZONES_DIR" -type d -name "*$zone*" | head -1 ;;
    esac
}

execute_zone_action() {
    local zone=$1
    local action=$2
    local zone_dir=$(get_zone_directory "$zone")
    
    case "$action" in
        "start")
            if [ -z "$zone_dir" ] || [ ! -d "$zone_dir" ]; then
                log_message "ERROR: Zone directory not found for '$zone'"
                return 1
            fi
            
            if is_zone_running "$zone"; then
                log_message "WARNING: Zone '$zone' is already running"
                return 1
            fi
            
            log_message "Starting zone '$zone' in directory '$zone_dir'"
            cd "$zone_dir"
            screen -dmS "$zone" dotnet ZoneServer.dll
            sleep 3
            
            if is_zone_running "$zone"; then
                log_message "SUCCESS: Zone '$zone' started successfully"
                return 0
            else
                log_message "ERROR: Failed to start zone '$zone'"
                return 1
            fi
            ;;
            
        "stop")
            if ! is_zone_running "$zone"; then
                log_message "WARNING: Zone '$zone' is not running"
                return 1
            fi
            
            log_message "Stopping zone '$zone'"
            screen -S "$zone" -X quit
            sleep 2
            
            if ! is_zone_running "$zone"; then
                log_message "SUCCESS: Zone '$zone' stopped successfully"
                return 0
            else
                log_message "ERROR: Failed to stop zone '$zone'"
                return 1
            fi
            ;;
            
        "restart")
            if is_zone_running "$zone"; then
                execute_zone_action "$zone" "stop"
                sleep 2
            fi
            execute_zone_action "$zone" "start"
            ;;
    esac
}

# Main execution
case "${1:-daemon}" in
    "daemon")
        log_message "Starting zone status writer daemon"
        
        # Main loop - runs continuously
        while true; do
            write_zone_status
            process_zone_commands
            sleep 5  # Update every 5 seconds
        done
        ;;
        
    "once")
        log_message "Running zone status writer once"
        write_zone_status
        process_zone_commands
        ;;
        
    "setup")
        log_message "Setting up zone status writer"
        mkdir -p "$STATUS_DIR/commands"
        mkdir -p "$STATUS_DIR/results"
        chmod 755 "$STATUS_DIR"
        chmod 755 "$STATUS_DIR/commands"
        chmod 755 "$STATUS_DIR/results"
        echo "✅ Setup complete. Directories created with proper permissions."
        ;;
        
    *)
        echo "Usage: $0 [daemon|once|setup]"
        echo "  daemon: Run continuously (default)"
        echo "  once: Update status once and exit"
        echo "  setup: Create required directories"
        exit 1
        ;;
esac 