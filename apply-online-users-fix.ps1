# Apply Online Users RLS Fix Script
# This script fixes the RLS policies to allow online users display

Write-Host "🔧 Applying Online Users RLS Fix..." -ForegroundColor Yellow

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "❌ .env.local file not found. Please create it with your Supabase credentials." -ForegroundColor Red
    exit 1
}

# Read environment variables
Get-Content .env.local | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "env:$name" -Value $value
    }
}

# Check if we have the required variables
if (-not $env:NEXT_PUBLIC_SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
    Write-Host "   - NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Red
    Write-Host "   - SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Environment variables loaded" -ForegroundColor Green

# Check if the SQL file exists
if (-not (Test-Path "fix-rls-simple.sql")) {
    Write-Host "❌ fix-rls-simple.sql file not found." -ForegroundColor Red
    exit 1
}

# Read the SQL script
$sqlScript = Get-Content "fix-rls-simple.sql" -Raw

Write-Host "📡 Executing RLS fix via Supabase API..." -ForegroundColor Yellow

$headers = @{
    "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

# Execute the entire SQL script at once
try {
    $body = @{
        query = $sqlScript
    } | ConvertTo-Json

    # Try direct SQL execution
    $uri = "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/exec_sql"
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body
    
    Write-Host "✅ RLS fix applied successfully!" -ForegroundColor Green
    Write-Host "🎯 Online users should now display properly on the homepage." -ForegroundColor Green
    Write-Host "🔄 Try refreshing your browser to see the changes." -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to apply fix via API." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    # Show instructions for manual execution
    Write-Host "`n📋 Manual Fix Instructions:" -ForegroundColor Yellow
    Write-Host "1. Go to your Supabase dashboard: https://app.supabase.com" -ForegroundColor Cyan
    Write-Host "2. Navigate to your project" -ForegroundColor Cyan
    Write-Host "3. Go to SQL Editor" -ForegroundColor Cyan
    Write-Host "4. Copy and paste the contents of fix-rls-simple.sql" -ForegroundColor Cyan
    Write-Host "5. Click 'Run' to execute the script" -ForegroundColor Cyan
    
    Write-Host "`nSQL Content to copy:" -ForegroundColor Yellow
    Write-Host "===================" -ForegroundColor Yellow
    Write-Host $sqlScript -ForegroundColor White
    Write-Host "===================" -ForegroundColor Yellow
}

Write-Host "`n🔄 After applying the fix, the online users section should work properly." -ForegroundColor Green 