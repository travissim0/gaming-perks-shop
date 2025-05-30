#!/usr/bin/env pwsh

# Create WebM version for better browser support
# WebM typically provides better compression and quality

Write-Host "🎬 Creating WebM Version for Better Compression" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$inputVideo = "public/CTFPL-Website-Header-1.mp4"
$webmOutput = "public/CTFPL-Website-Header-1.webm"
$ffmpegPath = "C:\Users\Travis\Downloads\YoutubeDownloader\ffmpeg.exe"

# Check if input exists
if (-not (Test-Path $inputVideo)) {
    Write-Host "❌ Optimized MP4 not found: $inputVideo" -ForegroundColor Red
    exit 1
}

# Check ffmpeg
if (-not (Test-Path $ffmpegPath)) {
    Write-Host "❌ FFmpeg not found at: $ffmpegPath" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Creating WebM version with VP9 codec..." -ForegroundColor Green

$ffmpegArgs = @(
    "-i", $inputVideo,
    "-c:v", "libvpx-vp9",
    "-crf", "32",
    "-b:v", "0",
    "-vf", "scale=854:480",
    "-r", "20",
    "-c:a", "libopus",
    "-b:a", "48k",
    "-y", $webmOutput
)

try {
    Write-Host "Command: $ffmpegPath $($ffmpegArgs -join ' ')" -ForegroundColor Gray
    $startTime = Get-Date
    & $ffmpegPath @ffmpegArgs
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    if (Test-Path $webmOutput) {
        $mp4Size = (Get-Item $inputVideo).Length / 1MB
        $webmSize = (Get-Item $webmOutput).Length / 1MB
        $additionalSavings = [math]::Round((1 - ($webmSize / $mp4Size)) * 100, 1)
        
        Write-Host ""
        Write-Host "✅ WebM version created!" -ForegroundColor Green
        Write-Host "📊 Comparison:" -ForegroundColor Cyan
        Write-Host "  MP4 size: $([math]::Round($mp4Size, 2)) MB" -ForegroundColor White
        Write-Host "  WebM size: $([math]::Round($webmSize, 2)) MB" -ForegroundColor White
        Write-Host "  Additional savings: $additionalSavings%" -ForegroundColor White
        Write-Host "  Processing time: $([math]::Round($duration.TotalSeconds, 1)) seconds" -ForegroundColor White
        
    } else {
        Write-Host "❌ WebM creation failed" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎯 To use both formats, update your video element:" -ForegroundColor Yellow
Write-Host '<video>' -ForegroundColor Gray
Write-Host '  <source src="/CTFPL-Website-Header-1.webm" type="video/webm">' -ForegroundColor Gray
Write-Host '  <source src="/CTFPL-Website-Header-1.mp4" type="video/mp4">' -ForegroundColor Gray
Write-Host '</video>' -ForegroundColor Gray 