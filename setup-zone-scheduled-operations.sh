#!/bin/bash

# Setup script for scheduled zone operations
# This script configures the environment variables needed for the zone-manager.sh
# to connect to the Supabase database for scheduled operations

echo "=== Zone Scheduled Operations Setup ==="
echo ""

# Check if jq is installed (required for JSON parsing)
if ! command -v jq &> /dev/null; then
    echo "Installing jq (required for JSON parsing)..."
    apt-get update && apt-get install -y jq
fi

# Check if curl is installed (required for API calls)
if ! command -v curl &> /dev/null; then
    echo "Installing curl (required for API calls)..."
    apt-get update && apt-get install -y curl
fi

# Create environment file for zone manager
ENV_FILE="/root/Infantry/scripts/.env"
mkdir -p "/root/Infantry/scripts"

cat > "$ENV_FILE" << 'EOF'
# Supabase Configuration for Zone Management
SUPABASE_URL="https://nkinpmqnbcjaftqduujf.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4"
EOF

echo "✅ Environment file created: $ENV_FILE"

# Update zone-manager.sh to source the environment file
ZONE_MANAGER="/root/Infantry/scripts/zone-manager.sh"

if [ -f "$ZONE_MANAGER" ]; then
    # Add source command at the top of the script (after shebang)
    if ! grep -q "source.*\.env" "$ZONE_MANAGER"; then
        # Create a temporary file with the updated content
        cat > "/tmp/zone-manager-updated.sh" << 'EOF'
#!/bin/bash

# Source environment variables
if [ -f "/root/Infantry/scripts/.env" ]; then
    source "/root/Infantry/scripts/.env"
fi

EOF
        # Append the rest of the original file (skip the first line - shebang)
        tail -n +2 "$ZONE_MANAGER" >> "/tmp/zone-manager-updated.sh"
        
        # Replace the original file
        mv "/tmp/zone-manager-updated.sh" "$ZONE_MANAGER"
        chmod +x "$ZONE_MANAGER"
        
        echo "✅ Updated zone-manager.sh to source environment variables"
    else
        echo "✅ zone-manager.sh already configured to source environment variables"
    fi
else
    echo "❌ zone-manager.sh not found at $ZONE_MANAGER"
fi

# Test the scheduled operations function
echo ""
echo "Testing scheduled operations functionality..."
echo "Running: $ZONE_MANAGER check-scheduled"

if "$ZONE_MANAGER" check-scheduled; then
    echo "✅ Scheduled operations test completed successfully"
else
    echo "❌ Scheduled operations test failed"
    echo "Check the logs at /var/log/zone-scheduled.log for details"
fi

# Display cron job setup instructions
echo ""
echo "=== Cron Job Setup ==="
echo "To enable automatic scheduled operations, add this to your crontab:"
echo ""
echo "*/5 * * * * /root/Infantry/scripts/zone-manager.sh check-scheduled >> /var/log/zone-scheduled.log 2>&1"
echo ""
echo "To edit your crontab, run: crontab -e"
echo ""

# Create log file with proper permissions
touch /var/log/zone-scheduled.log
chmod 644 /var/log/zone-scheduled.log

echo "✅ Setup completed!"
echo ""
echo "Next steps:"
echo "1. Add the cron job shown above to run scheduled operations every 5 minutes"
echo "2. Test scheduling operations through the web admin interface"
echo "3. Monitor logs at /var/log/zone-scheduled.log" 