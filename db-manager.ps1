# Gaming Perks Shop - Database Management Toolkit
# Comprehensive script for database operations using psql and Supabase API

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("query", "schema", "rls", "migrate", "backup", "test", "users", "help")]
    [string]$Command,
    
    [Parameter(Mandatory=$false)]
    [string]$SqlFile,
    
    [Parameter(Mandatory=$false)]
    [string]$Query,
    
    [Parameter(Mandatory=$false)]
    [switch]$Verbose
)

# Color functions
function Write-Success { param($Text) Write-Host "✅ $Text" -ForegroundColor Green }
function Write-Error { param($Text) Write-Host "❌ $Text" -ForegroundColor Red }
function Write-Info { param($Text) Write-Host "ℹ️  $Text" -ForegroundColor Cyan }
function Write-Warning { param($Text) Write-Host "⚠️  $Text" -ForegroundColor Yellow }

# Load environment variables
function Load-Environment {
    Write-Info "Loading environment variables..."
    
    if (-not (Test-Path ".env.local")) {
        Write-Error ".env.local file not found."
        return $false
    }
    
    Get-Content .env.local | ForEach-Object {
        if ($_ -match "^([^#=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
    
    if (-not $env:NEXT_PUBLIC_SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY -or -not $env:SUPABASE_DB_PASSWORD) {
        Write-Error "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD"
        return $false
    }
    
    Write-Success "Environment loaded successfully"
    return $true
}

# Check if psql is available
function Test-Psql {
    try {
        $version = & psql --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "psql available: $version"
            return $true
        }
    } catch {
        # Try adding PostgreSQL to PATH
        $pgPaths = @(
            "C:\PostgreSQL\16\bin",
            "C:\PostgreSQL\15\bin", 
            "C:\PostgreSQL\14\bin",
            "C:\Program Files\PostgreSQL\16\bin",
            "C:\Program Files\PostgreSQL\15\bin"
        )
        
        foreach ($path in $pgPaths) {
            if (Test-Path "$path\psql.exe") {
                $env:PATH += ";$path"
                Write-Success "Added PostgreSQL to PATH: $path"
                $version = & psql --version 2>&1
                Write-Success "psql available: $version"
                return $true
            }
        }
    }
    
    Write-Warning "psql not found. Using Supabase API fallback."
    return $false
}

# Execute SQL via psql
function Invoke-Psql {
    param([string]$SqlContent)
    
    $connString = "postgresql://postgres:$env:SUPABASE_DB_PASSWORD@db.nkinpmqnbcjaftqduujf.supabase.co:5432/postgres"
    
    $tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
    $SqlContent | Out-File -FilePath $tempFile -Encoding UTF8
    
    try {
        $result = & psql $connString -f $tempFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "SQL executed successfully via psql"
            if ($Verbose) { Write-Host $result }
            return $true
        } else {
            Write-Error "psql execution failed: $result"
            return $false
        }
    } finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }
}

# Execute SQL via Supabase API
function Invoke-SupabaseApi {
    param([string]$SqlContent)
    
    $headers = @{
        "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY
        "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
        "Content-Type" = "application/json"
    }
    
    $body = @{ query = $SqlContent } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/query" -Method POST -Headers $headers -Body $body
        Write-Success "SQL executed successfully via API"
        if ($Verbose) { Write-Host ($response | ConvertTo-Json -Depth 10) }
        return $true
    } catch {
        Write-Error "API execution failed: $($_.Exception.Message)"
        return $false
    }
}

# Execute SQL with fallback
function Invoke-Sql {
    param([string]$SqlContent)
    
    if ($SqlContent.Trim() -eq "") {
        Write-Error "No SQL content provided"
        return $false
    }
    
    Write-Info "Executing SQL..."
    if ($Verbose) { Write-Host "SQL Content:`n$SqlContent`n" -ForegroundColor Gray }
    
    if (Test-Psql) {
        return Invoke-Psql $SqlContent
    } else {
        return Invoke-SupabaseApi $SqlContent
    }
}

# Main command handlers
function Handle-Query {
    if ($Query) {
        return Invoke-Sql $Query
    } elseif ($SqlFile) {
        if (-not (Test-Path $SqlFile)) {
            Write-Error "SQL file not found: $SqlFile"
            return $false
        }
        $content = Get-Content $SqlFile -Raw
        return Invoke-Sql $content
    } else {
        Write-Error "Please provide either -Query or -SqlFile parameter"
        return $false
    }
}

function Handle-Schema {
    Write-Info "Analyzing database schema..."
    
    $schemaQuery = @"
-- Table information
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Column information for key tables
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('profiles', 'squads', 'squad_members', 'matches', 'donations')
ORDER BY table_name, ordinal_position;
"@
    
    return Invoke-Sql $schemaQuery
}

function Handle-RLS {
    Write-Info "Checking RLS policies..."
    
    $rlsQuery = @"
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
"@
    
    return Invoke-Sql $rlsQuery
}

function Handle-Users {
    Write-Info "Checking online users functionality..."
    
    $usersQuery = @"
-- Test online users query
SELECT 
    p.id,
    p.in_game_alias,
    p.email,
    p.last_seen,
    p.avatar_url,
    sm.role,
    s.name as squad_name,
    s.tag as squad_tag
FROM profiles p
LEFT JOIN squad_members sm ON p.id = sm.user_id AND sm.status = 'active'
LEFT JOIN squads s ON sm.squad_id = s.id
WHERE p.last_seen > (NOW() - INTERVAL '1 hour')
ORDER BY p.last_seen DESC
LIMIT 10;

-- Count statistics
SELECT 
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN last_seen > (NOW() - INTERVAL '5 minutes') THEN 1 END) as very_recent,
    COUNT(CASE WHEN last_seen > (NOW() - INTERVAL '1 hour') THEN 1 END) as recent,
    COUNT(CASE WHEN last_seen > (NOW() - INTERVAL '1 day') THEN 1 END) as today
FROM profiles;
"@
    
    return Invoke-Sql $usersQuery
}

function Handle-Test {
    Write-Info "Running database connectivity tests..."
    
    $testQueries = @(
        "SELECT NOW() as current_time;",
        "SELECT COUNT(*) as profile_count FROM profiles;",
        "SELECT COUNT(*) as squad_count FROM squads;",
        "SELECT version() as postgres_version;"
    )
    
    $allPassed = $true
    foreach ($query in $testQueries) {
        Write-Info "Testing: $($query.Split(' ')[1])"
        if (-not (Invoke-Sql $query)) {
            $allPassed = $false
        }
    }
    
    if ($allPassed) {
        Write-Success "All database tests passed!"
    } else {
        Write-Error "Some database tests failed."
    }
    
    return $allPassed
}

function Show-Help {
    Write-Host @"
🎮 Gaming Perks Shop - Database Management Toolkit

USAGE:
    .\db-manager.ps1 -Command <command> [options]

COMMANDS:
    query       Execute custom SQL query or file
    schema      Analyze database schema
    rls         Check RLS policies  
    migrate     Apply migration file
    users       Test online users functionality
    test        Run connectivity tests
    help        Show this help

OPTIONS:
    -SqlFile    Path to SQL file to execute
    -Query      SQL query string to execute
    -Verbose    Show detailed output

EXAMPLES:
    .\db-manager.ps1 -Command query -Query "SELECT COUNT(*) FROM profiles;"
    .\db-manager.ps1 -Command query -SqlFile "fix-rls-simple.sql"
    .\db-manager.ps1 -Command schema -Verbose
    .\db-manager.ps1 -Command users
    .\db-manager.ps1 -Command test

DATABASE ACCESS:
    - Automatically detects and uses psql if available
    - Falls back to Supabase REST API if psql not found
    - Requires .env.local with proper credentials

"@ -ForegroundColor Cyan
}

# Main execution
function Main {
    Write-Host "🎮 Gaming Perks Shop - Database Manager" -ForegroundColor Magenta
    Write-Host "=====================================`n" -ForegroundColor Magenta
    
    if (-not (Load-Environment)) {
        exit 1
    }
    
    switch ($Command) {
        "query" { $success = Handle-Query }
        "schema" { $success = Handle-Schema }
        "rls" { $success = Handle-RLS }
        "migrate" { $success = Handle-Query }  # Same as query but clearer intent
        "users" { $success = Handle-Users }
        "test" { $success = Handle-Test }
        "help" { Show-Help; $success = $true }
        default { Write-Error "Unknown command: $Command"; Show-Help; $success = $false }
    }
    
    if ($success) {
        Write-Success "Command completed successfully!"
        exit 0
    } else {
        Write-Error "Command failed!"
        exit 1
    }
}

# Run main function
Main 