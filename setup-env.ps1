#!/usr/bin/env pwsh

# Environment Setup Script for Gaming Perks Shop
# This script helps configure environment variables for development and production

Write-Host "🔧 Gaming Perks Shop - Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Environment Variables Needed:" -ForegroundColor Yellow
Write-Host ""

# Function to check if a file exists
function Check-EnvFile($fileName) {
    if (Test-Path $fileName) {
        Write-Host "✅ $fileName exists" -ForegroundColor Green
        return $true
    } else {
        Write-Host "❌ $fileName missing" -ForegroundColor Red
        return $false
    }
}

# Check for environment files
$hasLocalEnv = Check-EnvFile ".env.local"
$hasProdEnv = Check-EnvFile "production.env"

Write-Host ""
Write-Host "🔍 Required Environment Variables:" -ForegroundColor Cyan
Write-Host ""
Write-Host "For Supabase (Database):" -ForegroundColor White
Write-Host "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co" -ForegroundColor Gray
Write-Host "  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here" -ForegroundColor Gray
Write-Host "  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here" -ForegroundColor Gray
Write-Host ""
Write-Host "For Stripe (Payments):" -ForegroundColor White  
Write-Host "  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_..." -ForegroundColor Gray
Write-Host "  STRIPE_SECRET_KEY=sk_test_..." -ForegroundColor Gray
Write-Host "  STRIPE_WEBHOOK_SECRET=whsec_..." -ForegroundColor Gray
Write-Host ""
Write-Host "For Site URL:" -ForegroundColor White
Write-Host "  NEXT_PUBLIC_SITE_URL=http://localhost:3000 (dev) or https://freeinf.org (prod)" -ForegroundColor Gray

Write-Host ""
Write-Host "📚 How to get these values:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Supabase:" -ForegroundColor White
Write-Host "  1. Go to https://app.supabase.com" -ForegroundColor Gray
Write-Host "  2. Select your project" -ForegroundColor Gray
Write-Host "  3. Go to Settings > API" -ForegroundColor Gray
Write-Host "  4. Copy the URL and anon key" -ForegroundColor Gray
Write-Host ""
Write-Host "Stripe:" -ForegroundColor White
Write-Host "  1. Go to https://dashboard.stripe.com" -ForegroundColor Gray
Write-Host "  2. Go to Developers > API keys" -ForegroundColor Gray
Write-Host "  3. Use test keys for development" -ForegroundColor Gray

Write-Host ""
Write-Host "📁 Environment File Setup:" -ForegroundColor Yellow
Write-Host ""

if (!$hasLocalEnv) {
    Write-Host "Creating .env.local template..." -ForegroundColor White
    
    $envContent = @"
# Local Development Environment Variables
# Update with your actual values

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase Configuration
# Get these from https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Stripe Configuration (for testing)
# Get these from https://dashboard.stripe.com/test/apikeys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
"@

    $envContent | Out-File -FilePath ".env.local" -Encoding UTF8
    Write-Host "✅ Created .env.local template" -ForegroundColor Green
} else {
    Write-Host "✅ .env.local already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Edit .env.local with your actual Supabase and Stripe credentials" -ForegroundColor White
Write-Host "2. Make sure your Supabase database is set up with the correct tables" -ForegroundColor White
Write-Host "3. Run 'npm run dev' to start the development server" -ForegroundColor White
Write-Host "4. Visit http://localhost:3000 to test the application" -ForegroundColor White

Write-Host ""
Write-Host "⚠️  Important Security Notes:" -ForegroundColor Red
Write-Host ""
Write-Host "• Never commit .env.local to version control" -ForegroundColor Yellow
Write-Host "• Use test/development keys for local development" -ForegroundColor Yellow
Write-Host "• Keep production keys secure and separate" -ForegroundColor Yellow

Write-Host ""
Write-Host "🔧 For production deployment, use environment variables in your hosting platform" -ForegroundColor Cyan
Write-Host "" 