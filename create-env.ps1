# Create correct .env.local file from supabase-config.json
# This will fix the login issues by creating the proper environment variables

Write-Host "🔧 Creating correct .env.local file from supabase-config.json" -ForegroundColor Green

# Check if supabase-config.json exists
if (!(Test-Path "supabase-config.json")) {
    Write-Host "❌ supabase-config.json not found!" -ForegroundColor Red
    Write-Host "This file should be provided by the project owner" -ForegroundColor Red
    exit 1
}

# Read the config
try {
    $config = Get-Content "supabase-config.json" | ConvertFrom-Json
    
    # Extract values
    $supabaseUrl = $config.supabase.url
    $anonKey = $config.supabase.anon_key
    $serviceKey = $config.supabase.service_role_key
    
    Write-Host "✅ Read configuration from supabase-config.json" -ForegroundColor Green
    Write-Host "   URL: $($supabaseUrl.Substring(0, 30))..." -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Error reading supabase-config.json: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Create .env.local content
$envContent = @"
# Gaming Perks Shop Environment Variables
# Generated from supabase-config.json

NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_ROLE_KEY=$serviceKey

# Additional environment variables (add as needed)
# NEXT_PUBLIC_SITE_URL=http://localhost:3000
"@

# Backup existing .env.local if it exists
if (Test-Path ".env.local") {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item ".env.local" ".env.local.backup-$timestamp"
    Write-Host "✅ Backed up existing .env.local to .env.local.backup-$timestamp" -ForegroundColor Yellow
}

# Write new .env.local
try {
    $envContent | Out-File -FilePath ".env.local" -Encoding UTF8
    Write-Host "✅ Created new .env.local file" -ForegroundColor Green
    
    # Verify the file was created correctly
    if (Test-Path ".env.local") {
        $lines = Get-Content ".env.local" | Where-Object { $_ -match "^NEXT_PUBLIC_" }
        Write-Host "✅ Verified $($lines.Count) environment variables created" -ForegroundColor Green
    }
    
} catch {
    Write-Host "❌ Error creating .env.local: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎯 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Delete .next folder: Remove-Item .next -Recurse -Force" -ForegroundColor White
Write-Host "2. Start dev server: npm run dev" -ForegroundColor White
Write-Host "3. Try logging in at http://localhost:3000" -ForegroundColor White

Write-Host "`n✅ Environment setup complete!" -ForegroundColor Green 