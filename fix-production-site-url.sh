#!/bin/bash

echo "🔧 FIXING PRODUCTION SITE URL"
echo "=============================="

# Check current environment
echo "📋 Current environment variables:"
echo "NEXT_PUBLIC_SITE_URL = ${NEXT_PUBLIC_SITE_URL:-'NOT SET'}"

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local file exists"
    echo "📄 Current SITE_URL setting:"
    grep "NEXT_PUBLIC_SITE_URL" .env.local || echo "❌ NEXT_PUBLIC_SITE_URL not found in .env.local"
else
    echo "❌ .env.local file does not exist"
fi

# Add/update NEXT_PUBLIC_SITE_URL in .env.local
echo ""
echo "🔄 Setting NEXT_PUBLIC_SITE_URL to https://freeinf.org..."

# Create .env.local if it doesn't exist
touch .env.local

# Remove existing NEXT_PUBLIC_SITE_URL line if it exists
sed -i '/^NEXT_PUBLIC_SITE_URL=/d' .env.local

# Add the correct NEXT_PUBLIC_SITE_URL
echo "NEXT_PUBLIC_SITE_URL=https://freeinf.org" >> .env.local

echo "✅ Updated .env.local with correct site URL"
echo ""
echo "📄 New .env.local contents:"
cat .env.local

echo ""
echo "🔄 Restarting PM2 application..."
pm2 restart gaming-perks-shop

echo ""
echo "✅ Production site URL fix completed!"
echo "🌐 New donations should now redirect to freeinf.org" 