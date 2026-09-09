#!/usr/bin/env node
/**
 * Bakes an Infantry character sprite out of a .blo archive into a PNG atlas plus a
 * JSON frame map, for rendering walkable characters on the site.
 *
 * Why bake rather than parse in the browser: the sprites never change, so shipping a
 * CFS decoder and a 2MB .blo to every visitor buys nothing. This runs once, offline.
 *
 * The BLO and CFS readers below are ported from
 * C:\Users\Travis\infantry-tools\infantry-cfs-studio\src\lib\formats\{blo,cfs}.ts,
 * themselves rewrites of Gibbed.Infantry.FileFormats. Kept self-contained on purpose so
 * this project has no build-time dependency on that repo.
 *
 * All seven man classes share one sprite (man.blo / gfx00000) and differ only by the
 * HSV shift recorded per class in the zone's .veh file, so --hsv reproduces any class
 * from the same source frames. That same knob is what a squad-uniform feature would use.
 *
 * Usage:
 *   node scripts/bake-infantry-atlas.mjs --blo <man.blo> [options]
 *     --entry   gfx00000        CFS entry inside the archive
 *     --hsv     35,60,0         hue,saturation,value shift (Infantry's values)
 *     --name    infantry        output basename
 *     --out     public/sprites  output directory
 *     --list                    just list archive entries and exit
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);

const BLO_PATH = arg('blo');
const ENTRY = arg('entry', 'gfx00000');
const NAME = arg('name', 'infantry');
const OUT_DIR = arg('out', 'public/sprites');
const HSV = (arg('hsv', '0,0,0') || '0,0,0').split(',').map(Number);
// The sprite carries 64 facing directions. That is far more than a browser needs, and
// every one costs atlas area, so keep every Nth row. 4 gives 16 directions.
const ROW_STEP = Math.max(1, parseInt(arg('rowStep', '1'), 10) || 1);
const ONLY_ROW = arg('onlyRow') !== null ? parseInt(arg('onlyRow'), 10) : null;
/**
 * --tint <hue>[,<sat>[,<valueScale>]] colours the uniform directly: hue in degrees,
 * saturation 0-1, valueScale multiplies brightness (for browns and other dark tints).
 *
 * This is preferred over --hsv for producing the classes. The game encodes each class as
 * an HSV triple in the zone's .veh (Infantry 35,60,0; Heavy Weapons 10,60,0; Squad
 * Leader 65,60,0; Infiltrator 15,60,0; Jump Trooper 65,-30,0), but those values do not
 * fit any single linear hue scale I could solve against the actual in-game colours, so
 * the exact encoding is still unknown. Naming the target hue is honest and verifiable;
 * the .veh triples stay recorded above for whenever parity matters.
 */
const TINT = arg('tint') ? arg('tint').split(',').map(Number) : null;

if (!BLO_PATH) {
  console.error('--blo <path to .blo> is required');
  process.exit(1);
}

// ── BLO archive ─────────────────────────────────────────────────────────────
function parseBlo(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const version = view.getUint32(o, true);
  o += 4;
  if (version < 1 || version > 2) throw new Error(`Unsupported BLO version ${version}`);

  const nameLen = version === 2 ? 32 : 14;
  const count = view.getUint32(o, true);
  o += 4;

  const entries = [];
  for (let i = 0; i < count; i++) {
    let name = '';
    for (let c = 0; c < nameLen; c++) {
      const ch = view.getUint8(o + c);
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    o += nameLen;
    const offset = view.getUint32(o, true);
    o += 4;
    const size = view.getUint32(o, true);
    o += 4;
    entries.push({ name, offset, size });
  }
  return { version, entries };
}

// ── CFS sprite ──────────────────────────────────────────────────────────────
const HEADER_SIZE = { 2: 30, 3: 56, 4: 127, 5: 182 };

function readStr(view, o, max) {
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = view.getUint8(o + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function parseCfs(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;

  const version = view.getUint16(o, true);
  o += 2;
  if (version < 2 || version > 5) throw new Error(`Unsupported CFS version ${version}`);

  const h = {
    dataSize: 0, frameCount: 0, animationTime: 0, width: 0, height: 0,
    rowCount: 1, columnCount: 1, lightCount: 0, shadowCount: 0,
    userDataSize: 0, compressionFlags: 0, rowMeaning: 0, maxSolidIndex: 255,
    userPaletteStart: 0, userPalette: 0,
    category: '', description: '',
  };

  if (version >= 5) {
    h.dataSize = view.getUint32(o, true); o += 4;
    h.frameCount = view.getUint16(o, true); o += 2;
    h.animationTime = view.getUint16(o, true); o += 2;
    h.width = view.getUint16(o, true); o += 2;
    h.height = view.getUint16(o, true); o += 2;
    h.rowCount = view.getUint16(o, true); o += 2;
    h.columnCount = view.getUint16(o, true); o += 2;
    h.lightCount = view.getUint16(o, true); o += 2;
    h.shadowCount = view.getUint16(o, true); o += 2;
    h.userDataSize = view.getUint16(o, true); o += 2;
    o += 2; // ySortAdjust
    h.compressionFlags = view.getUint32(o, true); o += 4;
    o += 2; // blitMode
    h.rowMeaning = view.getUint16(o, true); o += 2;
    o += 2; // unknown20
    h.maxSolidIndex = view.getUint8(o); o += 1;
    o += 1; // sortTransform
    h.userPaletteStart = view.getUint8(o); o += 1;
    h.userPalette = view.getUint8(o); o += 1;
    h.category = readStr(view, o, 32); o += 32;
    h.description = readStr(view, o, 48); o += 48;
    o += 64; // unknown76
  } else if (version >= 4) {
    h.frameCount = view.getUint16(o, true); o += 2;
    h.animationTime = view.getUint16(o, true); o += 2;
    h.width = view.getUint16(o, true); o += 2;
    h.height = view.getUint16(o, true); o += 2;
    h.rowCount = view.getUint16(o, true); o += 2;
    h.columnCount = view.getUint16(o, true); o += 2;
    h.lightCount = view.getUint16(o, true); o += 2;
    h.shadowCount = view.getUint16(o, true); o += 2;
    h.userDataSize = view.getUint16(o, true); o += 2;
    h.compressionFlags = view.getUint8(o); o += 1;
    h.maxSolidIndex = view.getUint8(o); o += 1;
    h.dataSize = view.getUint32(o, true); o += 4;
  } else if (version >= 3) {
    // OldHeader3, 56 bytes. This is what man.blo actually uses.
    h.frameCount = view.getUint16(o, true); o += 2;
    h.animationTime = view.getUint16(o, true); o += 2;
    h.width = view.getUint16(o, true); o += 2;
    h.height = view.getUint16(o, true); o += 2;
    h.rowCount = view.getUint16(o, true); o += 2;
    h.columnCount = view.getUint16(o, true); o += 2;
    h.lightCount = view.getUint16(o, true); o += 2;
    h.shadowCount = view.getUint16(o, true); o += 2;
    h.userDataSize = view.getUint16(o, true); o += 2;
    h.compressionFlags = view.getUint8(o); o += 1;
    h.maxSolidIndex = view.getUint8(o); o += 1;
    h.dataSize = view.getUint32(o, true); o += 4;
    h.category = readStr(view, o, 16); o += 16;
    o += 1; // blitMode
    h.rowMeaning = view.getUint8(o); o += 1;
    o += 2; // ySortAdjust
    o += 1; // sortTransform
    h.userPaletteStart = view.getUint8(o); o += 1;
    h.userPalette = view.getUint8(o); o += 1;
    o += 9; // unknown2F
  } else {
    // OldHeader2, 30 bytes.
    h.frameCount = view.getUint16(o, true); o += 2;
    h.animationTime = view.getUint16(o, true); o += 2;
    h.width = view.getUint16(o, true); o += 2;
    h.height = view.getUint16(o, true); o += 2;
    h.rowCount = view.getUint16(o, true); o += 2;
    h.columnCount = view.getUint16(o, true); o += 2;
    h.lightCount = view.getUint16(o, true); o += 2;
    h.shadowCount = view.getUint16(o, true); o += 2;
    h.userDataSize = view.getUint16(o, true); o += 2;
    h.compressionFlags = view.getUint8(o); o += 1;
    h.maxSolidIndex = view.getUint8(o); o += 1;
    h.dataSize = view.getUint32(o, true); o += 4;
  }

  // Fixed offset past the version bytes + header, per the studio's reader.
  o = 2 + HEADER_SIZE[version];

  const palette = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    palette[i] = view.getUint32(o, true);
    o += 4;
  }

  o += h.userDataSize;

  const infos = [];
  for (let i = 0; i < h.frameCount; i++) {
    infos.push({
      x: view.getInt16(o, true),
      y: view.getInt16(o + 2, true),
      width: view.getInt16(o + 4, true),
      height: view.getInt16(o + 6, true),
      offset: view.getUint32(o + 8, true),
    });
    o += 12;
  }

  const frameDataStart = o;
  const NO_COMPRESSION = 0x01; // CompressionFlags.NoCompression
  const frames = infos.map((info) => {
    const w = Math.abs(info.width);
    const ht = Math.abs(info.height);
    const frame = { x: info.x, y: info.y, width: w, height: ht, pixels: new Uint8Array(w * ht) };
    const start = frameDataStart + info.offset;

    if ((h.compressionFlags & NO_COMPRESSION) !== 0) {
      if (start + frame.pixels.length <= data.length) {
        frame.pixels.set(data.subarray(start, start + frame.pixels.length));
      }
    } else {
      decompress(data, start, frame);
    }

    if (info.width < 0) flipH(frame);
    if (info.height < 0) flipV(frame);
    return frame;
  });

  return { version, header: h, palette, frames };
}

/** Per-scanline RLE: control byte = 4 bits transparent skip, 4 bits literal run. */
function decompress(data, startOffset, frame) {
  let o = startOffset;
  const lineLengths = [];
  for (let y = 0; y < frame.height; y++) {
    let len = data[o++];
    if (len === 0xff) {
      len = data[o] | (data[o + 1] << 8);
      o += 2;
    }
    lineLengths.push(len);
  }

  for (let y = 0; y < frame.height; y++) {
    const lineLength = lineLengths[y];
    if (!lineLength) continue;
    const lineStart = o;
    const rowOffset = y * frame.width;
    let x = 0;
    let p = 0;
    while (p < lineLength && x < frame.width) {
      const control = data[lineStart + p++];
      x += (control >> 4) & 0x0f;
      const literals = control & 0x0f;
      for (let i = 0; i < literals && x < frame.width; i++) {
        if (p < lineLength) frame.pixels[rowOffset + x++] = data[lineStart + p++];
      }
    }
    o += lineLength;
  }
}

function flipH(f) {
  for (let y = 0; y < f.height; y++) {
    const r = y * f.width;
    for (let x = 0; x < (f.width >> 1); x++) {
      const a = r + x, b = r + f.width - 1 - x;
      const t = f.pixels[a]; f.pixels[a] = f.pixels[b]; f.pixels[b] = t;
    }
  }
}

function flipV(f) {
  for (let y = 0; y < (f.height >> 1); y++) {
    const top = y * f.width, bot = (f.height - 1 - y) * f.width;
    for (let x = 0; x < f.width; x++) {
      const t = f.pixels[top + x]; f.pixels[top + x] = f.pixels[bot + x]; f.pixels[bot + x] = t;
    }
  }
}

// ── HSV shift, the same recolour the game applies per class ─────────────────
function shiftHsv([r, g, b], [dh, ds, dv]) {
  let { h, s, v } = rgbToHsv(r, g, b);
  h = (h + dh / 255) % 1;
  if (h < 0) h += 1;
  s = Math.min(1, Math.max(0, s + ds / 255));
  v = Math.min(1, Math.max(0, v + dv / 255));
  return hsvToRgb(h, s, v);
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── minimal PNG writer (RGBA, no deps beyond zlib) ──────────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── run ─────────────────────────────────────────────────────────────────────
const bloBuf = fs.readFileSync(BLO_PATH);
const blo = parseBlo(bloBuf);

if (flag('list')) {
  console.log(`${path.basename(BLO_PATH)} - BLO v${blo.version}, ${blo.entries.length} entries\n`);
  for (const e of blo.entries) console.log(`  ${e.name.padEnd(34)} ${String(e.size).padStart(9)} bytes`);
  process.exit(0);
}

const entry = blo.entries.find((e) => e.name.toLowerCase().startsWith(ENTRY.toLowerCase()));
if (!entry) {
  console.error(`entry "${ENTRY}" not found. Run with --list to see what is in the archive.`);
  process.exit(1);
}

const cfs = parseCfs(bloBuf.subarray(entry.offset, entry.offset + entry.size));
const { header, palette, frames } = cfs;

console.log(`entry     ${entry.name} (${entry.size} bytes)`);
console.log(`cfs       v${cfs.version}  ${header.width}x${header.height} logical`);
console.log(`grid      ${header.rowCount} rows x ${header.columnCount} cols = ${header.frameCount} frames`);
console.log(`rowMeaning ${header.rowMeaning}   animationTime ${header.animationTime}ms`);
console.log(`lights ${header.lightCount}  shadows ${header.shadowCount}  category "${header.category}"`);
console.log(`userPalette start ${header.userPaletteStart} count ${header.userPalette}  maxSolidIndex ${header.maxSolidIndex}`);
console.log(`hsv shift ${HSV.join(',')}`);

// Only the rowCount x columnCount grid is the sprite proper; light and shadow frames
// trail it and are not wanted here.
const gridFrames = header.rowCount * header.columnCount;
const grid = frames.slice(0, Math.min(gridFrames, frames.length));
const cols = header.columnCount;

// Pick which facing directions survive into the atlas.
const srcRows = [];
for (let r = 0; r < header.rowCount; r++) {
  if (ONLY_ROW !== null ? r === ONLY_ROW : r % ROW_STEP === 0) srcRows.push(r);
}

const used = [];
for (const r of srcRows) {
  for (let c = 0; c < cols; c++) {
    const f = grid[r * cols + c];
    if (f) used.push(f);
  }
}

const cellW = Math.max(...used.map((f) => f.width));
const cellH = Math.max(...used.map((f) => f.height));
const rows = srcRows.length;
const atlasW = cellW * cols;
const atlasH = cellH * rows;

console.log(`\natlas     ${atlasW}x${atlasH}  cell ${cellW}x${cellH}  ${used.length} frames`);

// Build the recoloured palette once - index 0 is the transparent key.
//
// The HSV shift applies ONLY inside the sprite's user-palette range. That is the whole
// point of userPaletteStart/userPalette: the uniform recolours, the helmet, skin and
// shadow do not. Shifting all 256 entries turns the grey shadow teal.
const uStart = header.userPaletteStart;
const uEnd = header.userPalette > 0 ? uStart + header.userPalette : uStart;
const recolour = HSV.some((n) => n !== 0) && header.userPalette > 0;
if (HSV.some((n) => n !== 0) && header.userPalette === 0) {
  console.warn('warning: sprite declares no user-palette range, ignoring --hsv');
}

// The last shadowCount indices are shadow, not colour: the engine darkens the
// destination through them. Rendering them as their palette colour is what turns the
// shadow into a solid grey blob. Alpha ramp matches the studio's renderer.
const shadowIndex = 256 - header.shadowCount;

// The uniform is the near-grey ramp inside the user palette. The other ramps in that
// range are fixed accents - the red helmet and the blue boots/pack - and recolouring
// them along with the uniform is wrong. Detected by saturation rather than assumed, so
// this holds for sprites whose ramps sit in a different order.
const uniformBand = [];
if (header.userPalette > 0) {
  for (let i = uStart; i < uEnd; i++) {
    const argb = palette[i];
    const r = (argb >> 16) & 0xff, g = (argb >> 8) & 0xff, b = argb & 0xff;
    const { s: sat } = rgbToHsv(r, g, b);
    if (sat < 0.35) uniformBand.push(i);
  }
}
if (TINT) {
  console.log(`tint      hue ${TINT[0]} sat ${TINT[1] ?? 0.55} value x${TINT[2] ?? 1}`);
  console.log(`uniform   ${uniformBand.length} palette entries (${uniformBand[0]}..${uniformBand[uniformBand.length - 1]})`);
}

const tintSet = new Set(uniformBand);

const rgbaPalette = new Uint8Array(256 * 4);
for (let i = 0; i < 256; i++) {
  if (header.shadowCount > 0 && i >= shadowIndex) {
    const t = (i - shadowIndex + 1) / header.shadowCount;
    rgbaPalette[i * 4] = 0;
    rgbaPalette[i * 4 + 1] = 0;
    rgbaPalette[i * 4 + 2] = 0;
    rgbaPalette[i * 4 + 3] = Math.min(255, Math.round(20 + t * 50));
    continue;
  }

  const argb = palette[i];
  let r = (argb >> 16) & 0xff, g = (argb >> 8) & 0xff, b = argb & 0xff;

  if (TINT && tintSet.has(i)) {
    // Keep each entry's brightness so the ramp still shades; replace hue and saturation.
    const { v } = rgbToHsv(r, g, b);
    const hue = (((TINT[0] % 360) + 360) % 360) / 360;
    const sat = TINT[1] === undefined ? 0.55 : TINT[1];
    const val = Math.min(1, v * (TINT[2] === undefined ? 1 : TINT[2]));
    [r, g, b] = hsvToRgb(hue, sat, val);
  } else if (recolour && i >= uStart && i < uEnd) {
    [r, g, b] = shiftHsv([r, g, b], HSV);
  }
  rgbaPalette[i * 4] = r;
  rgbaPalette[i * 4 + 1] = g;
  rgbaPalette[i * 4 + 2] = b;
  rgbaPalette[i * 4 + 3] = i === 0 ? 0 : 255;
}

const rgba = Buffer.alloc(atlasW * atlasH * 4);
const frameMap = [];

used.forEach((f, i) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  // Centre each frame in its cell so the character does not jitter between frames.
  const ox = col * cellW + Math.floor((cellW - f.width) / 2);
  const oy = row * cellH + Math.floor((cellH - f.height) / 2);

  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const idx = f.pixels[y * f.width + x];
      if (idx === 0) continue; // transparent
      const d = ((oy + y) * atlasW + (ox + x)) * 4;
      const a = rgbaPalette[idx * 4 + 3];
      if (a === 0) continue;
      rgba[d] = rgbaPalette[idx * 4];
      rgba[d + 1] = rgbaPalette[idx * 4 + 1];
      rgba[d + 2] = rgbaPalette[idx * 4 + 2];
      rgba[d + 3] = a;
    }
  }

  frameMap.push({ row, col, x: col * cellW, y: row * cellH, ox: f.x, oy: f.y });
});

fs.mkdirSync(OUT_DIR, { recursive: true });
const pngPath = path.join(OUT_DIR, `${NAME}.png`);
const jsonPath = path.join(OUT_DIR, `${NAME}.json`);

fs.writeFileSync(pngPath, encodePng(atlasW, atlasH, rgba));
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      name: NAME,
      source: `${path.basename(BLO_PATH)}/${entry.name}`,
      hsv: HSV,
      image: `${NAME}.png`,
      cellWidth: cellW,
      cellHeight: cellH,
      rows,
      columns: cols,
      frameCount: used.length,
      // Which of the sprite's original 64 facings each atlas row corresponds to.
      sourceRows: srcRows,
      directionCount: rows,
      animationTime: header.animationTime,
      // 0 usually means rows are facing directions; the renderer treats a row as a
      // direction and a column as a step of that direction's cycle.
      rowMeaning: header.rowMeaning,
      frames: frameMap,
    },
    null,
    2,
  ),
);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1);
console.log(`\nwrote ${pngPath} (${kb(pngPath)} KB)`);
console.log(`wrote ${jsonPath} (${kb(jsonPath)} KB)`);
