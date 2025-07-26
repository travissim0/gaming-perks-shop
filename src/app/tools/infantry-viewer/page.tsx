'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BLOParser, SpriteData, SpriteFrame } from '@/lib/blo-parser';
import './infantry-viewer.css';

interface BloFile {
  name: string;
  buffer: ArrayBuffer;
  sprites: Map<string, SpriteData>;
  audioFiles: any[];
}

export default function InfantryViewerPage() {
  const [bloFiles, setBloFiles] = useState<BloFile[]>([]);
  const [currentBloFile, setCurrentBloFile] = useState<BloFile | null>(null);
  const [currentSprite, setCurrentSprite] = useState<SpriteData | null>(null);
  const [currentSpriteIndex, setCurrentSpriteIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(15);
  const [zoom, setZoom] = useState(2);
  const [currentRow, setCurrentRow] = useState(0);
  const [currentColumn, setCurrentColumn] = useState(0);
  const [statusText, setStatusText] = useState('Ready');
  const [activeTab, setActiveTab] = useState<'sprites' | 'audio'>('sprites');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationIdRef = useRef<NodeJS.Timeout | null>(null);

  // Get current sprite list from current BLO file
  const currentSpriteList = currentBloFile ? Array.from(currentBloFile.sprites.entries()) : [];

  // Update current sprite when selection changes
  useEffect(() => {
    if (currentBloFile && currentSpriteList.length > currentSpriteIndex) {
      const [spriteName, spriteData] = currentSpriteList[currentSpriteIndex];
      setCurrentSprite(spriteData);
    } else {
      setCurrentSprite(null);
    }
  }, [currentBloFile, currentSpriteIndex, currentSpriteList]);

  // Render sprite on canvas
  const renderSprite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSprite) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frameIndex = currentRow * currentSprite.columnCount + currentColumn;
    if (frameIndex >= currentSprite.frames.length) return;

    const frame = currentSprite.frames[frameIndex];
    if (!frame || !frame.pixels) return;

    // Create image data
    const imageData = ctx.createImageData(frame.width, frame.height);
    const palette = currentSprite.palette;

    // Render pixels
    for (let i = 0; i < frame.pixels.length; i++) {
      const paletteIndex = frame.pixels[i];
      const color = palette[paletteIndex];
      
      const r = (color >> 16) & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = color & 0xFF;
      const a = (color >> 24) & 0xFF;

      const pixelIndex = i * 4;
      imageData.data[pixelIndex] = r;
      imageData.data[pixelIndex + 1] = g;
      imageData.data[pixelIndex + 2] = b;
      imageData.data[pixelIndex + 3] = a;
    }

    // Draw to canvas with zoom
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.width;
    tempCanvas.height = frame.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      
      // Calculate centered position
      const scaledWidth = frame.width * zoom;
      const scaledHeight = frame.height * zoom;
      const x = (canvas.width - scaledWidth) / 2;
      const y = (canvas.height - scaledHeight) / 2;
      
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);
    }
  }, [currentSprite, currentRow, currentColumn, zoom]);

  // Render sprite when dependencies change
  useEffect(() => {
    renderSprite();
  }, [renderSprite]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && currentSprite) {
      const animate = () => {
        setCurrentColumn(prev => {
          const nextColumn = prev + 1;
          if (nextColumn >= currentSprite.columnCount) {
            return 0;
          }
          return nextColumn;
        });
        
        animationIdRef.current = setTimeout(animate, 1000 / animationSpeed);
      };
      
      animationIdRef.current = setTimeout(animate, 1000 / animationSpeed);
      
      return () => {
        if (animationIdRef.current) {
          clearTimeout(animationIdRef.current);
        }
      };
    }
  }, [isPlaying, animationSpeed, currentSprite]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        const sprites = await BLOParser.parseBLOFile(file);
        const newBloFile: BloFile = {
          name: file.name,
          buffer: await file.arrayBuffer(),
          sprites,
          audioFiles: []
        };
        
        setBloFiles(prev => [...prev, newBloFile]);
        if (!currentBloFile) {
          setCurrentBloFile(newBloFile);
        }
        setStatusText(`Loaded ${sprites.size} sprites from ${file.name}`);
      } catch (error) {
        setStatusText(`Failed to load ${file.name}: ${(error as Error).message}`);
      }
    }
  };

  const toggleAnimation = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSpriteSelect = (index: number) => {
    setCurrentSpriteIndex(index);
    setCurrentRow(0);
    setCurrentColumn(0);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-400">🖼️ Infantry Blob Viewer</h1>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".blo,.cfs"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
            >
              📁 Load BLO Files
            </button>
            <span className="text-gray-400 text-sm">{bloFiles.length} files loaded</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="flex">
          <button
            onClick={() => setActiveTab('sprites')}
            className={`px-6 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'sprites'
                ? 'border-blue-500 text-blue-400 bg-gray-700'
                : 'border-transparent text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            🖼️ Sprites
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-6 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'audio'
                ? 'border-blue-500 text-blue-400 bg-gray-700'
                : 'border-transparent text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            🔊 Audio
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-screen">
        {activeTab === 'sprites' && (
          <>
            {/* Left Panel - File Browser */}
            <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  BLO Files ({bloFiles.length})
                </label>
                <select
                  value={currentBloFile?.name || ''}
                  onChange={(e) => {
                    const selected = bloFiles.find(f => f.name === e.target.value);
                    setCurrentBloFile(selected || null);
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select BLO file...</option>
                  {bloFiles.map(file => (
                    <option key={file.name} value={file.name}>{file.name}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search sprites..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400"
                />
              </div>

              <div className="space-y-2">
                {currentSpriteList.map(([spriteName, sprite], index) => (
                  <div
                    key={spriteName}
                    onClick={() => handleSpriteSelect(index)}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      index === currentSpriteIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {spriteName}
                  </div>
                ))}
              </div>
            </div>

            {/* Center Panel - Canvas */}
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 p-4">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={700}
                  height={700}
                  className="border border-gray-600 rounded-lg bg-black"
                />
                <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
                  <div>Frame: {currentRow * (currentSprite?.columnCount || 8) + currentColumn + 1}/{currentSprite?.frames.length || 0}</div>
                  <div>Row: {currentRow} Col: {currentColumn}</div>
                  <div>Zoom: {zoom}x</div>
                  {currentSprite && (
                    <>
                      <div>Size: {currentSprite.width}×{currentSprite.height}</div>
                      <div>Grid: {currentSprite.rowCount}×{currentSprite.columnCount}</div>
                      <div>Animation: {currentSprite.animationTime}ms</div>
                    </>
                  )}
                </div>
              </div>

              {/* Canvas Controls */}
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={toggleAnimation}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    isPlaying 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm">Speed:</label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(parseInt(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-xs text-gray-400">{animationSpeed}fps</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm">Zoom:</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={zoom}
                    onChange={(e) => setZoom(parseInt(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-xs text-gray-400">{zoom}x</span>
                </div>
              </div>
            </div>

            {/* Right Panel - Controls */}
            <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto">
              <div className="space-y-6">
                {/* Animation Controls */}
                <div>
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">Animation</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Row</label>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, (currentSprite?.rowCount || 1) - 1)}
                        value={currentRow}
                        onChange={(e) => setCurrentRow(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <span className="text-xs text-gray-400">{currentRow}/{(currentSprite?.rowCount || 1) - 1}</span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Column</label>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, (currentSprite?.columnCount || 1) - 1)}
                        value={currentColumn}
                        onChange={(e) => setCurrentColumn(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <span className="text-xs text-gray-400">{currentColumn}/{(currentSprite?.columnCount || 1) - 1}</span>
                    </div>
                  </div>
                </div>

                {/* Color Controls */}
                <div>
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">Color Adjustment</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Hue</label>
                      <input type="range" min="-180" max="180" defaultValue="0" className="w-full" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Saturation</label>
                      <input type="range" min="-100" max="100" defaultValue="0" className="w-full" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Brightness</label>
                      <input type="range" min="-100" max="100" defaultValue="0" className="w-full" />
                    </div>
                  </div>
                </div>

                {/* Export Options */}
                <div>
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">Export</h3>
                  <div className="space-y-2">
                    <button className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium">
                      📄 Export as PNG
                    </button>
                    <button className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium">
                      🎬 Export as GIF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'audio' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-6xl mb-4">🔊</div>
              <h3 className="text-xl font-semibold mb-2">Audio Player</h3>
              <p>Audio functionality will be implemented here</p>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex justify-between items-center text-sm">
        <span className="text-gray-300">{statusText}</span>
        <span className="text-gray-500">Hotkeys: ↑↓ BLO Files | ←→ Sprites | Tab: Switch Mode</span>
      </div>
    </div>
  );
} 