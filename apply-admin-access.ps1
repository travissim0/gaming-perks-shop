#!/usr/bin/env pwsh

# Apply admin access for Axidus
# This script helps you apply the admin access changes

Write-Host "🔐 Granting Admin Access to Axidus" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 MANUAL STEPS REQUIRED:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Open Supabase Dashboard: https://app.supabase.com" -ForegroundColor White
Write-Host "2. Navigate to your project" -ForegroundColor White
Write-Host "3. Go to SQL Editor" -ForegroundColor White
Write-Host "4. Copy and paste the contents of 'grant-admin-access.sql'" -ForegroundColor White
Write-Host "5. Click 'Run' to execute the SQL" -ForegroundColor White
Write-Host ""

Write-Host "📂 SQL File Location: grant-admin-access.sql" -ForegroundColor Green
Write-Host ""

# Show the SQL content for easy copying
Write-Host "📄 SQL Content to Execute:" -ForegroundColor Cyan
Write-Host "------------------------" -ForegroundColor Gray
Get-Content -Path "grant-admin-access.sql" | ForEach-Object { 
    Write-Host $_ -ForegroundColor White
}
Write-Host "------------------------" -ForegroundColor Gray
Write-Host ""

Write-Host "✅ After running the SQL, you'll have access to:" -ForegroundColor Green
Write-Host "  • /admin - Admin Dashboard" -ForegroundColor White
Write-Host "  • /admin/perks - Manage Donation Perks" -ForegroundColor White
Write-Host "  • /admin/users - Manage Users" -ForegroundColor White
Write-Host "  • /admin/orders - View Orders" -ForegroundColor White
Write-Host "  • /admin/donations - View Donations" -ForegroundColor White
Write-Host ""

Write-Host "🎯 Access URLs:" -ForegroundColor Yellow
Write-Host "  Local: http://localhost:3000/admin" -ForegroundColor White
Write-Host "  Live: https://freeinf.org/admin" -ForegroundColor White
Write-Host ""

Write-Host "⚠️  Note: You need to be logged in with email 'qwerty5544@aim.com'" -ForegroundColor Yellow
Write-Host "   or have in-game alias 'Axidus' for admin access to work." -ForegroundColor Yellow
Write-Host ""

# Option to open Supabase dashboard
$openSupabase = Read-Host "Open Supabase Dashboard now? (y/n)"
if ($openSupabase -eq 'y' -or $openSupabase -eq 'Y') {
    Start-Process "https://app.supabase.com"
    Write-Host "🌐 Opening Supabase Dashboard..." -ForegroundColor Green
} 