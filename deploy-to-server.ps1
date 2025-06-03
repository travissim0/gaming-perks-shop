#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Deploy Gaming Perks Shop to DigitalOcean server
.DESCRIPTION
    This script connects to the DigitalOcean server via SSH and runs the deployment commands:
    - Pull latest changes from git
    - Install dependencies
    - Build the application  
    - Restart PM2 process
.PARAMETER Username
    SSH username (default: root)
.PARAMETER AppName
    PM2 application name (default: gaming-perks-shop)
.EXAMPLE
    .\deploy-to-server.ps1
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

Write-ColorOutput "🚀 Starting deployment to linux-1.freeinfantry.com..." $Blue
Write-ColorOutput "=============================================" $Blue

# SSH commands to run on the server
$deployCommands = @(
    "cd /var/www/gaming-perks-shop",
    "echo '📥 Pulling latest changes...'",
    "git pull origin main",
    "echo '📦 Installing dependencies...'", 
    "npm install",
    "echo '🔨 Building application with increased memory...'",
    "export NODE_OPTIONS='--max-old-space-size=2048'",
    "npm run build",
    "echo '🔄 Restarting PM2 process...'",
    "pm2 restart $AppName",
    "echo '✅ Deployment completed successfully!'"
)

# Join commands with && and wrap in quotes for SSH
$commandString = ($deployCommands -join " && ")

try {
    Write-ColorOutput "🔗 Connecting to server linux-1.freeinfantry.com..." $Yellow
    
    # Execute the deployment commands via SSH
    ssh ${Username}@linux-1.freeinfantry.com $commandString
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✅ Deployment completed successfully!" $Green
        Write-ColorOutput "🌐 Your application should now be live!" $Green
    } else {
        Write-ColorOutput "❌ Deployment failed with exit code: $LASTEXITCODE" $Red
        exit 1
    }
} catch {
    Write-ColorOutput "❌ Error during deployment: $($_.Exception.Message)" $Red
    exit 1
}

Write-ColorOutput "=============================================" $Blue
Write-ColorOutput "🎉 Deployment process finished!" $Blue 