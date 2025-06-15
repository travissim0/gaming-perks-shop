# Gaming Perks Shop - Automated Setup Script for Windows
# This script will automatically request admin privileges and handle everything

Write-Host "🚀 Gaming Perks Shop - Automated Setup" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Restart as administrator if needed
if (-not (Test-Administrator)) {
    Write-Host "⚠️  This script requires administrator privileges." -ForegroundColor Yellow
    Write-Host "🔄 Restarting as administrator..." -ForegroundColor Cyan
    
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process PowerShell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    exit
}

Write-Host "✅ Running with administrator privileges" -ForegroundColor Green

# Function to check if a command exists
function Test-CommandExists {
    param($command)
    $null = Get-Command $command -ErrorAction SilentlyContinue
    return $?
}

# Install Chocolatey if not present or fix broken installation
function Install-Chocolatey {
    Write-Host "🍫 Setting up Chocolatey package manager..." -ForegroundColor Cyan
    
    # Remove any broken Chocolatey installation
    if (Test-Path "C:\ProgramData\chocolatey") {
        Write-Host "🔧 Removing existing Chocolatey installation..." -ForegroundColor Yellow
        Remove-Item "C:\ProgramData\chocolatey" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Install Chocolatey
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    try {
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Host "✅ Chocolatey installed successfully!" -ForegroundColor Green
        
        # Refresh environment variables
        $env:ChocolateyInstall = Convert-Path "$((Get-Command choco).Path)\..\.."
        Import-Module "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
        
        return $true
    } catch {
        Write-Host "❌ Failed to install Chocolatey: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Install software using Chocolatey
function Install-WithChocolatey {
    param($packageName, $displayName)
    
    Write-Host "📦 Installing $displayName..." -ForegroundColor Yellow
    try {
        choco install $packageName -y --no-progress
        Write-Host "✅ $displayName installed successfully!" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ Failed to install $displayName" -ForegroundColor Red
        return $false
    }
}

# Setup Chocolatey
$chocoInstalled = Install-Chocolatey

if ($chocoInstalled) {
    # Check and install Git
    if (-not (Test-CommandExists "git")) {
        Write-Host "🔧 Git not found. Installing Git..." -ForegroundColor Yellow
        Install-WithChocolatey "git" "Git"
    } else {
        Write-Host "✅ Git is already installed" -ForegroundColor Green
    }

    # Check and install Node.js
    if (-not (Test-CommandExists "node")) {
        Write-Host "🔧 Node.js not found. Installing Node.js..." -ForegroundColor Yellow
        Install-WithChocolatey "nodejs" "Node.js"
    } else {
        Write-Host "✅ Node.js is already installed" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Cannot proceed without Chocolatey. Please install Git and Node.js manually." -ForegroundColor Red
    Write-Host "📋 Manual Installation Links:" -ForegroundColor Cyan
    Write-Host "   Git: https://git-scm.com/download/win" -ForegroundColor White
    Write-Host "   Node.js: https://nodejs.org/" -ForegroundColor White
    Read-Host "Press Enter to continue after manual installation"
}

# Refresh environment variables and restart PowerShell if tools were just installed
Write-Host "🔄 Refreshing environment variables..." -ForegroundColor Cyan
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Check if we need to restart PowerShell for PATH changes to take effect
$needsRestart = $false
if ($chocoInstalled) {
    if (-not (Test-CommandExists "git") -or -not (Test-CommandExists "node")) {
        $needsRestart = $true
    }
}

if ($needsRestart) {
    Write-Host "🔄 Tools installed! Restarting PowerShell to refresh environment..." -ForegroundColor Yellow
    Write-Host "⏳ The script will continue automatically in the new window..." -ForegroundColor Cyan
    
    # Create a continuation script
    $continueScript = @"
Write-Host "🔄 Continuing setup..." -ForegroundColor Green
Set-Location "$PWD"
cd C:\Users\Travis\gaming-perks-shop 2>$null
if (-not (Test-Path "package.json")) {
    git clone https://github.com/travissim0/gaming-perks-shop C:\Users\Travis\gaming-perks-shop
    cd C:\Users\Travis\gaming-perks-shop
}
npm install
Write-Host "✅ Setup completed! Run 'npm run dev' to start the development server." -ForegroundColor Green
pause
"@
    
    $continueScript | Out-File -FilePath "$env:TEMP\continue-setup.ps1" -Encoding UTF8
    
    Start-Process PowerShell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$env:TEMP\continue-setup.ps1`""
    exit
}

# Wait a moment for installations to complete
Start-Sleep -Seconds 2

# Verify installations
Write-Host "🔍 Verifying installations..." -ForegroundColor Cyan
try {
    $gitVersion = git --version
    Write-Host "✅ $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git verification failed" -ForegroundColor Red
}

try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green
    Write-Host "✅ npm $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js/npm verification failed" -ForegroundColor Red
}

# Create project directory
$projectPath = "$HOME\gaming-perks-shop"
Write-Host "📁 Setting up project directory at: $projectPath" -ForegroundColor Cyan

if (Test-Path $projectPath) {
    Write-Host "⚠️  Directory already exists. Removing..." -ForegroundColor Yellow
    Remove-Item $projectPath -Recurse -Force
}

# Clone repository
Write-Host "📥 Cloning repository..." -ForegroundColor Cyan
try {
    git clone https://github.com/travissim0/gaming-perks-shop $projectPath
    Set-Location $projectPath
    Write-Host "✅ Repository cloned successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to clone repository. Check internet connection." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing project dependencies..." -ForegroundColor Cyan
try {
    npm install
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Create .env.local template
Write-Host "📝 Creating environment file template..." -ForegroundColor Cyan
$envContent = @"
# Gaming Perks Shop Environment Variables
# Replace these with your actual Supabase credentials

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
"@

$envContent | Out-File -FilePath ".env.local" -Encoding UTF8
Write-Host "✅ .env.local template created!" -ForegroundColor Green

# Final setup check
Write-Host "🎯 Running setup verification..." -ForegroundColor Cyan
if (Test-Path "package.json") {
    Write-Host "✅ package.json found" -ForegroundColor Green
} else {
    Write-Host "❌ package.json not found" -ForegroundColor Red
}

if (Test-Path ".env.local") {
    Write-Host "✅ .env.local file created" -ForegroundColor Green
} else {
    Write-Host "❌ .env.local file missing" -ForegroundColor Red
}

# Check if it worked
Get-Content .env.local

# Display completion message
Write-Host ""
Write-Host "🎉 SETUP COMPLETE!" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env.local with your actual Supabase credentials"
Write-Host "2. Run: npm run dev"
Write-Host "3. Open: http://localhost:3000"
Write-Host ""
Write-Host "📍 Project Location: $projectPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔧 Quick Commands:" -ForegroundColor Cyan
Write-Host "   cd `"$projectPath`""
Write-Host "   npm run dev"
Write-Host ""

# Ask if user wants to start the dev server
$startDev = Read-Host "Would you like to start the development server now? (y/n)"
if ($startDev -eq "y" -or $startDev -eq "Y") {
    Write-Host ""
    Write-Host "🚀 Starting development server..." -ForegroundColor Green
    Write-Host "⚠️  Make sure to edit .env.local with your Supabase credentials first!" -ForegroundColor Yellow
    Write-Host ""
    npm run dev
}

Write-Host "✨ Setup script completed!" -ForegroundColor Green 