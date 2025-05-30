# Apply RLS Policy Fix Script
# This script applies the fixed RLS policies to allow admin role updates

Write-Host "🔧 Applying RLS Policy Fix..." -ForegroundColor Yellow

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "❌ .env.local file not found. Please create it with your Supabase credentials." -ForegroundColor Red
    exit 1
}

# Read environment variables
Get-Content .env.local | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.*)$") {
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

# Use the Supabase REST API to execute the SQL
Write-Host "📡 Executing RLS policy fix via Supabase API..." -ForegroundColor Yellow

$sqlScript = Get-Content "fix-admin-rls-policies.sql" -Raw

$headers = @{
    "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    query = $sqlScript
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/exec_sql" -Method POST -Headers $headers -Body $body
    Write-Host "✅ RLS policies updated successfully!" -ForegroundColor Green
    Write-Host "🎯 You should now be able to update user roles in the admin panel." -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to update via API. Let's try a direct approach..." -ForegroundColor Red
    
    # Alternative: Show instructions for manual execution
    Write-Host "`n📋 Manual Fix Instructions:" -ForegroundColor Yellow
    Write-Host "1. Go to your Supabase dashboard: https://app.supabase.com" -ForegroundColor Cyan
    Write-Host "2. Navigate to your project" -ForegroundColor Cyan
    Write-Host "3. Go to SQL Editor" -ForegroundColor Cyan
    Write-Host "4. Copy and paste the contents of fix-admin-rls-policies.sql" -ForegroundColor Cyan
    Write-Host "5. Click 'Run' to execute the script" -ForegroundColor Cyan
    Write-Host "`nAlternatively, copy this command and run it if you have psql installed:" -ForegroundColor Yellow
    Write-Host "psql `"$env:DATABASE_URL`" -f fix-admin-rls-policies.sql" -ForegroundColor White
}

Write-Host "`n🔄 After applying the fix, try updating user roles in the admin panel again." -ForegroundColor Green 