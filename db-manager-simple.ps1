# Gaming Perks Shop - Simple Database Manager
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "users", "schema", "help")]
    [string]$Command
)

# Load environment
Write-Host "🎮 Gaming Perks Shop - Database Manager" -ForegroundColor Magenta

if (-not (Test-Path ".env.local")) {
    Write-Host "❌ .env.local file not found." -ForegroundColor Red
    exit 1
}

Get-Content .env.local | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "env:$name" -Value $value
    }
}

$headers = @{
    "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

switch ($Command) {
    "test" {
        Write-Host "🧪 Testing database connectivity..." -ForegroundColor Cyan
        
        $testQuery = "SELECT NOW() as current_time, COUNT(*) as profile_count FROM profiles;"
        $body = @{ query = $testQuery } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/query" -Method POST -Headers $headers -Body $body
            Write-Host "✅ Database test passed!" -ForegroundColor Green
            Write-Host $response
        } catch {
            Write-Host "❌ Database test failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    "users" {
        Write-Host "👥 Testing online users functionality..." -ForegroundColor Cyan
        
        $usersQuery = @"
SELECT 
    p.id,
    p.in_game_alias,
    p.last_seen,
    sm.role,
    s.name as squad_name
FROM profiles p
LEFT JOIN squad_members sm ON p.id = sm.user_id
LEFT JOIN squads s ON sm.squad_id = s.id
WHERE p.last_seen > (NOW() - INTERVAL '1 hour')
ORDER BY p.last_seen DESC
LIMIT 5;
"@
        
        $body = @{ query = $usersQuery } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/query" -Method POST -Headers $headers -Body $body
            Write-Host "✅ Online users query successful!" -ForegroundColor Green
            Write-Host ($response | ConvertTo-Json -Depth 3)
        } catch {
            Write-Host "❌ Online users query failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    "schema" {
        Write-Host "📋 Checking table structure..." -ForegroundColor Cyan
        
        $schemaQuery = @"
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;
"@
        
        $body = @{ query = $schemaQuery } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/query" -Method POST -Headers $headers -Body $body
            Write-Host "✅ Schema query successful!" -ForegroundColor Green
            Write-Host ($response | ConvertTo-Json -Depth 3)
        } catch {
            Write-Host "❌ Schema query failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    "help" {
        Write-Host @"
USAGE: .\db-manager-simple.ps1 -Command <command>

COMMANDS:
  test     - Test basic database connectivity
  users    - Test online users functionality  
  schema   - Check profiles table structure
  help     - Show this help
"@ -ForegroundColor Cyan
    }
} 