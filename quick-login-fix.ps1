# Quick Fix for Login Issues (supabaseUrl is required error)
# This fixes the most common cause of environment variables not loading

Write-Host "🚀 Quick Login Fix - Environment Variables" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Step 1: Stop any running dev server
Write-Host "`n1. Stopping dev server..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Server stopped" -ForegroundColor Green

# Step 2: Check .env.local
Write-Host "`n2. Checking .env.local..." -ForegroundColor Yellow
if (!(Test-Path ".env.local")) {
    Write-Host "   ❌ .env.local file missing!" -ForegroundColor Red
    Write-Host "   Create .env.local with your Supabase credentials" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ .env.local found" -ForegroundColor Green

# Step 3: Delete .next folder (this fixes most env loading issues)
Write-Host "`n3. Clearing Next.js cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "   ✅ .next folder deleted" -ForegroundColor Green
} else {
    Write-Host "   ✅ No .next folder to delete" -ForegroundColor Green
}

# Step 4: Delete node_modules/.cache if it exists
Write-Host "`n4. Clearing additional caches..." -ForegroundColor Yellow
if (Test-Path "node_modules/.cache") {
    Remove-Item "node_modules/.cache" -Recurse -Force
    Write-Host "   ✅ Node cache cleared" -ForegroundColor Green
}

# Step 5: Start fresh dev server
Write-Host "`n5. Starting fresh development server..." -ForegroundColor Yellow
Write-Host "   🌐 Server will start on http://localhost:3000" -ForegroundColor Green
Write-Host "   🔑 Try logging in once the server starts" -ForegroundColor Green
Write-Host "   🚪 Use incognito browser window for best results" -ForegroundColor Yellow
Write-Host "`n   Press Ctrl+C to stop the server when done" -ForegroundColor Gray

Start-Sleep -Seconds 2
npm run dev 