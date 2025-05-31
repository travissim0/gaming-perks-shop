#!/usr/bin/env pwsh

# Apply CTF Roles System (Fixed Version)
# Adds comprehensive role hierarchy for CTF operations management

param(
    [string]$SupabaseUrl = $null,
    [string]$SupabaseKey = $null,
    [switch]$DryRun = $false
)

# Colors for output
$Red = [System.ConsoleColor]::Red
$Green = [System.ConsoleColor]::Green
$Yellow = [System.ConsoleColor]::Yellow
$Blue = [System.ConsoleColor]::Blue
$White = [System.ConsoleColor]::White

function Write-ColorOutput {
    param(
        [string]$Message,
        [System.ConsoleColor]$Color = $White
    )
    Write-Host $Message -ForegroundColor $Color
}

function Read-EnvFile {
    param([string]$FilePath)
    
    if (Test-Path $FilePath) {
        $envVars = @{}
        Get-Content $FilePath | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]*)\s*=\s*(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                    $value = $matches[1]
                }
                $envVars[$key] = $value
            }
        }
        return $envVars
    }
    return @{}
}

function Test-PostgreSQLConnection {
    param([string]$ConnectionString)
    
    try {
        $connection = New-Object Npgsql.NpgsqlConnection($ConnectionString)
        $connection.Open()
        $connection.Close()
        return $true
    }
    catch {
        return $false
    }
}

# Header
Write-ColorOutput "=== CTF Role Hierarchy System Deployment (Fixed) ===" $Blue
Write-ColorOutput "Adding comprehensive role management for CTF operations" $White
Write-ColorOutput "This version fixes enum creation and table dependency issues" $Yellow
Write-ColorOutput ""

# Check for required modules
Write-ColorOutput "Checking PowerShell modules..." $Yellow
if (!(Get-Module -ListAvailable -Name "Npgsql")) {
    Write-ColorOutput "Installing Npgsql module..." $Yellow
    try {
        Install-Module -Name Npgsql -Force -Scope CurrentUser -AllowClobber
        Write-ColorOutput "✓ Npgsql module installed" $Green
    }
    catch {
        Write-ColorOutput "✗ Failed to install Npgsql module: $($_.Exception.Message)" $Red
        Write-ColorOutput "Trying alternative installation method..." $Yellow
        try {
            # Try using NuGet directly
            Register-PackageSource -Name "NuGet" -Location "https://www.nuget.org/api/v2" -ProviderName NuGet -Force
            Install-Package -Name Npgsql -Source NuGet -Force -Scope CurrentUser
            Write-ColorOutput "✓ Npgsql package installed via NuGet" $Green
        }
        catch {
            Write-ColorOutput "✗ Failed to install Npgsql. Please install manually." $Red
            Write-ColorOutput "Run: Install-Module -Name Npgsql -Force -Scope CurrentUser" $Yellow
            exit 1
        }
    }
}

# Load environment variables
Write-ColorOutput "Loading Supabase credentials..." $Yellow

# First try parameters, then environment variables, then .env.local file
if (-not $SupabaseUrl) {
    $SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
}
if (-not $SupabaseKey) {
    $SupabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY
}

# If still not found, try reading from .env.local
if ((-not $SupabaseUrl -or -not $SupabaseKey) -and (Test-Path ".env.local")) {
    Write-ColorOutput "Reading credentials from .env.local file..." $Yellow
    $envVars = Read-EnvFile ".env.local"
    
    if (-not $SupabaseUrl) {
        $SupabaseUrl = $envVars["NEXT_PUBLIC_SUPABASE_URL"]
    }
    if (-not $SupabaseKey) {
        $SupabaseKey = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
    }
}

# Validate required parameters
if (-not $SupabaseUrl -or -not $SupabaseKey) {
    Write-ColorOutput "✗ Missing required Supabase credentials" $Red
    Write-ColorOutput "Please ensure your .env.local file contains:" $Yellow
    Write-ColorOutput "  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url" $White
    Write-ColorOutput "  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key" $White
    Write-ColorOutput "" $White
    Write-ColorOutput "Or provide them as parameters:" $Yellow
    Write-ColorOutput "  ./apply-ctf-roles-fixed.ps1 -SupabaseUrl 'url' -SupabaseKey 'key'" $White
    exit 1
}

Write-ColorOutput "✓ Supabase credentials loaded" $Green

# Extract database connection details from Supabase URL
$uri = [System.Uri]$SupabaseUrl
$dbHost = $uri.Host
$database = "postgres"

# Construct connection string
$connectionString = "Host=$dbHost;Database=$database;Username=postgres;Password=$SupabaseKey;SSL Mode=Require;Trust Server Certificate=true"

Write-ColorOutput "Database Configuration:" $Blue
Write-ColorOutput "Host: $dbHost" $White
Write-ColorOutput "Database: $database" $White
Write-ColorOutput ""

# Test connection
Write-ColorOutput "Testing database connection..." $Yellow
if (-not (Test-PostgreSQLConnection $connectionString)) {
    Write-ColorOutput "✗ Failed to connect to database" $Red
    Write-ColorOutput "Please check your credentials and network connection" $Yellow
    exit 1
}
Write-ColorOutput "✓ Database connection successful" $Green
Write-ColorOutput ""

# Read SQL file (use fixed version)
$sqlFile = "add-ctf-roles-system-fixed.sql"
if (-not (Test-Path $sqlFile)) {
    Write-ColorOutput "✗ SQL file not found: $sqlFile" $Red
    Write-ColorOutput "Please ensure the fixed SQL file exists in the current directory" $Yellow
    exit 1
}

$sqlContent = Get-Content $sqlFile -Raw
Write-ColorOutput "✓ SQL file loaded: $sqlFile" $Green
Write-ColorOutput "File size: $([math]::Round((Get-Item $sqlFile).Length / 1KB, 2)) KB" $White
Write-ColorOutput ""

# Dry run check
if ($DryRun) {
    Write-ColorOutput "=== DRY RUN MODE ===" $Yellow
    Write-ColorOutput "The following SQL would be executed:" $Yellow
    Write-ColorOutput ""
    Write-ColorOutput $sqlContent $White
    Write-ColorOutput ""
    Write-ColorOutput "=== END DRY RUN ===" $Yellow
    exit 0
}

# Show what will be fixed
Write-ColorOutput "This fixed version addresses:" $Blue
Write-ColorOutput "• Safely recreates the ctf_role_type enum" $White
Write-ColorOutput "• Drops and recreates tables in correct order" $White
Write-ColorOutput "• Uses transactions for atomic operations" $White
Write-ColorOutput "• Adds safer foreign key constraint handling" $White
Write-ColorOutput "• Includes comprehensive error handling" $White
Write-ColorOutput "• Fixed reserved keyword conflict (current_role -> user_current_role)" $White
Write-ColorOutput ""

# Confirm execution
Write-ColorOutput "This will add the CTF role hierarchy system to your database." $Yellow
Write-ColorOutput "WARNING: This will drop existing CTF role tables if they exist!" $Red
Write-ColorOutput ""

$confirm = Read-Host "Do you want to proceed? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-ColorOutput "Operation cancelled by user" $Yellow
    exit 0
}

Write-ColorOutput ""
Write-ColorOutput "Applying CTF roles system (fixed version)..." $Blue

try {
    # Execute SQL
    $connection = New-Object Npgsql.NpgsqlConnection($connectionString)
    $connection.Open()
    
    $command = $connection.CreateCommand()
    $command.CommandText = $sqlContent
    $command.CommandTimeout = 180  # 3 minutes timeout for safe operations
    
    Write-ColorOutput "Executing SQL commands..." $Yellow
    Write-ColorOutput "This may take a moment due to transaction safety..." $White
    $result = $command.ExecuteNonQuery()
    
    $connection.Close()
    
    Write-ColorOutput "✓ CTF roles system applied successfully" $Green
    Write-ColorOutput ""
    
    # Verify installation
    Write-ColorOutput "Verifying installation..." $Yellow
    
    $connection.Open()
    $verifyCommand = $connection.CreateCommand()
    
    # Check if enum was created
    $verifyCommand.CommandText = @"
        SELECT COUNT(*) as enum_count
        FROM pg_type 
        WHERE typname = 'ctf_role_type';
"@
    
    $enumCount = $verifyCommand.ExecuteScalar()
    
    # Check if tables were created
    $verifyCommand.CommandText = @"
        SELECT COUNT(*) as role_count
        FROM ctf_roles;
"@
    
    $roleCount = $verifyCommand.ExecuteScalar()
    
    $verifyCommand.CommandText = @"
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('ctf_roles', 'user_ctf_roles', 'referee_applications', 'match_commentators', 'match_results')
        ORDER BY table_name;
"@
    
    $reader = $verifyCommand.ExecuteReader()
    $tables = @()
    while ($reader.Read()) {
        $tables += $reader["table_name"]
    }
    $reader.Close()
    $connection.Close()
    
    Write-ColorOutput "✓ Installation verified:" $Green
    Write-ColorOutput "  - $enumCount ctf_role_type enum created" $White
    Write-ColorOutput "  - $roleCount CTF roles configured" $White
    Write-ColorOutput "  - $($tables.Count) new tables created: $($tables -join ', ')" $White
    Write-ColorOutput ""
    
    # Show role hierarchy
    Write-ColorOutput "CTF Role Hierarchy (highest to lowest):" $Blue
    Write-ColorOutput "  1. Site Administrator (level 100) - Full system access" $White
    Write-ColorOutput "  2. CTF Administrator (level 90) - Manages all CTF operations" $White
    Write-ColorOutput "  3. CTF Head Referee (level 80) - Manages referees and applications" $White
    Write-ColorOutput "  4. CTF Referee (level 70) - Manages match results" $White
    Write-ColorOutput "  5. CTF Recorder (level 60) - Manages match videos" $White
    Write-ColorOutput "  6. CTF Commentator (level 50) - Can sign up for commentary" $White
    Write-ColorOutput ""
    
    Write-ColorOutput "Next Steps:" $Blue
    Write-ColorOutput "1. Refresh your web application to clear console errors" $White
    Write-ColorOutput "2. Assign CTF roles to users through the admin interface" $White
    Write-ColorOutput "3. Configure referee application process" $White
    Write-ColorOutput "4. Set up match video recording workflows" $White
    Write-ColorOutput ""
    
    Write-ColorOutput "🎮 CTF roles system is now ready!" $Green
    
}
catch {
    Write-ColorOutput "✗ Error applying CTF roles system:" $Red
    Write-ColorOutput $_.Exception.Message $Red
    
    if ($_.Exception.InnerException) {
        Write-ColorOutput "Inner exception: $($_.Exception.InnerException.Message)" $Red
    }
    
    Write-ColorOutput ""
    Write-ColorOutput "Troubleshooting tips:" $Yellow
    Write-ColorOutput "• Check if you have sufficient database permissions" $White
    Write-ColorOutput "• Verify your Supabase service role key is correct" $White
    Write-ColorOutput "• The script uses transactions, so no partial changes should remain" $White
    Write-ColorOutput "• Check database connection stability" $White
    Write-ColorOutput "• Try running with -DryRun first to see what would be executed" $White
    
    exit 1
} 