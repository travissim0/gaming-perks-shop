'use client';

import React, { useEffect, useRef } from 'react';
import { SpriteData, rgbToHsv, hsvToRgb } from '@/lib/blo-parser';

interface SpriteViewerProps {
  spriteData: SpriteData | null;
  currentRow: number;
  currentColumn: number;
  zoom: number;
  hue: number;
  saturation: number;
  value: number;
  bgRed: number;
  bgGreen: number;
  bgBlue: number;
}

export const SpriteViewer: React.FC<SpriteViewerProps> = ({
  spriteData,
  currentRow,
  currentColumn,
  zoom,
  hue,
  saturation,
  value,
  bgRed,
  bgGreen,
  bgBlue,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderSprite = () => {
    const canvas = canvasRef.current;
    if (!canvas || !spriteData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with background color
    ctx.fillStyle = `rgb(${bgRed}, ${bgGreen}, ${bgBlue})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frameIndex = currentRow * spriteData.columnCount + currentColumn;
    if (frameIndex >= spriteData.frames.length) return;

    const frame = spriteData.frames[frameIndex];
    if (!frame || !frame.pixels) return;

    // Create image data
    const imageData = ctx.createImageData(frame.width, frame.height);
    const palette = spriteData.palette;

    // Apply HSV adjustments to palette
    const adjustedPalette = new Uint32Array(palette.length);
    for (let i = 0; i < palette.length; i++) {
      const color = palette[i];
      const r = (color >> 16) & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = color & 0xFF;
      const a = (color >> 24) & 0xFF;

      if (a === 0) {
        adjustedPalette[i] = 0; // Transparent
        continue;
      }

      // Convert to HSV and apply adjustments
      const [h, s, v] = rgbToHsv(r, g, b);
      const newH = Math.max(0, Math.min(360, h + hue));
      const newS = Math.max(0, Math.min(100, s + saturation));
      const newV = Math.max(0, Math.min(100, v + value));
      const [newR, newG, newB] = hsvToRgb(newH, newS, newV);

      adjustedPalette[i] = (a << 24) | (newR << 16) | (newG << 8) | newB;
    }

    // Render pixels
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const pixelIndex = y * frame.width + x;
        const paletteIndex = frame.pixels[pixelIndex];
        const color = adjustedPalette[paletteIndex];

        if ((color >> 24) & 0xFF) { // Not transparent
          const dataIndex = pixelIndex * 4;
          imageData.data[dataIndex] = (color >> 16) & 0xFF;     // R
          imageData.data[dataIndex + 1] = (color >> 8) & 0xFF;  // G
          imageData.data[dataIndex + 2] = color & 0xFF;         // B
          imageData.data[dataIndex + 3] = (color >> 24) & 0xFF; // A
        }
      }
    }

    // Create temporary canvas for scaling
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.width;
    tempCanvas.height = frame.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.putImageData(imageData, 0, 0);

    // Center and scale the image
    const scaledWidth = frame.width * zoom;
    const scaledHeight = frame.height * zoom;
    const x = (canvas.width - scaledWidth) / 2;
    const y = (canvas.height - scaledHeight) / 2;

    // Disable image smoothing for pixel art
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);
  };

  useEffect(() => {
    renderSprite();
  }, [spriteData, currentRow, currentColumn, zoom, hue, saturation, value, bgRed, bgGreen, bgBlue]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={700}
        height={700}
        className="w-full border border-gray-600 rounded bg-black"
      />
      
      {/* Sprite Info Overlay */}
      {spriteData && (
        <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Frame: {(currentRow * spriteData.columnCount + currentColumn) + 1}/{spriteData.frames.length}</div>
          <div>Size: {spriteData.width}×{spriteData.height}</div>
          <div>Grid: {spriteData.rowCount}×{spriteData.columnCount}</div>
        </div>
      )}
    </div>
  );
}; 