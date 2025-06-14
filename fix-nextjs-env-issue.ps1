# Fix Next.js Environment Variable Loading Issues
# This addresses cases where .env.local exists but Next.js can't read it

Write-Host "🔧 FIXING NEXT.JS ENVIRONMENT VARIABLE LOADING" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Step 1: Stop dev server completely
Write-Host "`n1. 🛑 Stopping all Node processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "next-router-worker" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   ✅ All processes stopped" -ForegroundColor Green

# Step 2: Check .env.local exists
Write-Host "`n2. 📁 Checking .env.local file..." -ForegroundColor Yellow
if (!(Test-Path ".env.local")) {
    Write-Host "   ❌ .env.local not found!" -ForegroundColor Red
    Write-Host "   Please create .env.local file first" -ForegroundColor Red
    exit 1
}

# Read and check file content
$envContent = Get-Content ".env.local" -Raw
$lines = Get-Content ".env.local" | Where-Object { $_ -match "NEXT_PUBLIC_" }
Write-Host "   ✅ .env.local found with $($lines.Count) NEXT_PUBLIC variables" -ForegroundColor Green

# Step 3: Fix file encoding (common issue!)
Write-Host "`n3. 🔤 Fixing file encoding..." -ForegroundColor Yellow
try {
    # Read as UTF8 and rewrite to ensure proper encoding
    $content = Get-Content ".env.local" -Encoding UTF8 -Raw
    $content | Out-File ".env.local" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ File encoding fixed (UTF-8)" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Encoding fix failed, continuing..." -ForegroundColor Yellow
}

# Step 4: Remove BOM if present (another common issue)
Write-Host "`n4. 🔧 Removing Byte Order Mark..." -ForegroundColor Yellow
try {
    $bytes = [System.IO.File]::ReadAllBytes(".env.local")
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $newBytes = $bytes[3..($bytes.Length-1)]
        [System.IO.File]::WriteAllBytes(".env.local", $newBytes)
        Write-Host "   ✅ BOM removed" -ForegroundColor Green
    } else {
        Write-Host "   ✅ No BOM found" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  BOM check failed, continuing..." -ForegroundColor Yellow
}

# Step 5: Clear ALL Next.js caches
Write-Host "`n5. 🗑️  Clearing all caches..." -ForegroundColor Yellow

# Delete .next folder
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "   ✅ .next folder deleted" -ForegroundColor Green
}

# Delete node_modules/.cache
if (Test-Path "node_modules/.cache") {
    Remove-Item "node_modules/.cache" -Recurse -Force
    Write-Host "   ✅ Node cache deleted" -ForegroundColor Green
}

# Clear npm cache
npm cache clean --force 2>$null
Write-Host "   ✅ npm cache cleared" -ForegroundColor Green

# Step 6: Verify environment variables will be loaded
Write-Host "`n6. 🔍 Verifying environment variables..." -ForegroundColor Yellow
$requiredVars = @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
$envLines = Get-Content ".env.local"

foreach ($var in $requiredVars) {
    $found = $envLines | Where-Object { $_ -match "^$var=" }
    if ($found) {
        $value = ($found -split "=", 2)[1]
        if ($value -and $value.Length -gt 10) {
            Write-Host "   ✅ $var found (${value.Substring(0,20)}...)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  $var found but value looks short" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ❌ $var missing!" -ForegroundColor Red
    }
}

# Step 7: Create a test to verify vars load
Write-Host "`n7. 🧪 Creating environment test..." -ForegroundColor Yellow
$testContent = @"
// Test if environment variables are loading
console.log('=== ENVIRONMENT VARIABLE TEST ===');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'FOUND' : 'MISSING');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'FOUND' : 'MISSING');
console.log('==================================');
"@

$testContent | Out-File "test-env.js" -Encoding UTF8
Write-Host "   ✅ Environment test created" -ForegroundColor Green

# Step 8: Start fresh dev server
Write-Host "`n8. 🚀 Starting fresh development server..." -ForegroundColor Yellow
Write-Host "`n🎯 INSTRUCTIONS:" -ForegroundColor Cyan
Write-Host "   1. Watch for 'Ready - started server' message" -ForegroundColor White
Write-Host "   2. Open browser in INCOGNITO mode" -ForegroundColor White
Write-Host "   3. Go to http://localhost:3000" -ForegroundColor White
Write-Host "   4. Open browser console (F12)" -ForegroundColor White
Write-Host "   5. Look for 'ENVIRONMENT VARIABLE TEST' output" -ForegroundColor White
Write-Host "   6. Try logging in" -ForegroundColor White

Write-Host "`n🔧 If login still fails:" -ForegroundColor Yellow
Write-Host "   - Check browser console for errors" -ForegroundColor White
Write-Host "   - Verify environment variables show 'FOUND'" -ForegroundColor White
Write-Host "   - Try different browser or clear all browser data" -ForegroundColor White

Write-Host "`nStarting server in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Start the server
npm run dev 