#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Fast & Safe deployment script - Build locally, sync only changes
.DESCRIPTION
    This script builds locally to avoid server resource issues, optimized for Windows:
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

Write-ColorOutput "⚡ Starting FAST & SAFE deployment..." $Blue
Write-ColorOutput "=============================================" $Blue

try {
    # Step 1: Build locally
    Write-ColorOutput "🔨 Building locally (safer for server)..." $Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Local build failed"
    }

    # Step 2: Upload source code (git pull is fast)
    Write-ColorOutput "📤 Syncing source code..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git pull origin main"
    
    # Step 3: Upload built files (Windows-optimized approach)
    Write-ColorOutput "📦 Uploading built files..." $Yellow
    
    # Remove old .next directory on server and upload fresh (still faster than full dependency install)
    ssh ${Username}@linux-1.freeinfantry.com "rm -rf /var/www/gaming-perks-shop/.next"
    
    # Use scp with compression for faster upload
    scp -C -r .next ${Username}@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
    
    # Step 4: Check if dependencies need updating (skip if package-lock.json unchanged)
    Write-ColorOutput "🔍 Checking if dependencies need updating..." $Yellow
    $packageChanged = ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git diff HEAD~1 HEAD --name-only | grep -E '(package\.json|package-lock\.json)'"
    
    if ($packageChanged) {
        Write-ColorOutput "📥 Dependencies changed, installing..." $Yellow
        ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && npm ci --only=production"
    } else {
        Write-ColorOutput "⏭️  Dependencies unchanged, skipping install..." $Yellow
    }
    
    # Step 5: Restart safely
    Write-ColorOutput "🔄 Restarting application..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && pm2 restart $AppName || pm2 start npm --name $AppName -- start"
    
    Write-ColorOutput "✅ Fast deployment completed!" $Green
    Write-ColorOutput "🌐 Your application should now be live!" $Green

} catch {
    Write-ColorOutput "❌ Deployment failed: $($_.Exception.Message)" $Red
    exit 1
}

Write-ColorOutput "=============================================" $Blue
Write-ColorOutput "🎉 Safe deployment finished!" $Blue 