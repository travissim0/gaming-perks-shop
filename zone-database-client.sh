#!/bin/bash

# Zone Database Client - Writes zone status directly to database
# This script bypasses the web application entirely and communicates via database
# The web application only reads from the database, never executes scripts

ZONES_DIR="/root/Infantry/Zones"
LOG_FILE="/root/Infantry/logs/zone-database-client.log"

# Database configuration (set these in environment or modify here)
SUPABASE_URL="${SUPABASE_URL:-https://nkinpmqnbcjaftqduujf.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5tcW5iY2phZnRxZHV1amYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNzIyNjUxMiwiZXhwIjoyMDUyODAyNTEyfQ.09-090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090

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

# Function to make authenticated Supabase API call
supabase_api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local url="${SUPABASE_URL}/rest/v1/${endpoint}"
    local headers=(
        -H "apikey: $SUPABASE_SERVICE_KEY"
        -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
        -H "Content-Type: application/json"
        -H "Prefer: return=minimal"
    )
    
    if [ "$method" = "POST" ]; then
        curl -s -X POST "${headers[@]}" --data-raw "$data" "$url"
    elif [ "$method" = "PUT" ]; then
        curl -s -X PUT "${headers[@]}" --data-raw "$data" "$url"
    elif [ "$method" = "PATCH" ]; then
        curl -s -X PATCH "${headers[@]}" --data-raw "$data" "$url"
    else
        curl -s "${headers[@]}" "$url"
    fi
}

# Function to update zone status in database
update_zone_status() {
    log_message "📊 Updating zone status in database..."
    
    # Build zones data
    local zones_data=""
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
                zones_data="${zones_data},"
            fi
            
            zones_data="${zones_data}\"${short_name}\":{\"name\":\"${zone_name}\",\"status\":\"${status}\",\"last_checked\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}"
        fi
    done
    
    # Create the full status record
    local status_record=$(cat << EOF
{
  "id": "current",
  "zones_data": {${zones_data}},
  "hostname": "$(hostname)",
  "source": "zone-database-client",
  "last_update": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF
)
    
    # Upsert to zone_status table
    local response=$(supabase_api_call "POST" "zone_status" "$status_record")
    
    if [ $? -eq 0 ]; then
        log_message "✅ Zone status updated in database successfully"
        return 0
    else
        log_message "❌ Failed to update zone status: $response"
        return 1
    fi
}

# Function to check for pending commands in database
check_pending_commands() {
    local response=$(supabase_api_call "GET" "zone_commands?status=eq.pending&order=created_at.asc")
    
    if [ $? -ne 0 ]; then
        log_message "❌ Failed to check for pending commands"
        return 1
    fi
    
    # Process each command
    echo "$response" | jq -r '.[] | @base64' 2>/dev/null | while read -r command_b64; do
        local command=$(echo "$command_b64" | base64 -d)
        local command_id=$(echo "$command" | jq -r '.id')
        local action=$(echo "$command" | jq -r '.action')
        local zone=$(echo "$command" | jq -r '.zone')
        local admin_id=$(echo "$command" | jq -r '.admin_id // empty')
        
        log_message "📋 Processing database command: $action on zone $zone (ID: $command_id)"
        
        # Mark command as processing
        mark_command_processing "$command_id"
        
        # Execute the command
        if execute_zone_action "$zone" "$action"; then
            # Mark as completed
            complete_command "$command_id" true "Zone $zone $action completed successfully" "$admin_id"
        else
            # Mark as failed
            complete_command "$command_id" false "Zone $zone $action failed" "$admin_id"
        fi
    done
}

# Function to mark command as processing
mark_command_processing() {
    local command_id="$1"
    local update_data="{\"status\":\"processing\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}"
    
    supabase_api_call "PATCH" "zone_commands?id=eq.$command_id" "$update_data" > /dev/null
}

# Function to complete command
complete_command() {
    local command_id="$1"
    local success="$2"
    local message="$3"
    local admin_id="$4"
    
    local status
    if [ "$success" = "true" ]; then
        status="completed"
    else
        status="failed"
    fi
    
    local update_data="{\"status\":\"$status\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"result_message\":\"$message\"}"
    
    supabase_api_call "PATCH" "zone_commands?id=eq.$command_id" "$update_data" > /dev/null
    
    # Log to admin_logs if admin_id is available
    if [ -n "$admin_id" ] && [ "$admin_id" != "null" ]; then
        local log_data="{\"admin_id\":\"$admin_id\",\"action\":\"zone_${action}_result\",\"details\":\"$message (database)\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}"
        supabase_api_call "POST" "admin_logs" "$log_data" > /dev/null
    fi
}

# Zone action execution functions
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

# Function to test database connectivity
test_database() {
    log_message "🧪 Testing database connectivity..."
    
    # Test read access
    local test_read=$(supabase_api_call "GET" "zone_status?select=id&limit=1")
    if [ $? -ne 0 ]; then
        echo "❌ Database read test failed"
        return 1
    fi
    
    # Test write access with a ping record
    local ping_data="{\"id\":\"ping-test-$(date +%s)\",\"zones_data\":{},\"hostname\":\"$(hostname)\",\"source\":\"zone-database-client-test\",\"last_update\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}"
    local test_write=$(supabase_api_call "POST" "zone_status" "$ping_data")
    if [ $? -ne 0 ]; then
        echo "❌ Database write test failed"
        return 1
    fi
    
    echo "✅ Database connectivity test successful"
    return 0
}

# Function to setup database tables
setup_database() {
    log_message "⚙️  Setting up database tables..."
    
    cat << 'EOF'
-- Run this SQL in your Supabase SQL editor:

-- Zone status table
CREATE TABLE IF NOT EXISTS zone_status (
    id TEXT PRIMARY KEY,
    zones_data JSONB NOT NULL DEFAULT '{}',
    hostname TEXT,
    source TEXT,
    last_update TIMESTAMPTZ DEFAULT NOW()
);

-- Zone commands table  
CREATE TABLE IF NOT EXISTS zone_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL CHECK (action IN ('start', 'stop', 'restart')),
    zone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    admin_id UUID REFERENCES profiles(id),
    result_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Enable RLS (Row Level Security)
ALTER TABLE zone_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_commands ENABLE ROW LEVEL SECURITY;

-- Policies for zone_status (admin read, service write)
CREATE POLICY "Admins can read zone status" ON zone_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_admin = true OR profiles.ctf_role IN ('ctf_admin', 'ctf_head_referee'))
        )
    );

CREATE POLICY "Service can write zone status" ON zone_status
    FOR ALL USING (true);

-- Policies for zone_commands (admin read/write, service read/write)
CREATE POLICY "Admins can manage zone commands" ON zone_commands
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_admin = true OR profiles.ctf_role IN ('ctf_admin', 'ctf_head_referee'))
        )
    );

CREATE POLICY "Service can manage zone commands" ON zone_commands
    FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_zone_status_last_update ON zone_status(last_update);
CREATE INDEX IF NOT EXISTS idx_zone_commands_status ON zone_commands(status);
CREATE INDEX IF NOT EXISTS idx_zone_commands_created_at ON zone_commands(created_at);

EOF
    
    echo ""
    echo "✅ Database setup SQL generated above"
    echo "💡 Copy and run this SQL in your Supabase SQL editor"
}

# Main execution
case "${1:-daemon}" in
    "daemon")
        log_message "🚀 Starting zone database client daemon"
        log_message "🗄️  Database URL: $SUPABASE_URL"
        
        # Validate configuration
        if [ "$SUPABASE_URL" = "https://nkinpmqnbcjaftqduujf.supabase.co" ]; then
            log_message "⚠️  WARNING: Using default Supabase URL. Set SUPABASE_URL environment variable."
        fi
        
        if [ "$SUPABASE_SERVICE_KEY" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5tcW5iY2phZnRxZHV1amYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNzIyNjUxMiwiZXhwIjoyMDUyODAyNTEyfQ.09-0909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090909090
            log_message "⚠️  WARNING: Using default service key. Set SUPABASE_SERVICE_KEY environment variable."
        fi
        
        # Test database connectivity first
        if ! test_database; then
            log_message "💥 Database connectivity test failed. Exiting."
            exit 1
        fi
        
        log_message "✅ Database connectivity confirmed. Starting main loop..."
        
        # Main loop
        while true; do
            # Update zone status
            update_zone_status
            
            # Check for pending commands
            check_pending_commands
            
            sleep 5  # Update every 5 seconds
        done
        ;;
        
    "once")
        log_message "📤 Running single database update"
        test_database && update_zone_status && check_pending_commands
        ;;
        
    "test")
        log_message "🧪 Testing database connectivity"
        test_database
        ;;
        
    "setup-db")
        setup_database
        ;;
        
    "setup-service")
        log_message "⚙️  Setting up zone database client service"
        
        # Create systemd service file
        cat > /etc/systemd/system/zone-database-client.service << EOF
[Unit]
Description=Zone Database Client
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/gaming-perks-shop
ExecStart=/var/www/gaming-perks-shop/zone-database-client.sh daemon
Restart=always
RestartSec=10
Environment=SUPABASE_URL=$SUPABASE_URL
Environment=SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

[Install]
WantedBy=multi-user.target
EOF
        
        systemctl daemon-reload
        echo "✅ Systemd service created. To start:"
        echo "   systemctl enable zone-database-client"
        echo "   systemctl start zone-database-client"
        echo ""
        echo "⚙️  Environment variables (set these in /etc/environment or service file):"
        echo "   SUPABASE_URL=$SUPABASE_URL"
        echo "   SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY"
        ;;
        
    *)
        echo "Usage: $0 [daemon|once|test|setup-db|setup-service]"
        echo ""
        echo "Commands:"
        echo "  daemon        - Run continuously, update database every 5 seconds"
        echo "  once          - Single database update and exit"
        echo "  test          - Test database connectivity"
        echo "  setup-db      - Generate SQL for database table setup"
        echo "  setup-service - Create systemd service for automatic startup"
        echo ""
        echo "Environment variables:"
        echo "  SUPABASE_URL        - Your Supabase project URL"
        echo "  SUPABASE_SERVICE_KEY - Your Supabase service role key"
        echo ""
        echo "Prerequisites:"
        echo "  - curl and jq must be installed"
        echo "  - Database tables must be created (run setup-db first)"
        exit 1
        ;;
esac 