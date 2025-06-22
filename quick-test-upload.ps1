# Quick test upload script for rapid troubleshooting
param(
    [string]$TestFile = "src/app/api/test-zone-command/route.ts"
)

Write-Host "🚀 Quick Test Upload Starting..." -ForegroundColor Green

# Load environment variables
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
}

$SERVER_HOST = $env:REMOTE_SERVER_HOST
$SERVER_USER = $env:REMOTE_SERVER_USER
$SSH_KEY_PATH = $env:SSH_KEY_PATH

if (-not $SERVER_HOST) {
    Write-Host "❌ REMOTE_SERVER_HOST not found in environment" -ForegroundColor Red
    exit 1
}

Write-Host "📡 Uploading $TestFile to $SERVER_HOST..." -ForegroundColor Yellow

# Upload the specific test file
$remotePath = "/var/www/gaming-perks-shop/$TestFile"
$remoteDir = Split-Path $remotePath -Parent

# Create directory if it doesn't exist and upload file
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$TestFile" "${SERVER_USER}@${SERVER_HOST}:$remotePath"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ File uploaded successfully" -ForegroundColor Green
    
    # Quick restart
    Write-Host "🔄 Restarting app..." -ForegroundColor Yellow
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "cd /var/www/gaming-perks-shop && pm2 restart gaming-perks-shop"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ App restarted successfully" -ForegroundColor Green
        Write-Host "🧪 Test the endpoint: https://your-domain.com/api/test-zone-command" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Failed to restart app" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Failed to upload file" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Quick test upload complete!" -ForegroundColor Green 