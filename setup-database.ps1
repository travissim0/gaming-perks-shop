#!/usr/bin/env pwsh

# Database Setup Script for Gaming Perks Shop
# This script helps you apply the database schema to your Supabase project

Write-Host "🗄️ Gaming Perks Shop - Database Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 Database Schema Setup Required" -ForegroundColor Yellow
Write-Host ""

Write-Host "This error means your Supabase database doesn't have the required tables and relationships." -ForegroundColor White
Write-Host "You need to set up the database schema before the admin dashboard will work." -ForegroundColor White

Write-Host ""
Write-Host "🔧 Manual Setup Steps:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Open Supabase Dashboard:" -ForegroundColor White
Write-Host "   https://app.supabase.com" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Navigate to your project" -ForegroundColor White
Write-Host ""

Write-Host "3. Go to SQL Editor:" -ForegroundColor White
Write-Host "   Click 'SQL Editor' in the left sidebar" -ForegroundColor Gray
Write-Host ""

Write-Host "4. Copy and paste the schema:" -ForegroundColor White
Write-Host "   Open the file: database-schema.sql" -ForegroundColor Gray
Write-Host "   Copy all contents and paste into SQL Editor" -ForegroundColor Gray
Write-Host ""

Write-Host "5. Run the SQL:" -ForegroundColor White
Write-Host "   Click 'RUN' button to execute the schema" -ForegroundColor Gray
Write-Host ""

Write-Host "📄 Schema File Location:" -ForegroundColor Cyan
Write-Host "  $(Get-Location)\database-schema.sql" -ForegroundColor White

Write-Host ""
Write-Host "✅ What this schema creates:" -ForegroundColor Green
Write-Host ""
Write-Host "Tables:" -ForegroundColor White
Write-Host "  • profiles - User profiles with admin flags" -ForegroundColor Gray
Write-Host "  • products - Purchasable perks and items" -ForegroundColor Gray
Write-Host "  • user_products - Purchased items (links users to products)" -ForegroundColor Gray
Write-Host "  • squads - Squad/team system" -ForegroundColor Gray
Write-Host "  • squad_members - Squad membership" -ForegroundColor Gray
Write-Host "  • squad_invites - Squad invitation system" -ForegroundColor Gray
Write-Host "  • donations - Donation tracking" -ForegroundColor Gray

Write-Host ""
Write-Host "Security:" -ForegroundColor White
Write-Host "  • Row Level Security (RLS) policies" -ForegroundColor Gray
Write-Host "  • Proper foreign key relationships" -ForegroundColor Gray
Write-Host "  • Admin-only access controls" -ForegroundColor Gray

Write-Host ""
Write-Host "Sample Data:" -ForegroundColor White
Write-Host "  • 3 example products (VIP, Premium, Supporter)" -ForegroundColor Gray

Write-Host ""
Write-Host "🚨 Important Notes:" -ForegroundColor Red
Write-Host ""
Write-Host "• Run this SQL in your Supabase project, not locally" -ForegroundColor Yellow
Write-Host "• Make sure you're connected to the correct project" -ForegroundColor Yellow
Write-Host "• The script is safe to run multiple times (uses IF NOT EXISTS)" -ForegroundColor Yellow

Write-Host ""
Write-Host "🔍 After Setup:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Grant yourself admin access:" -ForegroundColor White
Write-Host "   Run the SQL from: grant-admin-access.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the admin dashboard:" -ForegroundColor White
Write-Host "   Visit: http://localhost:3000/admin" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Verify stats are loading:" -ForegroundColor White
Write-Host "   You should see user count, product count, and sales data" -ForegroundColor Gray

Write-Host ""
Write-Host "🆘 Need Help?" -ForegroundColor Yellow
Write-Host ""
Write-Host "If you encounter issues:" -ForegroundColor White
Write-Host "• Check your Supabase project is active" -ForegroundColor Gray
Write-Host "• Verify environment variables are set correctly" -ForegroundColor Gray
Write-Host "• Run './check-env-status.ps1' to verify configuration" -ForegroundColor Gray
Write-Host "• Check the browser console for detailed error messages" -ForegroundColor Gray

Write-Host ""

# Option to open schema file for easy copying
$openFile = Read-Host "Open database-schema.sql file for copying? (y/n)"
if ($openFile -eq 'y' -or $openFile -eq 'Y') {
    if (Test-Path "database-schema.sql") {
        Start-Process "database-schema.sql"
        Write-Host "📂 Opening database-schema.sql..." -ForegroundColor Green
    } else {
        Write-Host "❌ database-schema.sql file not found" -ForegroundColor Red
    }
}

# Option to open Supabase dashboard
$openSupabase = Read-Host "Open Supabase Dashboard now? (y/n)"
if ($openSupabase -eq 'y' -or $openSupabase -eq 'Y') {
    Start-Process "https://app.supabase.com"
    Write-Host "🌐 Opening Supabase Dashboard..." -ForegroundColor Green
}

Write-Host ""
Write-Host "💡 Tip: Keep this window open while setting up the database!" -ForegroundColor Cyan
Write-Host "" 