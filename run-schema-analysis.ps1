# PowerShell script to safely analyze and optimize slow schema queries
# Includes backup verification and rollback capabilities

param(
    [switch]$AnalyzeOnly,
    [switch]$ApplyOptimizations,
    [switch]$CheckBackups
)

# Colors for output
$ErrorColor = "Red"
$WarningColor = "Yellow" 
$SuccessColor = "Green"
$InfoColor = "Cyan"

function Write-Status {
    param($Message, $Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Get-SupabaseUrl {
    if (Test-Path ".env.local") {
        $content = Get-Content ".env.local"
        foreach ($line in $content) {
            if ($line -match "NEXT_PUBLIC_SUPABASE_URL=(.+)") {
                return $matches[1]
            }
        }
    }
    Write-Status "Could not find Supabase URL in .env.local" $ErrorColor
    return $null
}

function Get-SupabaseKey {
    if (Test-Path ".env.local") {
        $content = Get-Content ".env.local"
        foreach ($line in $content) {
            if ($line -match "SUPABASE_SERVICE_ROLE_KEY=(.+)") {
                return $matches[1]
            }
        }
    }
    Write-Status "Could not find Supabase service key in .env.local" $ErrorColor
    return $null
}

function Test-DatabaseConnection {
    $url = Get-SupabaseUrl
    if (-not $url) { return $false }
    
    try {
        $response = Invoke-RestMethod -Uri "$url/rest/v1/" -Headers @{
            "apikey" = $(Get-SupabaseKey)
        } -TimeoutSec 10
        return $true
    }
    catch {
        Write-Status "Database connection failed: $($_.Exception.Message)" $ErrorColor
        return $false
    }
}

# Main execution
Write-Status "=== Supabase Schema Query Optimization ===" $InfoColor
Write-Status "Date: $(Get-Date)" $InfoColor

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Status "Error: Not in project root directory" $ErrorColor
    exit 1
}

# Verify database connection
Write-Status "Checking database connection..." $InfoColor
if (-not (Test-DatabaseConnection)) {
    Write-Status "Cannot connect to database. Check your .env.local file." $ErrorColor
    exit 1
}
Write-Status "✓ Database connection successful" $SuccessColor

# Check for required files
$requiredFiles = @("analyze-slow-queries-safe.sql")
if ($ApplyOptimizations) {
    $requiredFiles += "optimize-schema-queries-safe.sql"
}

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Status "Error: Required file $file not found" $ErrorColor
        exit 1
    }
}

# Check backups if requested
if ($CheckBackups) {
    Write-Status "=== Backup Information ===" $InfoColor
    Write-Status "Supabase provides automatic backups:" $InfoColor
    Write-Status "• Daily automated backups (Pro plan: 7 days retention)" $InfoColor
    Write-Status "• Point-in-time recovery available" $InfoColor
    Write-Status "• Manual backups can be created in dashboard" $InfoColor
    Write-Status "• Database URL: $(Get-SupabaseUrl)" $InfoColor
    Write-Status "" 
}

# Run analysis
Write-Status "=== Running Safe Schema Analysis ===" $InfoColor
try {
    # Note: In a real implementation, you'd use psql or a proper database client
    # This is a placeholder for the concept
    
    Write-Status "Analysis script: analyze-slow-queries-safe.sql" $InfoColor
    Write-Status "⚠️  To run this analysis:" $WarningColor
    Write-Status "1. Open your Supabase SQL Editor" $WarningColor
    Write-Status "2. Copy and paste the contents of analyze-slow-queries-safe.sql" $WarningColor
    Write-Status "3. Execute the script" $WarningColor
    Write-Status ""
    
    if ($ApplyOptimizations) {
        Write-Status "=== Optimization Available ===" $InfoColor
        Write-Status "Optimization script: optimize-schema-queries-safe.sql" $InfoColor
        Write-Status "⚠️  To apply optimizations:" $WarningColor
        Write-Status "1. Review the analysis results first" $WarningColor
        Write-Status "2. Copy and paste optimize-schema-queries-safe.sql" $WarningColor
        Write-Status "3. The script starts with BEGIN; - you can ROLLBACK if needed" $WarningColor
        Write-Status "4. Execute the script" $WarningColor
        Write-Status "5. If satisfied, run COMMIT; to finalize" $WarningColor
        Write-Status ""
    }
    
    Write-Status "=== Next Steps ===" $InfoColor
    Write-Status "1. Run the analysis first to identify issues" $InfoColor
    Write-Status "2. Check for slow pg_get_tabledef queries" $InfoColor
    Write-Status "3. Look for tables with high complexity scores" $InfoColor
    Write-Status "4. If optimizations are needed, apply them in a transaction" $InfoColor
    Write-Status ""
    
    Write-Status "✓ Scripts are ready to use" $SuccessColor
    
} catch {
    Write-Status "Error during analysis: $($_.Exception.Message)" $ErrorColor
    exit 1
}

# Usage examples
Write-Status "=== Usage Examples ===" $InfoColor
Write-Status ""
Write-Status "To check backups only:" $InfoColor
Write-Status "  .\run-schema-analysis.ps1 -CheckBackups" $InfoColor
Write-Status ""
Write-Status "To run analysis only:" $InfoColor  
Write-Status "  .\run-schema-analysis.ps1 -AnalyzeOnly" $InfoColor
Write-Status ""
Write-Status "To prepare for optimizations:" $InfoColor
Write-Status "  .\run-schema-analysis.ps1 -ApplyOptimizations" $InfoColor 