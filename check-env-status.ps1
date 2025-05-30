#!/usr/bin/env pwsh

# Environment Status Checker for Gaming Perks Shop
# This script checks if environment variables are properly configured

Write-Host "🔍 Gaming Perks Shop - Environment Status Check" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Function to check environment variable
function Check-EnvVar($varName, $description) {
    $value = [Environment]::GetEnvironmentVariable($varName)
    if (!$value) {
        # Try to read from .env.local file
        if (Test-Path ".env.local") {
            $content = Get-Content ".env.local" -Raw
            if ($content -match "$varName=(.+)") {
                $value = $matches[1].Trim()
            }
        }
    }
    
    $status = "❌ Missing"
    $color = "Red"
    
    if ($value) {
        if ($value.Contains("your_") -or $value.Contains("your-project") -or $value -eq "not-configured-key") {
            $status = "⚠️  Template value (needs update)"
            $color = "Yellow"
        } else {
            $status = "✅ Configured"
            $color = "Green"
            $value = $value.Substring(0, [Math]::Min(20, $value.Length)) + "..."
        }
    }
    
    Write-Host "$description" -ForegroundColor White
    Write-Host "  ${varName}: $status" -ForegroundColor $color
    if ($value -and !$value.Contains("your_") -and !$value.Contains("your-project")) {
        Write-Host "  Value: $value" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host ""
Write-Host "📊 Environment Variable Status:" -ForegroundColor Yellow
Write-Host ""

# Check all required environment variables
Check-EnvVar "NEXT_PUBLIC_SITE_URL" "Site URL"
Check-EnvVar "NEXT_PUBLIC_SUPABASE_URL" "Supabase Project URL"
Check-EnvVar "NEXT_PUBLIC_SUPABASE_ANON_KEY" "Supabase Anonymous Key"
Check-EnvVar "SUPABASE_SERVICE_ROLE_KEY" "Supabase Service Role Key"
Check-EnvVar "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "Stripe Publishable Key"
Check-EnvVar "STRIPE_SECRET_KEY" "Stripe Secret Key"
Check-EnvVar "STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret"

# Check for environment files
Write-Host "📁 Environment Files:" -ForegroundColor Yellow
Write-Host ""

if (Test-Path ".env.local") {
    Write-Host "✅ .env.local exists" -ForegroundColor Green
} else {
    Write-Host "❌ .env.local missing" -ForegroundColor Red
    Write-Host "  Run './setup-env.ps1' to create template" -ForegroundColor Gray
}

if (Test-Path "production.env") {
    Write-Host "✅ production.env exists" -ForegroundColor Green
} else {
    Write-Host "❌ production.env missing" -ForegroundColor Red
}

Write-Host ""

# Check if running in development or production
$nodeEnv = [Environment]::GetEnvironmentVariable("NODE_ENV")
if (!$nodeEnv) { $nodeEnv = "development" }

Write-Host "🏃 Runtime Environment:" -ForegroundColor Yellow
Write-Host "  NODE_ENV: $nodeEnv" -ForegroundColor White
Write-Host ""

# Provide recommendations
Write-Host "💡 Recommendations:" -ForegroundColor Yellow
Write-Host ""

$hasIssues = $false

# Check for missing .env.local
if (!(Test-Path ".env.local")) {
    Write-Host "• Run './setup-env.ps1' to create environment template" -ForegroundColor White
    $hasIssues = $true
}

# Check for template values in .env.local
if (Test-Path ".env.local") {
    $content = Get-Content ".env.local" -Raw
    if ($content.Contains("your_") -or $content.Contains("your-project")) {
        Write-Host "• Update .env.local with your actual Supabase and Stripe credentials" -ForegroundColor White
        Write-Host "• Get Supabase credentials from: https://app.supabase.com" -ForegroundColor Gray
        Write-Host "• Get Stripe credentials from: https://dashboard.stripe.com" -ForegroundColor Gray
        $hasIssues = $true
    }
}

if (!$hasIssues) {
    Write-Host "✅ All environment variables appear to be configured!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 You can now run:" -ForegroundColor Cyan
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host "  # or" -ForegroundColor Gray
    Write-Host "  npm run build && npm start" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "⚠️  Please fix the above issues before running the application" -ForegroundColor Yellow
}

Write-Host "" 