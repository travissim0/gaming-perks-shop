#!/usr/bin/env pwsh

# Environment Setup Script for Gaming Perks Shop
# This script helps set up the required environment variables

Write-Host "🎮 Gaming Perks Shop - Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if .env.local exists
if (Test-Path ".env.local") {
    Write-Host "📄 Found existing .env.local file" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "✋ Setup cancelled" -ForegroundColor Yellow
        exit
    }
}

Write-Host ""
Write-Host "🔧 Setting up environment variables..." -ForegroundColor Green

# Supabase Configuration
Write-Host ""
Write-Host "📊 SUPABASE CONFIGURATION" -ForegroundColor Magenta
$SUPABASE_URL = Read-Host "Enter your Supabase URL"
$SUPABASE_ANON_KEY = Read-Host "Enter your Supabase Anon Key"
$SUPABASE_SERVICE_ROLE_KEY = Read-Host "Enter your Supabase Service Role Key (for server operations)"

# Site Configuration
Write-Host ""
Write-Host "🌐 SITE CONFIGURATION" -ForegroundColor Magenta
$SITE_URL = Read-Host "Enter your site URL (e.g., https://your-domain.com)"

# Ko-fi Configuration (Optional)
Write-Host ""
Write-Host "☕ KO-FI CONFIGURATION (Optional)" -ForegroundColor Magenta
Write-Host "Ko-fi webhook token is optional but recommended for security" -ForegroundColor Gray
$KOFI_TOKEN = Read-Host "Enter your Ko-fi webhook verification token (or press Enter to skip)"



# Write to .env.local
$envContent = @"
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

# Site Configuration
NEXT_PUBLIC_SITE_URL=$SITE_URL

"@

# Add Ko-fi configuration if provided
if ($KOFI_TOKEN) {
    $envContent += @"
# Ko-fi Configuration
KOFI_VERIFICATION_TOKEN=$KOFI_TOKEN

"@
}



# Write the file
$envContent | Out-File -FilePath ".env.local" -Encoding utf8

Write-Host ""
Write-Host "✅ Environment setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Created .env.local with the following configurations:" -ForegroundColor Yellow
Write-Host "   • Supabase database connection" -ForegroundColor White
Write-Host "   • Site URL configuration" -ForegroundColor White

if ($KOFI_TOKEN) {
    Write-Host "   • Ko-fi webhook integration" -ForegroundColor White
}



Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm install" -ForegroundColor White
Write-Host "2. Set up your database using the SQL scripts in the project" -ForegroundColor White
Write-Host "3. Run: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "📚 For more information, check the README.md file" -ForegroundColor Gray 