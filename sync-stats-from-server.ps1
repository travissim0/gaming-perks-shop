#!/usr/bin/env pwsh

# PowerShell script to sync CSV stats from Linux server and import them
# Usage: .\sync-stats-from-server.ps1

param(
    [string]$ServerHost = "linux-1.freeinfantry.com",
    [string]$ServerUser = "root",
    [string]$RemotePath = "/root/Infantry/Zones/CTF\ -\ Twin\ Peaks\ 2.0/playerStats",
    [string]$LocalPath = "./imported-stats",
    [switch]$DryRun = $false,
    [switch]$ImportOnly = $false
)

Write-Host "🚀 Gaming Perks Shop - Stats Import Tool" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check if required tools are available
function Test-Dependencies {
    Write-Host "🔍 Checking dependencies..." -ForegroundColor Yellow
    
    # Check for scp
    try {
        $null = Get-Command scp -ErrorAction Stop
        Write-Host "✅ scp found" -ForegroundColor Green
    } catch {
        Write-Host "❌ scp not found. Please install OpenSSH client." -ForegroundColor Red
        exit 1
    }
    
    # Check for Node.js
    try {
        $null = Get-Command node -ErrorAction Stop
        Write-Host "✅ Node.js found" -ForegroundColor Green
    } catch {
        Write-Host "❌ Node.js not found. Please install Node.js." -ForegroundColor Red
        exit 1
    }
    
    # Check for npm packages
    if (-not (Test-Path "node_modules/csv-parser")) {
        Write-Host "📦 Installing required npm packages..." -ForegroundColor Yellow
        npm install csv-parser @supabase/supabase-js
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to install npm packages" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "✅ All dependencies satisfied" -ForegroundColor Green
}

# Sync CSV files from server
function Sync-StatsFromServer {
    Write-Host "📥 Syncing CSV files from server..." -ForegroundColor Yellow
    Write-Host "   Server: $ServerUser@$ServerHost" -ForegroundColor Gray
    Write-Host "   Remote: $RemotePath" -ForegroundColor Gray
    Write-Host "   Local:  $LocalPath" -ForegroundColor Gray
    
    # Create local directory if it doesn't exist
    if (-not (Test-Path $LocalPath)) {
        New-Item -ItemType Directory -Path $LocalPath -Force | Out-Null
        Write-Host "📁 Created local directory: $LocalPath" -ForegroundColor Green
    }
    
    # Build scp command to sync only OvD CSV files
    $scpCommand = "scp"
    $scpArgs = @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "$ServerUser@${ServerHost}:$RemotePath/*ovd*.csv",
        $LocalPath
    )
    
    if ($DryRun) {
        Write-Host "🔍 DRY RUN - Would execute:" -ForegroundColor Magenta
        Write-Host "   $scpCommand $($scpArgs -join ' ')" -ForegroundColor Gray
        return $true
    }
    
    Write-Host "🔄 Executing: scp $($scpArgs -join ' ')" -ForegroundColor Gray
    
    try {
        & $scpCommand @scpArgs
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Files synced successfully" -ForegroundColor Green
            
            # List synced files
            $csvFiles = Get-ChildItem -Path $LocalPath -Filter "*ovd*.csv"
            if ($csvFiles.Count -gt 0) {
                Write-Host "📋 Synced files:" -ForegroundColor Green
                foreach ($file in $csvFiles) {
                    $size = [math]::Round($file.Length / 1KB, 2)
                    Write-Host "   - $($file.Name) (${size} KB)" -ForegroundColor Gray
                }
            } else {
                Write-Host "⚠️  No OvD CSV files found after sync" -ForegroundColor Yellow
            }
            return $true
        } else {
            Write-Host "❌ scp failed with exit code: $LASTEXITCODE" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Error during sync: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Run the import process
function Start-Import {
    Write-Host "🔄 Starting import process..." -ForegroundColor Yellow
    
    if (-not (Test-Path "import-player-stats-csv.js")) {
        Write-Host "❌ Import script not found: import-player-stats-csv.js" -ForegroundColor Red
        Write-Host "   Please ensure the import script is in the current directory." -ForegroundColor Gray
        return $false
    }
    
    if ($DryRun) {
        Write-Host "🔍 DRY RUN - Would execute:" -ForegroundColor Magenta
        Write-Host "   node import-player-stats-csv.js" -ForegroundColor Gray
        return $true
    }
    
    try {
        Write-Host "🚀 Executing: node import-player-stats-csv.js" -ForegroundColor Gray
        node import-player-stats-csv.js
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Import completed successfully" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Import failed with exit code: $LASTEXITCODE" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Error during import: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Main execution
function Main {
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "🔍 DRY RUN MODE - No actual changes will be made" -ForegroundColor Magenta
        Write-Host ""
    }
    
    # Test dependencies
    Test-Dependencies
    Write-Host ""
    
    # Sync files (unless import-only mode)
    if (-not $ImportOnly) {
        $syncSuccess = Sync-StatsFromServer
        if (-not $syncSuccess -and -not $DryRun) {
            Write-Host "❌ Sync failed. Aborting." -ForegroundColor Red
            exit 1
        }
        Write-Host ""
    } else {
        Write-Host "⏭️  Skipping sync (import-only mode)" -ForegroundColor Yellow
        Write-Host ""
    }
    
    # Run import
    $importSuccess = Start-Import
    if (-not $importSuccess -and -not $DryRun) {
        Write-Host "❌ Import failed." -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    if (-not $DryRun) {
        Write-Host "🎉 Process completed successfully!" -ForegroundColor Green
        Write-Host "🌐 Check your website to see the imported stats." -ForegroundColor Cyan
    } else {
        Write-Host "🔍 Dry run completed. Use without -DryRun to execute." -ForegroundColor Magenta
    }
}

# Show help
function Show-Help {
    Write-Host "Gaming Perks Shop - Stats Import Tool" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\sync-stats-from-server.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -ServerHost <host>     Server hostname (default: linux-1.freeinfantry.com)"
    Write-Host "  -ServerUser <user>     SSH username (default: root)"
    Write-Host "  -RemotePath <path>     Remote directory path"
    Write-Host "  -LocalPath <path>      Local directory path (default: ./imported-stats)"
    Write-Host "  -DryRun               Show what would be done without executing"
    Write-Host "  -ImportOnly           Skip sync, only run import on existing files"
    Write-Host "  -Help                 Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  .\sync-stats-from-server.ps1                    # Full sync and import"
    Write-Host "  .\sync-stats-from-server.ps1 -DryRun           # Preview what would happen"
    Write-Host "  .\sync-stats-from-server.ps1 -ImportOnly       # Only import existing files"
    Write-Host ""
}

# Handle help parameter
if ($args -contains "-Help" -or $args -contains "--help" -or $args -contains "-h") {
    Show-Help
    exit 0
}

# Run main function
Main 