#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Safe deployment script - Build locally, upload to server
.DESCRIPTION
    This script builds locally to avoid server resource issues, then uploads the built files
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

Write-ColorOutput "🔒 Starting SAFE deployment..." $Blue
Write-ColorOutput "=============================================" $Blue

try {
    # Step 1: Build locally
    Write-ColorOutput "🔨 Building locally (safer for server)..." $Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Local build failed"
    }

    # Step 2: Upload source code
    Write-ColorOutput "📤 Uploading source code..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git pull origin main"
    
    # Step 3: Upload built .next directory
    Write-ColorOutput "📦 Uploading built files..." $Yellow
    scp -r .next ${Username}@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
    
    # Step 4: Install dependencies (lightweight)
    Write-ColorOutput "📥 Installing dependencies on server..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && npm ci --only=production"
    
    # Step 5: Restart safely
    Write-ColorOutput "🔄 Restarting application..." $Yellow
    ssh ${Username}@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && pm2 restart $AppName || pm2 start npm --name $AppName -- start"
    
    Write-ColorOutput "✅ Safe deployment completed!" $Green
    Write-ColorOutput "🌐 Your application should now be live!" $Green

} catch {
    Write-ColorOutput "❌ Deployment failed: $($_.Exception.Message)" $Red
    exit 1
}

Write-ColorOutput "=============================================" $Blue
Write-ColorOutput "🎉 Safe deployment finished!" $Blue 