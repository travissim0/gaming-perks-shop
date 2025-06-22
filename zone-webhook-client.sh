#!/bin/bash

# Zone Webhook Client - Sends zone status to website via HTTP
# This script runs continuously and POSTs zone data to your website
# The web application receives webhook data instead of executing commands

ZONES_DIR="/root/Infantry/Zones"
WEBHOOK_URL="${ZONE_WEBHOOK_URL:-http://localhost:3000/api/webhooks/zone-status}"
WEBHOOK_SECRET="${ZONE_WEBHOOK_SECRET:-your-secret-key-here}"
LOG_FILE="/root/Infantry/logs/zone-webhook-client.log"

# Create logs directory
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

# Function to generate zone status JSON
generate_zone_status() {
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\","
    echo "  \"hostname\": \"$(hostname)\","
    echo "  \"source\": \"zone-webhook-client\","
    echo "  \"zones\": {"
    
    local first=true
    for dir in "$ZONES_DIR"/*; do
        if [ -d "$dir" ]; then
            zone_name=$(basename "$dir")
            
            # Skip filtered directories
            if is_filtered_directory "$zone_name"; then
                continue
            fi
            
            # Map to short name
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
            
            if is_zone_running "$short_name"; then
                status="RUNNING"
            else
                status="STOPPED"
            fi
            
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            
            echo "    \"$short_name\": {"
            echo "      \"name\": \"$zone_name\","
            echo "      \"status\": \"$status\","
            echo "      \"last_checked\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\""
            echo -n "    }"
        fi
    done
    
    echo ""
    echo "  }"
    echo "}"
}

# Function to send webhook
send_webhook() {
    local payload="$1"
    local signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)
    
    local response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Zone-Signature: sha256=$signature" \
        -H "X-Zone-Source: zone-webhook-client" \
        --data-raw "$payload" \
        --connect-timeout 10 \
        --max-time 30 \
        "$WEBHOOK_URL")
    
    local http_code="${response: -3}"
    local response_body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        log_message "✅ Webhook sent successfully"
        return 0
    else
        log_message "❌ Webhook failed: HTTP $http_code - $response_body"
        return 1
    fi
}

# Function to process zone action commands from webhook responses
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

# Function to send action result webhook
send_action_result() {
    local action=$1
    local zone=$2
    local success=$3
    local message=$4
    
    local payload=$(cat << EOF
{
  "type": "zone_action_result",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "hostname": "$(hostname)",
  "action": "$action",
  "zone": "$zone",
  "success": $success,
  "message": "$message"
}
EOF
)
    
    send_webhook "$payload"
}

# Function to check for commands via webhook query
check_for_commands() {
    # Query the webhook endpoint for pending commands
    local signature=$(echo -n "ping" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)
    
    local response=$(curl -s \
        -H "X-Zone-Signature: sha256=$signature" \
        -H "X-Zone-Source: zone-webhook-client" \
        --connect-timeout 5 \
        --max-time 10 \
        "$WEBHOOK_URL?action=get_commands")
    
    # Parse commands if any
    if echo "$response" | jq -e '.commands | length > 0' > /dev/null 2>&1; then
        echo "$response" | jq -r '.commands[] | @base64' | while read -r command_b64; do
            local command=$(echo "$command_b64" | base64 -d)
            local action=$(echo "$command" | jq -r '.action')
            local zone=$(echo "$command" | jq -r '.zone')
            local command_id=$(echo "$command" | jq -r '.id')
            
            log_message "📋 Processing command: $action on zone $zone (ID: $command_id)"
            
            if execute_zone_action "$zone" "$action"; then
                send_action_result "$action" "$zone" true "Zone $zone $action completed successfully"
            else
                send_action_result "$action" "$zone" false "Zone $zone $action failed"
            fi
        done
    fi
}

# Main execution
case "${1:-daemon}" in
    "daemon")
        log_message "🚀 Starting zone webhook client daemon"
        log_message "📡 Webhook URL: $WEBHOOK_URL"
        
        # Validate webhook URL and secret
        if [ "$WEBHOOK_URL" = "http://localhost:3000/api/webhooks/zone-status" ]; then
            log_message "⚠️  WARNING: Using default webhook URL. Set ZONE_WEBHOOK_URL environment variable."
        fi
        
        if [ "$WEBHOOK_SECRET" = "your-secret-key-here" ]; then
            log_message "⚠️  WARNING: Using default webhook secret. Set ZONE_WEBHOOK_SECRET environment variable."
        fi
        
        # Main loop
        while true; do
            # Send status update
            local status_payload=$(generate_zone_status)
            send_webhook "$status_payload"
            
            # Check for pending commands
            check_for_commands
            
            sleep 10  # Send updates every 10 seconds
        done
        ;;
        
    "once")
        log_message "📤 Sending single webhook update"
        local payload=$(generate_zone_status)
        echo "Payload:"
        echo "$payload"
        echo ""
        send_webhook "$payload"
        ;;
        
    "test")
        log_message "🧪 Testing webhook connectivity"
        echo "Webhook URL: $WEBHOOK_URL"
        echo "Testing with ping payload..."
        
        local test_payload='{"type":"test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","message":"Test from zone-webhook-client"}'
        
        if send_webhook "$test_payload"; then
            echo "✅ Webhook test successful"
        else
            echo "❌ Webhook test failed"
            exit 1
        fi
        ;;
        
    "setup")
        log_message "⚙️  Setting up zone webhook client"
        
        # Create systemd service file
        cat > /etc/systemd/system/zone-webhook-client.service << EOF
[Unit]
Description=Zone Webhook Client
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/gaming-perks-shop
ExecStart=/var/www/gaming-perks-shop/zone-webhook-client.sh daemon
Restart=always
RestartSec=10
Environment=ZONE_WEBHOOK_URL=$WEBHOOK_URL
Environment=ZONE_WEBHOOK_SECRET=$WEBHOOK_SECRET

[Install]
WantedBy=multi-user.target
EOF
        
        systemctl daemon-reload
        echo "✅ Systemd service created. To start:"
        echo "   systemctl enable zone-webhook-client"
        echo "   systemctl start zone-webhook-client"
        echo ""
        echo "⚙️  Environment variables (set these in /etc/environment or service file):"
        echo "   ZONE_WEBHOOK_URL=$WEBHOOK_URL"
        echo "   ZONE_WEBHOOK_SECRET=$WEBHOOK_SECRET"
        ;;
        
    *)
        echo "Usage: $0 [daemon|once|test|setup]"
        echo ""
        echo "Commands:"
        echo "  daemon  - Run continuously, send webhooks every 10 seconds"
        echo "  once    - Send single webhook update and exit"
        echo "  test    - Test webhook connectivity"
        echo "  setup   - Create systemd service for automatic startup"
        echo ""
        echo "Environment variables:"
        echo "  ZONE_WEBHOOK_URL    - Webhook endpoint URL"
        echo "  ZONE_WEBHOOK_SECRET - Secret for webhook authentication"
        exit 1
        ;;
esac 