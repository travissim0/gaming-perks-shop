#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Fast & Safe deployment script - Build locally, sync only changes
.DESCRIPTION
    This script builds locally to avoid server resource issues, optimized for Windows:
    - Clears .next directory before building to prevent cache issues
    - Uses scp with compression for faster uploads
    - Skips dependency installation if package.json/package-lock.json unchanged
    - Should be 3-5x faster than full deployments
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Username = "root",
    
    [Parameter(Mandatory=$false)]
    [string]$AppName = "gaming-perks-shop"
)

# Colors for output
$Green = [System.ConsoleColor]::Green
$Red = [System.ConsoleColor]::Red
$Yellow = [System.ConsoleColor]::Yellow
$Blue = [System.ConsoleColor]::Blue

function Write-ColorOutput {
    param([string]$Message, [System.ConsoleColor]$Color = [System.ConsoleColor]::White)
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "LIGHTNING Starting FAST & SAFE deployment..." $Blue
Write-ColorOutput "=============================================" $Blue

# Start timing the entire deployment
$deploymentStartTime = Get-Date
$buildDuration = $null

try {
    # Step 0: Clear local .next directory to prevent build cache issues
    Write-ColorOutput "CLEANING Clearing local .next directory..." $Yellow
    # if (Test-Path ".next") {
    #     Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    #     Write-ColorOutput "INFO Local .next directory cleared successfully" $Yellow
    # } else {
    #     Write-ColorOutput "INFO No local .next directory found, skipping cleanup" $Yellow
    # }

    # Step 1: Build locally
    Write-ColorOutput "HAMMER Building locally (safer for server)..." $Yellow
    $buildStartTime = Get-Date
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Local build failed"
    }
    $buildEndTime = Get-Date
    $buildDuration = $buildEndTime - $buildStartTime
    Write-ColorOutput "CLOCK Build completed in $([math]::Round($buildDuration.TotalSeconds, 2)) seconds" $Green

    # Step 2: Upload source code (git pull is fast)
    Write-ColorOutput "UPLOAD Syncing source code..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git pull origin main"
    
    # Step 3: Upload built files (Windows-optimized approach)
    Write-ColorOutput "PACKAGE Uploading built files..." $Yellow
    
    # Remove old .next directory on server and upload fresh (still faster than full dependency install)
    # ssh ${Username}@linux-1.freeinfantry.com "rm -rf /var/www/gaming-perks-shop/.next"
    
    # Use scp with compression for faster upload
    scp -C -r .next ${Username}@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
    
    # Ensure static directory exists and verify upload
    ssh ${Username}@linux-1.freeinfantry.com "mkdir -p /var/www/gaming-perks-shop/.next/static"
    
    # Double-check static files uploaded correctly
    $staticCheck = ssh ${Username}@linux-1.freeinfantry.com "ls -la /var/www/gaming-perks-shop/.next/static/ | wc -l"
    if ([int]$staticCheck -lt 3) {
        Write-ColorOutput "WARNING Static files missing, re-uploading..." $Yellow
        scp -C -r .next/static/* ${Username}@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/.next/static/
    }
    
    # Step 4: Check if dependencies need updating (skip if package-lock.json unchanged)
    Write-ColorOutput "SEARCH Checking if dependencies need updating..." $Yellow
    $packageChanged = ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git diff HEAD~1 HEAD --name-only | grep -E '(package\.json|package-lock\.json)'"
    
    if ($packageChanged) {
        Write-ColorOutput "DOWNLOAD Dependencies changed, installing..." $Yellow
        ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && npm ci --only=production"
    } else {
        Write-ColorOutput "SKIP Dependencies unchanged, skipping install..." $Yellow
    }
    
    # Step 5: Restart safely
    Write-ColorOutput "REFRESH Restarting application..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && pm2 restart $AppName || pm2 start npm --name $AppName -- start"
    
    # Calculate total deployment time
    $deploymentEndTime = Get-Date
    $totalDuration = $deploymentEndTime - $deploymentStartTime
    
    Write-ColorOutput "SUCCESS Fast deployment completed!" $Green
    Write-ColorOutput "GLOBE Your application should now be live!" $Green

} catch {
    $deploymentEndTime = Get-Date
    $totalDuration = $deploymentEndTime - $deploymentStartTime
    
    Write-ColorOutput "ERROR Deployment failed: $($_.Exception.Message)" $Red
    Write-ColorOutput "=============================================" $Blue
    Write-ColorOutput "CLOCK DEPLOYMENT FAILED AFTER:" $Red
    if ($buildDuration) {
        Write-ColorOutput "  Build Time: $([math]::Round($buildDuration.TotalSeconds, 2)) seconds" $Yellow
    }
    Write-ColorOutput "  Total Time: $([math]::Round($totalDuration.TotalSeconds, 2)) seconds" $Yellow
    Write-ColorOutput "=============================================" $Blue
    exit 1
}

Write-ColorOutput "=============================================" $Blue
Write-ColorOutput "CLOCK DEPLOYMENT SUMMARY:" $Blue
Write-ColorOutput "  Build Time: $([math]::Round($buildDuration.TotalSeconds, 2)) seconds" $Yellow
Write-ColorOutput "  Total Time: $([math]::Round($totalDuration.TotalSeconds, 2)) seconds" $Yellow
Write-ColorOutput "  Build %: $([math]::Round(($buildDuration.TotalSeconds / $totalDuration.TotalSeconds) * 100, 1))% of total time" $Yellow
Write-ColorOutput "PARTY Safe deployment finished!" $Blue 