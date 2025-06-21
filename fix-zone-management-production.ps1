# Fix Zone Management on Production Server
# This script helps deploy the zone management fixes

Write-Host "🔧 Zone Management Production Fix Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Check if we have the required files
Write-Host "`n📋 Step 1: Checking required files..." -ForegroundColor Yellow

$requiredFiles = @(
    "production.env",
    "src/app/api/admin/zone-management/route.ts",
    "zone-manager.sh",
    "test-zone-management.js"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    } else {
        Write-Host "✅ Found: $file" -ForegroundColor Green
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "❌ Missing required files:" -ForegroundColor Red
    $missingFiles | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    exit 1
}

# Step 2: Show the environment configuration
Write-Host "`n📋 Step 2: Current production environment configuration..." -ForegroundColor Yellow
Write-Host "Contents of production.env:" -ForegroundColor Gray
Get-Content "production.env" | Where-Object { $_ -match "ZONE_MANAGEMENT|INFANTRY_SERVER" } | ForEach-Object {
    Write-Host "   $_" -ForegroundColor Gray
}

# Step 3: Test locally first (if in development)
if ($env:NODE_ENV -eq "development") {
    Write-Host "`n📋 Step 3: Testing zone management locally..." -ForegroundColor Yellow
    Write-Host "Running test script..." -ForegroundColor Gray
    
    try {
        node test-zone-management.js
        Write-Host "✅ Local test completed" -ForegroundColor Green
    } catch {
        Write-Host "❌ Local test failed: $_" -ForegroundColor Red
        Write-Host "This might be expected if SSH keys are not configured locally" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n📋 Step 3: Skipping local test (not in development mode)" -ForegroundColor Yellow
}

# Step 4: Instructions for production deployment
Write-Host "`n📋 Step 4: Production deployment instructions..." -ForegroundColor Yellow
Write-Host @"
To deploy these fixes to production:

1. 🚀 Deploy the updated code to your server:
   - Upload the modified 'src/app/api/admin/zone-management/route.ts'
   - Upload the updated 'production.env' with zone management config
   - Make sure 'zone-manager.sh' is in '/root/Infantry/scripts/' on the server

2. 🔧 Set the environment variables on production:
   - ZONE_MANAGEMENT_LOCAL=false
   - INFANTRY_SERVER_HOST=linux-1.freeinfantry.com  
   - INFANTRY_SERVER_USER=root

3. 🔄 Restart your Next.js application on the server

4. 🧪 Test the zone management:
   - Visit https://freeinf.org/admin/zones
   - Click the "Refresh" button
   - Check browser console for detailed logs

5. 📊 Monitor the logs:
   - Check your application logs for the emoji-prefixed debug messages
   - Look for: 🔧, 🖥️, 📋, ✅, ❌ messages

"@ -ForegroundColor White

Write-Host "`n📋 Key Changes Made:" -ForegroundColor Yellow
Write-Host "✅ Fixed server detection logic to use environment variables" -ForegroundColor Green
Write-Host "✅ Added comprehensive logging with emojis for easy debugging" -ForegroundColor Green  
Write-Host "✅ Improved error handling and timeout management" -ForegroundColor Green
Write-Host "✅ Added production environment configuration" -ForegroundColor Green
Write-Host "✅ Created test script for verification" -ForegroundColor Green

Write-Host "`n🎯 Expected Behavior:" -ForegroundColor Yellow
Write-Host "- On production: Commands execute directly on server (no SSH)" -ForegroundColor White
Write-Host "- On development: Commands use SSH to connect to linux-1.freeinfantry.com" -ForegroundColor White
Write-Host "- Debug logs show which mode is being used" -ForegroundColor White

Write-Host "`n🔍 Troubleshooting:" -ForegroundColor Yellow
Write-Host "If zones still don't load:" -ForegroundColor White
Write-Host "1. Check that zone-manager.sh is executable: chmod +x /root/Infantry/scripts/zone-manager.sh" -ForegroundColor Gray
Write-Host "2. Verify the script path exists on the server" -ForegroundColor Gray
Write-Host "3. Check application logs for detailed error messages" -ForegroundColor Gray
Write-Host "4. Test the script manually on the server: /root/Infantry/scripts/zone-manager.sh status-all" -ForegroundColor Gray

Write-Host "`n🎉 Ready for deployment!" -ForegroundColor Green 