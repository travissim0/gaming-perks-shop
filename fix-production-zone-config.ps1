# Fix Production Zone Management Configuration
# Run this on the production server (linux-1.freeinfantry.com)

Write-Host "🔧 Fixing Production Zone Management Configuration" -ForegroundColor Cyan

# Check current configuration
Write-Host "`n📋 Current Environment Variables:" -ForegroundColor Yellow
Write-Host "NODE_ENV: $env:NODE_ENV"
Write-Host "ZONE_MANAGEMENT_MODE: $env:ZONE_MANAGEMENT_MODE"
Write-Host "ZONE_MANAGEMENT_LOCAL: $env:ZONE_MANAGEMENT_LOCAL"

# Instructions for Linux server (since this is a Windows script but server is Linux)
Write-Host "`n🐧 Linux Server Configuration Steps:" -ForegroundColor Green
Write-Host "1. SSH into your production server:"
Write-Host "   ssh root@linux-1.freeinfantry.com" -ForegroundColor Cyan

Write-Host "`n2. Navigate to your application directory:"
Write-Host "   cd /path/to/your/gaming-perks-shop" -ForegroundColor Cyan

Write-Host "`n3. Check current environment file:"
Write-Host "   cat .env.local" -ForegroundColor Cyan

Write-Host "`n4. Remove or comment out these lines if they exist:"
Write-Host "   # ZONE_MANAGEMENT_MODE=ssh" -ForegroundColor Red
Write-Host "   # ZONE_MANAGEMENT_LOCAL=true" -ForegroundColor Red

Write-Host "`n5. Add this line to ensure direct execution:"
Write-Host "   ZONE_MANAGEMENT_MODE=direct" -ForegroundColor Green

Write-Host "`n6. Verify the zone script has proper permissions:"
Write-Host "   chmod +x /root/Infantry/scripts/zone-manager.sh" -ForegroundColor Cyan

Write-Host "`n7. Test the script directly:"
Write-Host "   /root/Infantry/scripts/zone-manager.sh status-all" -ForegroundColor Cyan

Write-Host "`n8. Restart your Node.js/PM2 process:"
Write-Host "   pm2 restart all" -ForegroundColor Cyan
Write-Host "   # or restart your process manager"

Write-Host "`n9. Test the API endpoint:"
Write-Host "   curl -X GET 'http://localhost:3000/api/admin/zone-management?action=status-all' -H 'Authorization: Bearer YOUR_TOKEN'" -ForegroundColor Cyan

Write-Host "`n✅ After these changes, the production site should use direct execution instead of SSH" -ForegroundColor Green 