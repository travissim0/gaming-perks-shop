// BLO Parser - Ported from Infantry Blob Viewer
// Based on Gibbed.Infantry file format specifications

export interface SpriteFrame {
  width: number;
  height: number;
  x: number;
  y: number;
  pixels: Uint8Array;
}

export interface SpriteData {
  name: string;
  width: number;
  height: number;
  rowCount: number;
  columnCount: number;
  frames: SpriteFrame[];
  palette: Uint32Array;
  ySortAdjust: number;
  shadowCount: number;
  lightCount: number;
  animationTime: number;
  compressionFlags: number;
  blitMode: number;
  rowMeaning: number;
  sortTransform: number;
  maxSolidIndex: number;
  category: string;
  description: string;
  userPaletteStart: number;
  userPalette: number;
}

export interface BlobEntry {
  name: string;
  offset: number;
  size: number;
}

// CFS Compression Flags
enum CompressionFlags {
  None = 0,
  DupeRowsVertically = 1 << 0,
  DupeRowsHorizontally = 1 << 1,
  ColumnsAreHalfRotation = 1 << 2,
  ColumnsAreQuarterRotation = 1 << 3,
  NoPixels = 1 << 4,
  RowsAreHalfRotation = 1 << 5,
  RowsAreQuarterRotation = 1 << 6,
}

export class BLOParser {
  private static readUInt16LE(buffer: ArrayBuffer, offset: number): number {
    const view = new DataView(buffer);
    return view.getUint16(offset, true);
  }

  private static readUInt32LE(buffer: ArrayBuffer, offset: number): number {
    const view = new DataView(buffer);
    return view.getUint32(offset, true);
  }

  private static readString(buffer: ArrayBuffer, offset: number, length: number): string {
    const bytes = new Uint8Array(buffer, offset, length);
    let str = '';
    for (let i = 0; i < bytes.length && bytes[i] !== 0; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  static async parseBLOFile(file: File): Promise<Map<string, SpriteData>> {
    const buffer = await file.arrayBuffer();
    const sprites = new Map<string, SpriteData>();

    try {
      // Parse BLO header
      if (buffer.byteLength < 12) {
        throw new Error('Invalid BLO file: too small');
      }

      const signature = this.readString(buffer, 0, 4);
      if (signature !== 'BLOB') {
        throw new Error('Invalid BLO file: missing BLOB signature');
      }

      const version = this.readUInt32LE(buffer, 4);
      const entryCount = this.readUInt32LE(buffer, 8);

      let offset = 12;

      // Parse directory entries
      const entries: BlobEntry[] = [];
      for (let i = 0; i < entryCount; i++) {
        if (offset + 72 > buffer.byteLength) break;

        const name = this.readString(buffer, offset, 64).trim();
        const entryOffset = this.readUInt32LE(buffer, offset + 64);
        const size = this.readUInt32LE(buffer, offset + 68);

        entries.push({ name, offset: entryOffset, size });
        offset += 72;
      }

      // Parse each sprite entry
      for (const entry of entries) {
        if (entry.name.toLowerCase().endsWith('.cfs')) {
          try {
            const spriteData = this.parseCFSData(buffer, entry.offset, entry.size, entry.name);
            if (spriteData) {
              sprites.set(entry.name, spriteData);
            }
          } catch (error) {
            console.warn(`Failed to parse sprite ${entry.name}:`, error);
          }
        }
      }

      return sprites;
    } catch (error) {
      throw new Error(`Failed to parse BLO file: ${(error as Error).message}`);
    }
  }

  private static parseCFSData(buffer: ArrayBuffer, offset: number, size: number, name: string): SpriteData | null {
    if (offset + size > buffer.byteLength || size < 64) {
      return null;
    }

    try {
      const view = new DataView(buffer, offset, size);
      
      // Parse CFS header
      const signature = this.readString(buffer, offset, 4);
      if (signature !== '\x00\x00\x01\x00' && signature !== 'CFS\x00') {
        // Try different signature patterns
        if (size < 64) return null;
      }

      // Read sprite properties
      const width = this.readUInt16LE(buffer, offset + 4);
      const height = this.readUInt16LE(buffer, offset + 6);
      const rowCount = this.readUInt16LE(buffer, offset + 8);
      const columnCount = this.readUInt16LE(buffer, offset + 10);

      if (width === 0 || height === 0 || rowCount === 0 || columnCount === 0) {
        return null;
      }

      const frameCount = rowCount * columnCount;
      const animationTime = this.readUInt32LE(buffer, offset + 12);
      const compressionFlags = this.readUInt32LE(buffer, offset + 16);
      
      // Create default palette (256 colors)
      const palette = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        // Simple greyscale palette as default
        const grey = i;
        palette[i] = (255 << 24) | (grey << 16) | (grey << 8) | grey;
      }
      
      // Try to find palette data in the sprite
      let paletteOffset = offset + 64;
      if (paletteOffset + 1024 <= offset + size) {
        for (let i = 0; i < 256; i++) {
          const paletteIndex = paletteOffset + i * 4;
          if (paletteIndex + 4 <= offset + size) {
            const b = new Uint8Array(buffer)[paletteIndex];
            const g = new Uint8Array(buffer)[paletteIndex + 1];
            const r = new Uint8Array(buffer)[paletteIndex + 2];
            const a = new Uint8Array(buffer)[paletteIndex + 3] || 255;
            palette[i] = (a << 24) | (r << 16) | (g << 8) | b;
          }
        }
      }

      // Parse frames
      const frames: SpriteFrame[] = [];
      let frameOffset = paletteOffset + 1024;

      for (let frame = 0; frame < frameCount; frame++) {
        if (frameOffset >= offset + size) break;

        // Simple frame parsing - assumes uncompressed pixel data
        const frameWidth = width;
        const frameHeight = height;
        const pixelCount = frameWidth * frameHeight;
        
        if (frameOffset + pixelCount > offset + size) break;

        const pixels = new Uint8Array(buffer.slice(frameOffset, frameOffset + pixelCount));
        
        frames.push({
          width: frameWidth,
          height: frameHeight,
          x: 0,
          y: 0,
          pixels: pixels
        });

        frameOffset += pixelCount;
      }

      return {
        name: name.replace('.cfs', ''),
        width,
        height,
        rowCount,
        columnCount,
        frames,
        palette,
        ySortAdjust: 0,
        shadowCount: 0,
        lightCount: 0,
        animationTime: animationTime || 50,
        compressionFlags,
        blitMode: 0,
        rowMeaning: 0,
        sortTransform: 0,
        maxSolidIndex: 255,
        category: '',
        description: '',
        userPaletteStart: 0,
        userPalette: 0
      };
    } catch (error) {
      console.warn(`Error parsing CFS data for ${name}:`, error);
      return null;
    }
  }
}

// Color conversion utilities
export const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : Math.round((diff / max) * 100);
  const v = Math.round(max * 100);

  return [h, s, v];
};

export const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  h /= 60;
  s /= 100;
  v /= 100;

  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}; 