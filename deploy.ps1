#!/usr/bin/env pwsh
# Comprehensive Gaming Perks Shop Deployment Script
# Usage: .\deploy.ps1 "Your commit message"

param(
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$LocalOnly
)

# Colors for output
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Blue = "`e[34m"
$Reset = "`e[0m"

function Write-Step {
    param([string]$Message)
    Write-Host "${Blue}🚀 $Message${Reset}"
}

function Write-Success {
    param([string]$Message)
    Write-Host "${Green}✅ $Message${Reset}"
}

function Write-Warning {
    param([string]$Message)
    Write-Host "${Yellow}⚠️  $Message${Reset}"
}

function Write-Error {
    param([string]$Message)
    Write-Host "${Red}❌ $Message${Reset}"
}

# Main deployment process
try {
    Write-Host "${Blue}🎮 Gaming Perks Shop Deployment Script${Reset}"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Step 1: Check git status
    Write-Step "Checking git status..."
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Host "Modified files:"
        $gitStatus | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Warning "No changes detected. Continuing anyway..."
    }
    
    # Step 2: Add all changes
    Write-Step "Adding all changes to git..."
    git add .
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Changes added successfully"
    } else {
        throw "Failed to add changes to git"
    }
    
    # Step 3: Commit changes
    Write-Step "Committing changes..."
    git commit -m $CommitMessage
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Changes committed successfully"
    } else {
        Write-Warning "Nothing to commit or commit failed"
    }
    
    # Step 4: Push to GitHub
    Write-Step "Pushing to GitHub..."
    git push origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Changes pushed to GitHub successfully"
    } else {
        throw "Failed to push to GitHub"
    }
    
    # Step 5: Local build test (optional)
    if (-not $SkipBuild) {
        Write-Step "Running local build test..."
        npm run build
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Local build completed successfully"
        } else {
            Write-Error "Local build failed - but continuing with deployment"
        }
    }
    
    # Step 6: Deploy to server (if not local only)
    if (-not $LocalOnly) {
        Write-Step "Deploying to production server..."
        Write-Host "${Yellow}📡 Connecting to DigitalOcean server...${Reset}"
        
        # Create the server deployment commands
        $serverCommands = @(
            "cd /var/www/gaming-perks-shop",
            "git pull origin main",
            "npm install",
            "npm run build",
            "pm2 restart gaming-perks-shop"
        )
        
        Write-Host "${Blue}Server commands to run:${Reset}"
        $serverCommands | ForEach-Object { Write-Host "  $_" }
        
        # You'll need to uncomment and configure this section with your server details
        # Uncomment the following lines and replace with your server details:
        
        # $serverUser = "your-username"
        # $serverHost = "your-server-ip"
        # $sshKey = "path-to-your-ssh-key"
        
        # foreach ($cmd in $serverCommands) {
        #     Write-Host "Executing: $cmd"
        #     ssh -i $sshKey $serverUser@$serverHost $cmd
        #     if ($LASTEXITCODE -ne 0) {
        #         Write-Error "Command failed: $cmd"
        #     }
        # }
        
        Write-Warning "Server deployment commands displayed above."
        Write-Warning "Please run these manually on your DigitalOcean server, or configure SSH in this script."
    }
    
    Write-Host ""
    Write-Host "${Green}🎉 Deployment process completed!${Reset}"
    Write-Host "${Blue}Summary:${Reset}"
    Write-Host "  • Changes committed: '$CommitMessage'"
    Write-Host "  • Pushed to GitHub: main branch"
    if (-not $SkipBuild) {
        Write-Host "  • Local build: tested"
    }
    if (-not $LocalOnly) {
        Write-Host "  • Server deployment: commands displayed"
    }
    
} catch {
    Write-Error "Deployment failed: $_"
    exit 1
}

Write-Host ""
Write-Host "${Blue}🔧 Next time, you can use:${Reset}"
Write-Host "  ${Yellow}.\deploy.ps1 'Your commit message'${Reset}                 # Full deployment"
Write-Host "  ${Yellow}.\deploy.ps1 'Your commit message' -SkipBuild${Reset}       # Skip local build"
Write-Host "  ${Yellow}.\deploy.ps1 'Your commit message' -LocalOnly${Reset}       # Git only, no server" 