#!/usr/bin/env -S npx tsx
/**
 * Bakes the assets for /base-planner: one image per Twin Peaks base, the level's collision and
 * vision for each base, and the engineer turrets as 64-facing sprite atlases.
 *
 * Offline only (like bake-infantry-atlas.mjs) - the outputs are committed, the site never parses
 * game files. Unlike that script this one borrows the parsers from the infantry-cfs-studio checkout
 * next to this repo, because porting the LVL / LIO / VEH readers here would buy nothing.
 *
 *   npx tsx scripts/bake-base-planner.mts            (from the repo root)
 *
 * Sources, all from the CTF zone (ctfpl.cfg -> ctfdls4.lvl / ctfdls4.lio / ctfpl.veh):
 * - bases: the studio's spectator scenes (BASE_REGIONS, the Alt+1..9 snaps), in that order, then EXTRA_BASES
 * - flag spots and base owners: the CTF gametype script (bases["D7"] = new Base(...), BaseIsTitanOwned)
 * - turrets: the computer vehicles the engineer builds (MG 400, Rocket 401, Sentry 402, Plasma 700)
 *
 * - weapons: each turret's gun from ctfpl.itm (how far its shots fly), and the medic's Medikit
 *
 * Output: public/sprites/base-planner/{bases/<id>.webp, turret-<key>.png, piece-medic.png, flag-<owner>.png, planner.json}
 */
import '../../Infantry-Tools/infantry-cfs-studio/tools/spritegen/lib/imagedata-shim.mts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LVLParser } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/lvl.ts';
import { LIOParser, LioTypeId } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/lio.ts';
import { BLOParser } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/blo.ts';
import { CFSParser } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/cfs.ts';
import { parseVehFile } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/veh.ts';
import { parseItmFile } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/formats/itm.ts';
import { BASE_REGIONS } from '../../Infantry-Tools/infantry-cfs-studio/src/lib/spectator/cameraScenes.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'public', 'sprites', 'base-planner');
const SRV = 'G:\\Users\\Travis\\Desktop\\New folder (2)\\Infantry Online Map Folder\\Infantry-Online-Server-master\\bin';
const ASSETS = path.join(SRV, 'assets');
const CTF_SCRIPT = path.join(SRV, 'scripts', 'GameTypes', 'CTF', 'CTF.cs');
const CLIENT = 'F:\\SteamLibrary\\steamapps\\common\\FreeInfantry';
const LVL = 'ctfDLS4.lvl', LIO = 'ctfdls4.lio', VEH = 'ctfpl.veh', ITM = 'ctfpl.itm';
const MAN_VEHICLE = 112; // ctfpl.veh "Infantry": every man class shares its hull
const T = 16;

// Same light constants as the studio's play mode (weaponTest/lightTuning.ts).
const LIGHT_ALPHA = 0.85, LIGHT_GAMMA = 1.8;

const TURRETS = [
  { key: 'rocket', vehicle: 401, label: 'Rocket' },
  { key: 'mg', vehicle: 400, label: 'MG' },
  { key: 'sentry', vehicle: 402, label: 'Sentry' },
  { key: 'plasma', vehicle: 700, label: 'Plasma' },
] as const;
// The Sentry's job is its "Sentry TD" utility (ctfpl.itm item 26): antiWarpDistance 512.
const SENTRY_ANTI_WARP = 512;
const MEDIKIT = 432;
// Bases the CTF script has no flag spot for, framed by hand from the level (walls with a tile or two of margin).
const EXTRA_BASES: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
  K4: { x0: 12336, y0: 3232, x1: 14288, y1: 4368 }, // the walled compound across K3/K4/L4
};
// The site's Field Medic uniform (scripts/bake-all-classes.sh): man.blo with the grey uniform ramp at hue 50.
const MEDIC_TINT = { hue: 50, sat: 0.7 };

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// ── sprites ─────────────────────────────────────────────────────────────────

const bloCache = new Map<string, { buf: Buffer; blo: any } | null>();
function loadBlo(name: string) {
  const k = name.toLowerCase().replace(/\.blo$/, '');
  if (bloCache.has(k)) return bloCache.get(k)!;
  let found: { buf: Buffer; blo: any } | null = null;
  for (const dir of [CLIENT, ASSETS]) {
    const hit = fs.readdirSync(dir).find((f) => f.toLowerCase() === `${k}.blo`);
    if (!hit) continue;
    const buf = fs.readFileSync(path.join(dir, hit));
    found = { buf, blo: BLOParser.parse(ab(buf)) };
    break;
  }
  bloCache.set(k, found);
  return found;
}
const cfsCache = new Map<string, any>();
function loadCfs(bloName: string, cfsName: string) {
  const k = `${bloName}::${cfsName}`.toLowerCase();
  if (cfsCache.has(k)) return cfsCache.get(k);
  const b = loadBlo(bloName);
  const want = cfsName.toLowerCase().replace(/\.cfs$/, '');
  const e = b?.blo.entries.find((x: any) => x.name.toLowerCase().replace(/\.cfs$/, '') === want);
  const cfs = e ? CFSParser.parse(ab(b!.buf.subarray(e.offset, e.offset + e.size))) : null;
  cfsCache.set(k, cfs);
  return cfs;
}

function lpBand(lp: number): { color?: [number, number, number]; intensity: number } {
  if (lp <= 0 || lp > 95) return { intensity: 1 };
  const colors: [number, number, number][] = [[255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 64, 255]];
  return { color: colors[Math.floor(lp / 24)], intensity: 1 - (lp % 24) / 23 };
}

/** Infantry's HSV shift (Gibbed SpriteAnimator / the studio's InfantryHSVFilter): hue h/100 turns,
 *  saturation and value ADDED in hundredths. Only fully opaque pixels; light and shadow are overlays. */
function hsvShift(d: Uint8ClampedArray, hue: number, sat: number, val: number) {
  if (!hue && !sat && !val) return;
  const turn = (hue / 100) * 360;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] !== 255) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta > 0) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    h = (((h + turn) % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, (max === 0 ? 0 : delta / max) + sat / 100));
    const v = Math.max(0, Math.min(1, max + val / 100));
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    d[i] = Math.round((r1 + m) * 255); d[i + 1] = Math.round((g1 + m) * 255); d[i + 2] = Math.round((b1 + m) * 255);
  }
}

interface Frame { data: Uint8ClampedArray; w: number; h: number; fx: number; fy: number; cellW: number; cellH: number; screen: boolean; alpha: number }
function renderFrame(cfs: any, index: number, opts: { hue?: number; sat?: number; val?: number; lp?: number } = {}): Frame | null {
  const fr = cfs?.frames?.[index];
  if (!fr || fr.width <= 0 || fr.height <= 0) return null;
  const h = cfs.header;
  const lightCount = h.lightCount || 0;
  const pureLight = lightCount > 0 && (h.maxSolidIndex ?? 255) <= 1;
  const mixed = lightCount > 0 && !pureLight;
  const band = lpBand(opts.lp ?? 0);
  const transparent = (h.compressionFlags & 0x80) === 0;
  const img = CFSParser.renderFrameToImageData(cfs, index, undefined, transparent, LIGHT_ALPHA, LIGHT_GAMMA, 1, band.color, band.intensity, mixed);
  const data = new Uint8ClampedArray(img.data);
  if (!pureLight) hsvShift(data, opts.hue ?? 0, opts.sat ?? 0, opts.val ?? 0);
  const blit = [1, 0.25, 0.33, 0.5, 0.66, 0.75][h.blitMode ?? 0] ?? 1;
  return { data, w: img.width, h: img.height, fx: fr.x || 0, fy: fr.y || 0, cellW: h.width || img.width, cellH: h.height || img.height, screen: pureLight, alpha: blit };
}

class Canvas {
  data: Uint8ClampedArray;
  constructor(public w: number, public h: number) { this.data = new Uint8ClampedArray(w * h * 4); }
  draw(f: Frame, dx: number, dy: number, alpha = 1) {
    const a0 = f.alpha * alpha;
    for (let y = 0; y < f.h; y++) {
      const cy = dy + y; if (cy < 0 || cy >= this.h) continue;
      for (let x = 0; x < f.w; x++) {
        const cx = dx + x; if (cx < 0 || cx >= this.w) continue;
        const s = (y * f.w + x) * 4, d = (cy * this.w + cx) * 4;
        const sa = f.data[s + 3]; if (!sa) continue;
        if (f.screen) {
          // pure light sprite: brighten what's underneath (the engine ignores its palette colours)
          for (let c = 0; c < 3; c++) this.data[d + c] = 255 - ((255 - this.data[d + c]) * (255 - f.data[s + c] * a0)) / 255;
          continue;
        }
        const af = (sa / 255) * a0, ia = 1 - af;
        for (let c = 0; c < 3; c++) this.data[d + c] = f.data[s + c] * af + this.data[d + c] * ia;
        this.data[d + 3] = Math.min(255, sa * a0 + this.data[d + 3] * ia);
      }
    }
  }
  png() { return sharp(Buffer.from(this.data.buffer), { raw: { width: this.w, height: this.h, channels: 4 } }); }
}

// ── level ───────────────────────────────────────────────────────────────────

const lvl: any = LVLParser.parse(ab(fs.readFileSync(path.join(ASSETS, LVL))), LVL);
if (lvl.offsetX || lvl.offsetY) throw new Error('level has a header offset; base regions assume none');
const lio = LIOParser.parse(fs.readFileSync(path.join(ASSETS, LIO), 'utf8'));
const veh: any = parseVehFile(fs.readFileSync(path.join(ASSETS, VEH), 'latin1'), VEH);
const vehInfo = (id: number) => (veh.vehicles.map((v: any) => v.info ?? v) as any[]).find((v) => v.id === id);
const itm: any = parseItmFile(fs.readFileSync(path.join(ASSETS, ITM), 'latin1'), ITM);
const item = (id: number) => (itm.items.map((i: any) => i.info ?? i) as any[]).find((i) => i.id === id);

/** How far one shot flies: muzzleVelocity/1000 px per tick for |aliveTime| ticks, slowed by
 *  horizontalFriction/10000 per tick (10000 = none), as the studio's projectile sim moves them. */
function shotRange(p: any): number {
  let v = p.muzzleVelocity / 1000, d = 0;
  for (let t = 0; t < Math.abs(p.aliveTime) && v > 0.01; t++) { d += v; if (p.horizontalFriction !== 10000) v = (v * p.horizontalFriction) / 10000; }
  return Math.round(d);
}

/** The projectile a turret actually fires: its first gun, or for a multi-use gun the child that does damage. */
function turretShot(v: any): { name: string; range: number; fireDelay: number } | null {
  const gun = item(v.inventoryItems?.[0]);
  if (!gun) return null;
  const damage = (p: any) => (p?.damageKineticInner ?? 0) + (p?.damageExplosiveInner ?? 0) + (p?.damageEnergyInner ?? 0) + (p?.damageElectronicInner ?? 0);
  const proj = gun.muzzleVelocity !== undefined ? gun
    : (gun.children ?? []).map((c: any) => item(c.itemID)).filter((p: any) => p?.muzzleVelocity !== undefined).sort((a: any, b: any) => damage(b) - damage(a))[0];
  return proj ? { name: gun.name, range: shotRange(proj), fireDelay: gun.fireDelay } : null;
}

// Flag spots and owners straight from the gametype script.
const script = fs.readFileSync(CTF_SCRIPT, 'utf8');
const flagTiles = new Map<string, { x: number; y: number }>();
for (const m of script.matchAll(/bases\["(\w+)"\]\s*=\s*new Base\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g)) flagTiles.set(m[1].toUpperCase(), { x: +m[4], y: +m[5] });
// BaseIsTitanOwned: `case "D7": ... return true;` / `case "A7": ... return false;`
const titanList = script.match(/case "D7":[^\n]*return true;/)?.[0] ?? '';
const collectiveList = script.match(/case "A7":[^\n]*return false;/)?.[0] ?? '';
const owner = (id: string) => (titanList.includes(`"${id}"`) ? 'titan' : collectiveList.includes(`"${id}"`) ? 'collective' : 'neutral');

function entityOrder(e: any) {
  const cfs = loadCfs(lvl.objects[e.objectId]?.fileName ?? '', lvl.objects[e.objectId]?.id ?? '');
  const sortKey = typeof e.sortOrder === 'number' && e.sortOrder >= 0 && e.sortOrder <= 5 ? e.sortOrder : 0;
  const z = e.extraDataMeaning === 1 ? e.extraData ?? 0 : 0;
  const ys = cfs?.header?.ySortAdjust ?? 0, lh = cfs?.header?.height ?? 0;
  const iso = sortKey === 1 || sortKey === 4 ? e.y + lh / 2 + ys + z + e.x * 1e-4 : e.y + ys + z + e.x * 1e-4;
  return { sortKey, iso, z };
}

async function bakeBase(id: string, r: { x0: number; y0: number; x1: number; y1: number }) {
  const W = r.x1 - r.x0, H = r.y1 - r.y0;
  const tx0 = r.x0 / T, ty0 = r.y0 / T, cols = W / T, rows = H / T;
  const cv = new Canvas(W, H);

  // floor: each 16px tile samples its floor texture at the tile's world phase (seamless)
  for (let ty = ty0; ty < ty0 + rows; ty++) for (let tx = tx0; tx < tx0 + cols; tx++) {
    const t = lvl.tiles[ty * lvl.width + tx]; if (!t) continue;
    const fl = lvl.floors[t.bitsA & 0x7f]; if (!fl?.fileName) continue;
    const cfs = loadCfs(fl.fileName, fl.id); if (!cfs?.frames?.length) continue;
    const img = CFSParser.renderFrameToImageData(cfs, cfs.frames.length > 1 ? t.bitsB % cfs.frames.length : 0, undefined, false);
    const sx0 = (tx * T) % img.width, sy0 = (ty * T) % img.height;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const s = (((sy0 + y) % img.height) * img.width + ((sx0 + x) % img.width)) * 4;
      const d = (((ty - ty0) * T + y) * W + (tx - tx0) * T + x) * 4;
      cv.data[d] = img.data[s]; cv.data[d + 1] = img.data[s + 1]; cv.data[d + 2] = img.data[s + 2]; cv.data[d + 3] = 255;
    }
  }

  // objects, in the level's draw order (studio LvlPreviewPixi: layer, then depth)
  const ents = lvl.entities
    .filter((e: any) => e.x >= r.x0 - 256 && e.x < r.x1 + 256 && e.y >= r.y0 - 256 && e.y < r.y1 + 256)
    .map((e: any) => ({ e, ...entityOrder(e) }))
    .sort((a: any, b: any) => a.sortKey - b.sortKey || ((a.sortKey === 1 || a.sortKey === 4) ? a.iso - b.iso : a.e.y - b.e.y || a.e.x - b.e.x));
  let drawn = 0;
  for (const { e, z } of ents) {
    const o = lvl.objects[e.objectId]; if (!o?.fileName) continue;
    const cfs = loadCfs(o.fileName, o.id); if (!cfs) continue;
    const f = renderFrame(cfs, e.frameIndex, { hue: e.hue, sat: e.saturation, val: e.value, lp: (e.rawBitsC >> 23) & 0x7f });
    if (!f) continue;
    const alpha = [1, 0.5, 0.33, 0.25][e.transluency ?? 0] ?? 1;
    cv.draw(f, e.x - r.x0 + f.fx, e.y - r.y0 + f.fy - z, alpha);
    drawn++;
  }

  // LIO doors (drawn closed, which is also what the level's collision bakes). Their collision tiles
  // are exported so the planner can walk through them when working out which floor is reachable.
  let doors = 0;
  const doorTiles = new Set<number>();
  for (const en of lio as any[]) {
    if (en.general.type !== LioTypeId.Door) continue;
    const x = en.general.offsetX, y = en.general.offsetY;
    if (x < r.x0 - 160 || x >= r.x1 + 160 || y < r.y0 - 160 || y >= r.y1 + 160) continue;
    const d = en.typeData;
    const dtx = Math.floor(x / T), dty = Math.floor(y / T); // lioSystem.initDoorPhysics
    for (let py = 0; py < Math.max(1, d.physicsHeight); py++) for (let px = 0; px < Math.max(1, d.physicsWidth); px++) {
      const c = dtx + d.relativePhysicsTileX + px - tx0, rr = dty + d.relativePhysicsTileY + py - ty0;
      if (c >= 0 && rr >= 0 && c < cols && rr < rows) doorTiles.add(rr * cols + c);
    }
    const g = d?.graphic; if (!g?.blobName || g.blobName === 'None') continue;
    const cfs = loadCfs(g.blobName, g.blobId); const f = cfs && renderFrame(cfs, 0, { hue: g.hue, sat: g.saturation, val: g.value, lp: g.lightPermutation });
    if (!f) continue;
    cv.draw(f, Math.round(x - f.cellW / 2) - r.x0 + f.fx, Math.round(y - f.cellH / 2) - r.y0 + f.fy);
    doors++;
  }

  fs.mkdirSync(path.join(OUT, 'bases'), { recursive: true });
  await cv.png().webp({ quality: 90, effort: 6 }).toFile(path.join(OUT, 'bases', `${id}.webp`));

  // collision + vision exactly as the server reads them: one PhysicsVision byte per tile (bitsC & 0xFF)
  const tiles = Buffer.alloc(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) tiles[y * cols + x] = lvl.tiles[(ty0 + y) * lvl.width + tx0 + x].bitsC & 0xff;

  const ft = flagTiles.get(id);
  console.log(`${id}: ${W}x${H}px, ${drawn} objects, ${doors} doors (${doorTiles.size} tiles), flag ${ft ? `${ft.x},${ft.y}` : 'none'} (${owner(id)})`);
  return {
    id, owner: owner(id), x0: r.x0, y0: r.y0, w: W, h: H, cols, rows,
    image: `bases/${id}.webp`,
    flag: ft ? { x: ft.x * T, y: ft.y * T } : null,
    // where "reachable on foot" is measured from: the flag, or the middle of a flagless base
    seed: ft ? { x: ft.x * T + 8, y: ft.y * T + 8 } : { x: Math.round((r.x0 + r.x1) / 2), y: Math.round((r.y0 + r.y1) / 2) },
    tiles: tiles.toString('base64'),
    doors: [...doorTiles].sort((a, b) => a - b),
  };
}

// ── turrets ─────────────────────────────────────────────────────────────────

/** Base under head, both centred on the vehicle position (studio play mode), one cell per facing. */
async function bakeTurret(t: (typeof TURRETS)[number]) {
  const v = vehInfo(t.vehicle);
  if (!v) throw new Error(`vehicle ${t.vehicle} missing from ${VEH}`);
  const baseCfs = loadCfs(v.spriteBase.blobName, v.spriteBase.blobId);
  const headCfs = loadCfs(v.spriteTurret.blobName, v.spriteTurret.blobId);
  if (!baseCfs || !headCfs) throw new Error(`sprites missing for ${t.key}`);
  const dirs = headCfs.header.rowCount * headCfs.header.columnCount;
  const cell = Math.max(baseCfs.header.width, baseCfs.header.height, headCfs.header.width, headCfs.header.height);
  const sb = v.spriteBase.hsv, sh = v.spriteTurret.hsv;
  const base = renderFrame(baseCfs, 0, { hue: sb.hue, sat: sb.saturation, val: sb.value, lp: v.spriteBase.lightPermutation });
  const frames: Canvas[] = [];
  for (let i = 0; i < dirs; i++) {
    const c = new Canvas(cell, cell);
    if (base) c.draw(base, Math.round(cell / 2 - base.cellW / 2) + base.fx, Math.round(cell / 2 - base.cellH / 2) + base.fy);
    const head = renderFrame(headCfs, i, { hue: sh.hue, sat: sh.saturation, val: sh.value, lp: v.spriteTurret.lightPermutation });
    if (head) c.draw(head, Math.round(cell / 2 - head.cellW / 2) + head.fx, Math.round(cell / 2 - head.cellH / 2) + head.fy);
    frames.push(c);
  }
  const { atlas, fw, fh, gridCols, minX, minY } = packFacings(frames, cell);
  await atlas.png().png({ compressionLevel: 9 }).toFile(path.join(OUT, `turret-${t.key}.png`));
  const shot = t.key === 'sentry' ? null : turretShot(v); // the sentry's "gun" is only a warning beep
  console.log(`${t.key}: vehicle ${v.id} "${v.name}", ${dirs} facings, frame ${fw}x${fh}${shot ? `, ${shot.name} shots fly ${shot.range}px` : ''}`);
  return {
    key: t.key, label: t.label, vehicle: v.id, name: v.name,
    image: `turret-${t.key}.png`, frameW: fw, frameH: fh, columns: gridCols, facings: dirs,
    // where the vehicle position sits inside a frame
    anchorX: cell / 2 - minX, anchorY: cell / 2 - minY,
    radius: v.physicalRadius, hitpoints: v.hitpoints,
    kind: 'turret',
    // shots fly flat at this height; a wall stops them when its physics band holds it
    fireHeight: v.fireHeight, barrelLength: v.barrelLength,
    // a turret only aims inside fireRadius, but its shots keep going this far
    weapon: shot?.name ?? null, shotRange: shot?.range ?? 0, fireDelay: shot?.fireDelay ?? 0,
    healRadius: 0,
    fireRadius: v.fireRadius, trackingRadius: v.trackingRadius, obeyLos: v.obeyLos !== 0,
    antiWarpRadius: t.key === 'sentry' ? SENTRY_ANTI_WARP : 0,
    densityRadius: v.densityRadius,
    maxTypeInArea: v.frequencyDensityMaxType, maxInArea: v.frequencyDensityMaxActive,
    maxTypeOnTeam: v.frequencyMaxType, maxPerEngineer: v.maxTypeByPlayerRegardlessOfTeam,
    // below this much health the turret stops working
    hpToOperate: v.hitpointsRequiredToOperate,
  };
}

/** Trim every facing to the union of their opaque pixels and lay them out 8 to a row. */
function packFacings(frames: Canvas[], cell: number) {
  let minX = cell, minY = cell, maxX = -1, maxY = -1;
  for (const c of frames) for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (c.data[(y * cell + x) * 4 + 3]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const fw = maxX - minX + 1, fh = maxY - minY + 1, gridCols = 8, gridRows = Math.ceil(frames.length / gridCols);
  const atlas = new Canvas(fw * gridCols, fh * gridRows);
  frames.forEach((c, i) => {
    const ox = (i % gridCols) * fw, oy = Math.floor(i / gridCols) * fh;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const s = ((minY + y) * cell + minX + x) * 4, d = ((oy + y) * atlas.w + ox + x) * 4;
      for (let k = 0; k < 4; k++) atlas.data[d + k] = c.data[s + k];
    }
  });
  return { atlas, fw, fh, gridCols, minX, minY };
}

const rgbToHsv = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, d = max - min;
  return { s: max === 0 ? 0 : d / max, v: max };
};
const hsvToRgb = (h: number, s: number, v: number) => {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

/** The medic: man.blo's standing frame for each of its 64 facings, uniform tinted like the site's Field Medic. */
async function bakeMedic() {
  const man = loadCfs('man', 'gfx00000');
  if (!man) throw new Error('man.blo/gfx00000 missing');
  const h = man.header, palette = [...man.palette];
  for (let i = h.userPaletteStart; i < h.userPaletteStart + h.userPalette; i++) {
    const argb = palette[i], r = (argb >> 16) & 0xff, g = (argb >> 8) & 0xff, b = argb & 0xff;
    const { s, v } = rgbToHsv(r, g, b);
    if (s >= 0.35) continue; // the red helmet and blue pack ramps stay
    const [nr, ng, nb] = hsvToRgb(MEDIC_TINT.hue / 360, MEDIC_TINT.sat, v);
    palette[i] = ((argb & 0xff000000) | (nr << 16) | (ng << 8) | nb) >>> 0;
  }
  const cfs = { ...man, palette };
  const facings = h.rowCount, cell = Math.max(h.width, h.height);
  const frames: Canvas[] = [];
  for (let row = 0; row < facings; row++) {
    const c = new Canvas(cell, cell), f = renderFrame(cfs, row * h.columnCount);
    if (f) c.draw(f, Math.round(cell / 2 - f.cellW / 2) + f.fx, Math.round(cell / 2 - f.cellH / 2) + f.fy);
    frames.push(c);
  }
  const { atlas, fw, fh, gridCols, minX, minY } = packFacings(frames, cell);
  await atlas.png().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'piece-medic.png'));
  const kit = item(MEDIKIT), m = vehInfo(MAN_VEHICLE);
  // repairDistance < 0 = an area heal of every teammate within |distance| px, walls or not (ScriptArena)
  console.log(`medic: ${facings} facings, frame ${fw}x${fh}, ${kit.name} heals ${kit.repairAmount} within ${-kit.repairDistance}px over ${kit.repairTime} ticks`);
  return {
    key: 'medic', label: 'Medic', kind: 'medic', vehicle: MAN_VEHICLE, name: `Field Medic (${kit.name})`,
    image: 'piece-medic.png', frameW: fw, frameH: fh, columns: gridCols, facings,
    anchorX: cell / 2 - minX, anchorY: cell / 2 - minY,
    radius: m.physicalRadius, hitpoints: 0, fireHeight: 0, barrelLength: 0,
    weapon: kit.name, shotRange: 0, fireDelay: kit.fireDelay,
    fireRadius: 0, trackingRadius: 0, obeyLos: false, antiWarpRadius: 0,
    healRadius: Math.abs(kit.repairDistance), healAmount: kit.repairAmount, healTicks: kit.repairTime,
    densityRadius: 0, maxTypeInArea: -1, maxInArea: -1, maxTypeOnTeam: -1, maxPerEngineer: -1, hpToOperate: 0,
  };
}

async function bakeFlag(row: number, name: string) {
  const cfs = loadCfs('ctf', 'CTF_Flags');
  const n = cfs.header.columnCount;
  const frames = Array.from({ length: n }, (_, c) => renderFrame(cfs, row * n + c)!);
  const cw = cfs.header.width, ch = cfs.header.height;
  const strip = new Canvas(cw * n, ch);
  frames.forEach((f, i) => strip.draw(f, i * cw + f.fx, f.fy));
  await strip.png().png({ compressionLevel: 9 }).toFile(path.join(OUT, `flag-${name}.png`));
  return { image: `flag-${name}.png`, frameW: cw, frameH: ch, frames: n, frameMs: cfs.header.animationTime };
}

// ── main ────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT, { recursive: true });
const regions = BASE_REGIONS['ctfdls4.lvl'];
const bases = [];
for (const [id, r] of [...Object.entries(regions), ...Object.entries(EXTRA_BASES)]) bases.push(await bakeBase(id, r));
const turrets = [];
for (const t of TURRETS) turrets.push(await bakeTurret(t));
turrets.push(await bakeMedic());
const man = vehInfo(MAN_VEHICLE);
const planner = {
  _about: 'Baked by scripts/bake-base-planner.mts from ctfdls4.lvl / ctfdls4.lio / ctfpl.veh and the CTF gametype script. tiles = one byte per 16px tile, row-major cols x rows from (x0,y0): physics = b & 0x1F, vision = b >> 5. doors = tile indices of LIO door collision (baked closed in tiles).',
  map: 'Twin Peaks (ctfdls4.lvl)',
  tile: T,
  physicsLow: Array.from(lvl.physicsLow), physicsHigh: Array.from(lvl.physicsHigh),
  man: { radius: man.physicalRadius, lowZ: man.lowZ, highZ: man.highZ },
  flags: { titan: await bakeFlag(0, 'titan'), collective: await bakeFlag(1, 'collective') },
  turrets,
  bases,
};
fs.writeFileSync(path.join(OUT, 'planner.json'), JSON.stringify(planner));
console.log(`man hull r ${man.physicalRadius} z ${man.lowZ}..${man.highZ} -> ${OUT}`);
