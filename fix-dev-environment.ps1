# Fix Development Environment Issues
# Run this script to automatically fix common setup problems

Write-Host "🔧 FIXING DEVELOPMENT ENVIRONMENT ISSUES" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Step 1: Stop any running dev server
Write-Host "`n1. 🛑 Stopping any running dev server..." -ForegroundColor Yellow
try {
    # Try to kill any node processes running on port 3000
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($processes) {
        Write-Host "   Found running Node processes, attempting to stop..." -ForegroundColor Yellow
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   ✅ Dev server stopped" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  No running dev server found" -ForegroundColor Yellow
}

# Step 2: Check if we're in the right directory
Write-Host "`n2. 📁 Checking directory..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    Write-Host "   ✅ package.json found" -ForegroundColor Green
} else {
    Write-Host "   ❌ package.json not found - make sure you're in the project root" -ForegroundColor Red
    exit 1
}

# Step 3: Check .env.local
Write-Host "`n3. 🌐 Checking environment variables..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    Write-Host "   ✅ .env.local found" -ForegroundColor Green
} else {
    Write-Host "   ❌ .env.local not found - you need to create this file" -ForegroundColor Red
    Write-Host "   Create .env.local with your Supabase credentials" -ForegroundColor Red
    exit 1
}

# Step 4: Delete .next folder
Write-Host "`n4. 🗑️  Cleaning build cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "   ✅ .next folder deleted" -ForegroundColor Green
} else {
    Write-Host "   ✅ No .next folder to delete" -ForegroundColor Green
}

# Step 5: Clean npm cache
Write-Host "`n5. 🧹 Cleaning npm cache..." -ForegroundColor Yellow
try {
    npm cache clean --force
    Write-Host "   ✅ npm cache cleaned" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Cache clean failed, continuing..." -ForegroundColor Yellow
}

# Step 6: Install dependencies
Write-Host "`n6. 📦 Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "   ❌ npm install failed" -ForegroundColor Red
    Write-Host "   Try running: npm install --force" -ForegroundColor Red
    exit 1
}

# Step 7: Start dev server
Write-Host "`n7. 🚀 Starting development server..." -ForegroundColor Yellow
Write-Host "   Starting server on http://localhost:3000" -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "   If port 3000 is busy, try: npm run dev -- -p 3001" -ForegroundColor Yellow

# Wait a moment then start
Start-Sleep -Seconds 2
npm run dev 