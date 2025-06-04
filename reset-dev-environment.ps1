#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Reset Gaming Perks Shop development environment
.DESCRIPTION
    This script completely resets the development environment:
    - Cleans Next.js build cache
    - Reinstalls node modules
    - Starts fresh development server
#>

# Colors for output
$Green = [System.ConsoleColor]::Green
$Red = [System.ConsoleColor]::Red
$Yellow = [System.ConsoleColor]::Yellow
$Blue = [System.ConsoleColor]::Blue

function Write-ColorOutput {
    param([string]$Message, [System.ConsoleColor]$Color = [System.ConsoleColor]::White)
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "🔄 Resetting development environment..." $Blue
Write-ColorOutput "=======================================" $Blue

try {
    # Stop any running dev processes
    Write-ColorOutput "🛑 Stopping any running processes..." $Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # Clean Next.js build cache
    Write-ColorOutput "🧹 Cleaning Next.js cache..." $Yellow
    if (Test-Path ".next") {
        Remove-Item -Recurse -Force .next
        Write-ColorOutput "   ✅ Removed .next directory" $Green
    }

    # Clean node modules
    Write-ColorOutput "🧹 Cleaning node_modules..." $Yellow
    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force node_modules
        Write-ColorOutput "   ✅ Removed node_modules directory" $Green
    }

    # Clean package-lock.json
    Write-ColorOutput "🧹 Cleaning package-lock.json..." $Yellow
    if (Test-Path "package-lock.json") {
        Remove-Item -Force package-lock.json
        Write-ColorOutput "   ✅ Removed package-lock.json" $Green
    }

    # Reinstall dependencies
    Write-ColorOutput "📦 Reinstalling dependencies..." $Yellow
    npm install
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "   ✅ Dependencies installed successfully" $Green
    } else {
        Write-ColorOutput "   ❌ Failed to install dependencies" $Red
        exit 1
    }

    # Start development server
    Write-ColorOutput "🚀 Starting development server..." $Green
    Write-ColorOutput "   Press Ctrl+C to stop the server" $Yellow
    Write-ColorOutput "=======================================" $Blue
    
    npm run dev

} catch {
    Write-ColorOutput "❌ Error during reset: $($_.Exception.Message)" $Red
    exit 1
} 