#!/bin/bash

echo "🔧 Setting up zone-manager.sh permissions..."

# Navigate to the web server directory
cd /var/www/gaming-perks-shop

# Check if the script exists
if [ ! -f "zone-manager.sh" ]; then
    echo "❌ Error: zone-manager.sh not found in /var/www/gaming-perks-shop"
    echo "Please ensure you've copied the script to this location first."
    exit 1
fi

echo "✅ Found zone-manager.sh"

# Find out what user runs the Node.js process
echo "🔍 Checking Node.js process user..."
NODE_USER=$(ps aux | grep -E "node|npm|yarn|pm2" | grep -v grep | head -1 | awk '{print $1}')
if [ -z "$NODE_USER" ]; then
    echo "⚠️  Could not detect Node.js process user, assuming 'www-data'"
    NODE_USER="www-data"
else
    echo "📋 Detected Node.js process user: $NODE_USER"
fi

# Make the script executable by everyone (you can restrict this later)
echo "🔓 Making zone-manager.sh executable..."
chmod +x zone-manager.sh

# Set proper ownership - assuming your web server runs as www-data
echo "👤 Setting ownership to $NODE_USER..."
chown $NODE_USER:$NODE_USER zone-manager.sh

# Set directory permissions to allow script execution
echo "📁 Setting directory permissions..."
chmod 755 /var/www/gaming-perks-shop

# Check current permissions
echo "📋 Current permissions:"
ls -la zone-manager.sh

# Test script execution
echo "🧪 Testing script execution..."
if sudo -u $NODE_USER ./zone-manager.sh status-all; then
    echo "✅ Script execution test PASSED"
else
    echo "❌ Script execution test FAILED"
    echo "Additional debugging info:"
    echo "Working directory: $(pwd)"
    echo "Script path: $(realpath zone-manager.sh)"
    echo "Current user: $(whoami)"
    echo "Node user: $NODE_USER"
fi

echo "🔧 Permission setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Deploy your updated code with the new script path"
echo "2. Restart your Node.js application"
echo "3. Test the zone management from your web interface" 