#!/usr/bin/env pwsh

# Apply video support to matches and create featured videos system
# This script adds video functionality to the homepage

param(
    [switch]$WhatIf = $false
)

Write-Host "🎬 Adding Video Support to Infantry Gaming Platform" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Load environment variables
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^([^#].+?)=(.+)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
    Write-Host "✅ Environment variables loaded from .env.local" -ForegroundColor Green
} else {
    Write-Host "❌ .env.local file not found" -ForegroundColor Red
    exit 1
}

# Get database connection details
$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $supabaseUrl -or -not $serviceRoleKey) {
    Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
    Write-Host "   NEXT_PUBLIC_SUPABASE_URL: $($supabaseUrl ? 'Set' : 'Missing')" -ForegroundColor Red
    Write-Host "   SUPABASE_SERVICE_ROLE_KEY: $($serviceRoleKey ? 'Set' : 'Missing')" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Supabase configuration:" -ForegroundColor Yellow
Write-Host "   URL: $supabaseUrl" -ForegroundColor White
Write-Host "   Service Key: $($serviceRoleKey.Substring(0, 10))..." -ForegroundColor White

# Check if SQL file exists
$sqlFile = "add-video-support-to-matches.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ SQL file not found: $sqlFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 This will add the following video features:" -ForegroundColor Yellow
Write-Host "   • Video columns to matches table (YouTube, VOD, highlights)" -ForegroundColor White
Write-Host "   • Featured videos table for homepage showcase" -ForegroundColor White
Write-Host "   • Video views tracking for analytics" -ForegroundColor White
Write-Host "   • Helper functions for video management" -ForegroundColor White
Write-Host "   • Sample featured videos for testing" -ForegroundColor White
Write-Host ""

if ($WhatIf) {
    Write-Host "🔍 WhatIf mode - showing SQL content:" -ForegroundColor Cyan
    Get-Content $sqlFile | Write-Host -ForegroundColor Gray
    Write-Host ""
    Write-Host "✅ WhatIf complete - no changes made" -ForegroundColor Green
    exit 0
}

# Confirm execution
$confirm = Read-Host "Do you want to proceed? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "⏹️ Operation cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "🚀 Applying video support migration..." -ForegroundColor Blue

try {
    # Read SQL file
    $sqlContent = Get-Content $sqlFile -Raw
    
    # Execute via Supabase REST API
    $uri = "$supabaseUrl/rest/v1/rpc/exec_sql"
    $headers = @{
        'Authorization' = "Bearer $serviceRoleKey"
        'Content-Type' = 'application/json'
        'apikey' = $serviceRoleKey
    }
    
    $body = @{
        query = $sqlContent
    } | ConvertTo-Json -Depth 10

    Write-Host "📡 Executing SQL migration..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body
    
    Write-Host "✅ Video support migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Verify the installation
    Write-Host "🔍 Verifying installation..." -ForegroundColor Yellow
    
    # Check if featured_videos table exists
    $verifyUri = "$supabaseUrl/rest/v1/featured_videos"
    $verifyHeaders = @{
        'Authorization' = "Bearer $serviceRoleKey"
        'apikey' = $serviceRoleKey
        'Range' = '0-0'
    }
    
    try {
        $verifyResponse = Invoke-RestMethod -Uri $verifyUri -Method HEAD -Headers $verifyHeaders
        Write-Host "✅ featured_videos table created successfully" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Could not verify featured_videos table" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🎯 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Restart your Next.js development server" -ForegroundColor White
    Write-Host "   2. Check your homepage for the new video section" -ForegroundColor White
    Write-Host "   3. Add featured videos via Supabase dashboard" -ForegroundColor White
    Write-Host "   4. Test video viewing and analytics" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Features added:" -ForegroundColor Green
    Write-Host "   • Homepage now features videos prominently in center" -ForegroundColor White
    Write-Host "   • Matches can now have YouTube/VOD links" -ForegroundColor White
    Write-Host "   • Server status simplified in left sidebar" -ForegroundColor White
    Write-Host "   • Matches/squads moved to right sidebar" -ForegroundColor White
    Write-Host "   • Dynamic content positioning based on data" -ForegroundColor White
    Write-Host "   • Video view tracking and analytics" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "❌ Error applying migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "HTTP Status: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 401) {
            Write-Host "💡 This might be a permissions issue. Verify your service role key." -ForegroundColor Yellow
        }
    }
    
    exit 1
}

Write-Host "🎉 Video support installation complete!" -ForegroundColor Green 