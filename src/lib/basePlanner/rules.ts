/**
 * Turret planner rules: the zone's own, ported so a setup that works here works in game.
 *
 * Data comes from public/sprites/base-planner/planner.json (scripts/bake-base-planner.mts):
 * the level's collision/vision bytes for each base, the man hull from ctfpl.veh, and the
 * turrets' computer-vehicle settings. Sources for the logic:
 * - standing / collision: studio weaponTest/vehiclePhysics.ts (isPointSolidForVehicle, physics shapes)
 * - build limits: InfServer ScriptArena.handlePlayerMakeVehicle (density + per-team caps)
 * - line of sight: InfServer Vehicle.Computer.IsPlayerOccluded (Bresenham over vision tiles)
 */

/** Everything you can place: the engineer's turrets, plus medics (not turrets: no build caps, they heal). */
/**
 * Projectiles move with their y velocity squished by 0.7 (infantry.exe, verified in the studio's engine;
 * the server's turret lead-aim divides y by 0.7 for the same reason). So how far a shot reaches is an
 * ellipse: full distance sideways, 70% up and down. Aim radius, density, anti-warp and heal ranges are
 * the server's plain distances and stay circles.
 */
export const ISO_Y = 0.7;

/** World offset (dx, dy) is within `range` of shot travel. */
export const inShotReach = (dx: number, dy: number, range: number) => dx * dx + (dy / ISO_Y) ** 2 <= range * range;

export type TurretKey = 'rocket' | 'mg' | 'sentry' | 'plasma' | 'medic';
/** neutral: a base the CTF script has no flag spot for (K4) */
export type Owner = 'titan' | 'collective' | 'neutral';

export interface TurretType {
  key: TurretKey;
  kind: 'turret' | 'medic';
  label: string;
  vehicle: number;
  name: string;
  image: string;
  frameW: number;
  frameH: number;
  columns: number;
  facings: number;
  anchorX: number;
  anchorY: number;
  radius: number;
  hitpoints: number;
  fireHeight: number;
  barrelLength: number;
  /** the gun (or the medic's kit) */
  weapon: string | null;
  /** how far one shot flies; the turret only AIMS within fireRadius */
  shotRange: number;
  fireDelay: number;
  /** min range: shots can't hit anyone this close (barrel + muzzle speed x inactive ticks), along the shot */
  deadRange: number;
  inactiveTicks: number;
  /** medics: everyone on the team within this many px is healed (walls don't matter) */
  healRadius: number;
  healAmount?: number;
  healTicks?: number;
  fireRadius: number;
  trackingRadius: number;
  obeyLos: boolean;
  antiWarpRadius: number;
  densityRadius: number;
  maxTypeInArea: number;
  maxInArea: number;
  maxTypeOnTeam: number;
  /** maxTypeByPlayerRegardlessOfTeam: one engineer can't own more than this */
  maxPerEngineer: number;
  /** below this much health the turret stops working */
  hpToOperate: number;
}

export interface FlagSprite { image: string; frameW: number; frameH: number; frames: number; frameMs: number }

export interface PlannerBase {
  id: string;
  owner: Owner;
  x0: number;
  y0: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  image: string;
  flag: { x: number; y: number } | null;
  /** where "reachable on foot" is measured from: the flag, or the middle of a flagless base */
  seed: { x: number; y: number };
  /** base64, one PhysicsVision byte per 16px tile: physics = b & 0x1F, vision = b >> 5 */
  tiles: string;
  /** tile indices covered by LIO doors (the level bakes them closed) */
  doors: number[];
}

export interface PlannerData {
  map: string;
  tile: number;
  physicsLow: number[];
  physicsHigh: number[];
  man: { radius: number; lowZ: number; highZ: number };
  flags: Record<'titan' | 'collective', FlagSprite>;
  turrets: TurretType[];
  bases: PlannerBase[];
}

export interface Turret { id: string; type: TurretKey; x: number; y: number; facing: number }

export interface Grid {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  tile: number;
  bytes: Uint8Array;
  physicsLow: number[];
  physicsHigh: number[];
}

export function decodeGrid(base: PlannerBase, data: Pick<PlannerData, 'tile' | 'physicsLow' | 'physicsHigh'>): Grid {
  const raw = atob(base.tiles);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { x0: base.x0, y0: base.y0, cols: base.cols, rows: base.rows, tile: data.tile, bytes, physicsLow: data.physicsLow, physicsHigh: data.physicsHigh };
}

// ── collision ───────────────────────────────────────────────────────────────

/** Physics value -> shape: -1 open, 0 square, 1-4 the diagonal halves (SE, SW, NE, NW). */
function physicsShape(p: number): number {
  if (p === 0) return -1;
  if (p >= 26) return 0;
  return (p - 1) % 5;
}

/** Is world point (x, y) inside something that blocks a hull spanning lowZ..highZ? Off the grid counts as solid. */
export function pointSolid(g: Grid, x: number, y: number, lowZ: number, highZ: number): boolean {
  const lx = x - g.x0, ly = y - g.y0;
  const tx = Math.floor(lx / g.tile), ty = Math.floor(ly / g.tile);
  if (tx < 0 || ty < 0 || tx >= g.cols || ty >= g.rows) return true;
  const p = g.bytes[ty * g.cols + tx] & 0x1f;
  if (p === 0) return false;
  const wallLow = g.physicsLow[p] ?? 0, wallHigh = g.physicsHigh[p] ?? 1024;
  if (highZ < wallLow || lowZ > wallHigh) return false;
  return inShape(g, p, lx - tx * g.tile, ly - ty * g.tile);
}

/** Does a shot flying at height z stop at world point (x, y)? Half-open band: low <= z < high, so a shot
 *  exactly at a wall's height passes over it (studio parity audit of the client's projectile code). */
export function shotBlockedAt(g: Grid, x: number, y: number, z: number): boolean {
  const lx = x - g.x0, ly = y - g.y0;
  const tx = Math.floor(lx / g.tile), ty = Math.floor(ly / g.tile);
  if (tx < 0 || ty < 0 || tx >= g.cols || ty >= g.rows) return false;
  const p = g.bytes[ty * g.cols + tx] & 0x1f;
  if (p === 0) return false;
  if (z < (g.physicsLow[p] ?? 0) || z >= (g.physicsHigh[p] ?? 1024)) return false;
  return inShape(g, p, lx - tx * g.tile, ly - ty * g.tile);
}

/** A flat shot at height z from (fx, fy) reaches (tx, ty) without hitting a wall tall enough to stop it. */
export function shotClear(g: Grid, fx: number, fy: number, tx: number, ty: number, z: number): boolean {
  const steps = Math.ceil(Math.hypot(tx - fx, ty - fy) / 4);
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    if (shotBlockedAt(g, fx + (tx - fx) * f, fy + (ty - fy) * f, z)) return false;
  }
  return true;
}

/** Point (fx, fy) inside a tile of physics p: square tiles are solid throughout, diagonals on one half. */
function inShape(g: Grid, p: number, fx: number, fy: number): boolean {
  const shape = physicsShape(p);
  if (shape <= 0) return shape === 0;
  const t = g.tile;
  switch (shape) {
    case 1: return fx + fy <= t;      // solid NW half
    case 2: return fx >= fy;          // solid NE half
    case 3: return fx <= fy;          // solid SW half
    default: return fx + fy >= t;     // solid SE half
  }
}

const RING = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)] as const);

/** Can a hull of radius r stand with its centre at (x, y)? Centre plus 16 points on its rim. */
export function hullFits(g: Grid, x: number, y: number, r: number, lowZ: number, highZ: number): boolean {
  if (pointSolid(g, x, y, lowZ, highZ)) return false;
  for (const [cx, cy] of RING) if (pointSolid(g, x + cx * r, y + cy * r, lowZ, highZ)) return false;
  return true;
}

export interface Placement {
  grid: Grid;
  man: PlannerData['man'];
  types: Record<TurretKey, TurretType>;
  /** floor an engineer can walk to (reachableFrom); without it every open tile counts */
  reach?: Uint8Array;
}

/**
 * Tiles reachable on foot from (x, y): open floor, one-way gates and door tiles, 4-way. Keeps turrets
 * out of the void around a base, which is open in the collision layer but nobody can get to.
 */
export function reachableFrom(g: Grid, x: number, y: number, doors: number[] = []): Uint8Array {
  const n = g.cols * g.rows, out = new Uint8Array(n), door = new Uint8Array(n);
  for (const i of doors) if (i >= 0 && i < n) door[i] = 1;
  const pass = (i: number) => { const p = g.bytes[i] & 0x1f; return p === 0 || (p >= 26 && p <= 29) || door[i] === 1; };
  let c0 = Math.floor((x - g.x0) / g.tile), r0 = Math.floor((y - g.y0) / g.tile);
  if (c0 < 0 || r0 < 0 || c0 >= g.cols || r0 >= g.rows) return out;
  // a seed that lands on a wall starts from the nearest open tile instead
  if (!pass(r0 * g.cols + c0)) {
    let best = -1, bestD = Infinity;
    for (let r = Math.max(0, r0 - 24); r <= Math.min(g.rows - 1, r0 + 24); r++) for (let c = Math.max(0, c0 - 24); c <= Math.min(g.cols - 1, c0 + 24); c++) {
      const d = (c - c0) ** 2 + (r - r0) ** 2;
      if (d < bestD && pass(r * g.cols + c)) { bestD = d; best = r * g.cols + c; }
    }
    if (best < 0) return out;
    c0 = best % g.cols; r0 = (best / g.cols) | 0;
  }
  const stack = [r0 * g.cols + c0];
  out[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!, c = i % g.cols, r = (i / g.cols) | 0;
    if (c > 0 && !out[i - 1] && pass(i - 1)) { out[i - 1] = 1; stack.push(i - 1); }
    if (c < g.cols - 1 && !out[i + 1] && pass(i + 1)) { out[i + 1] = 1; stack.push(i + 1); }
    if (r > 0 && !out[i - g.cols] && pass(i - g.cols)) { out[i - g.cols] = 1; stack.push(i - g.cols); }
    if (r < g.rows - 1 && !out[i + g.cols] && pass(i + g.cols)) { out[i + g.cols] = 1; stack.push(i + g.cols); }
  }
  return out;
}

const tileAt = (g: Grid, x: number, y: number) => Math.floor((y - g.y0) / g.tile) * g.cols + Math.floor((x - g.x0) / g.tile);

/** A turret is built where its engineer stands, and the engineer can't stand inside a wall or another turret. */
export function spotIsFree(pl: Placement, type: TurretKey, x: number, y: number, others: Turret[]): boolean {
  if (!hullFits(pl.grid, x, y, pl.man.radius, pl.man.lowZ, pl.man.highZ)) return false;
  if (pl.reach && !pl.reach[tileAt(pl.grid, x, y)]) return false;
  const r = pl.types[type].radius;
  for (const o of others) {
    const min = r + pl.types[o.type].radius;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < min * min) return false;
  }
  return true;
}

/** The free spot nearest (x, y), searching outward up to maxDist px; null if there is none that close. */
export function nearestFreeSpot(pl: Placement, type: TurretKey, x: number, y: number, others: Turret[], maxDist = 48): { x: number; y: number } | null {
  const rx = Math.round(x), ry = Math.round(y);
  if (spotIsFree(pl, type, rx, ry, others)) return { x: rx, y: ry };
  for (let d = 1; d <= maxDist; d++) {
    const steps = Math.max(8, Math.ceil(2 * Math.PI * d));
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
      if (!spotIsFree(pl, type, px, py, others)) continue;
      const dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd < bestD) { bestD = dd; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * A free spot near (x, y) by WALKING distance (open tiles, 4-way), so it stays on the same side of a
 * wall: tile centres in walking order, preferring one at least `spread` px from every other turret.
 */
export function walkableSpotNear(pl: Placement, type: TurretKey, x: number, y: number, others: Turret[], spread = 40, maxTiles = 600): { x: number; y: number } | null {
  const g = pl.grid, T = g.tile;
  const sc = Math.floor((x - g.x0) / T), sr = Math.floor((y - g.y0) / T);
  if (sc < 0 || sr < 0 || sc >= g.cols || sr >= g.rows) return null;
  const seen = new Uint8Array(g.cols * g.rows), queue = [sr * g.cols + sc];
  seen[queue[0]] = 1;
  let fallback: { x: number; y: number } | null = null;
  for (let qi = 0; qi < queue.length && qi < maxTiles; qi++) {
    const i = queue[qi], c = i % g.cols, r = (i / g.cols) | 0;
    const px = g.x0 + c * T + T / 2, py = g.y0 + r * T + T / 2;
    if (spotIsFree(pl, type, px, py, others)) {
      if (others.every((o) => (o.x - px) ** 2 + (o.y - py) ** 2 >= spread * spread)) return { x: px, y: py };
      fallback ??= { x: px, y: py };
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, j = nr * g.cols + nc;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || seen[j] || (g.bytes[j] & 0x1f)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return fallback;
}

// ── build limits ────────────────────────────────────────────────────────────

/** Not a game rule (medics are players), just keeps a plan readable. */
export const MAX_MEDICS = 4;

/** The turrets the server counts for a build at (x, y): inside the builder's density circle (ObjTracker.getObjsInRange: d^2 < r^2). */
export function inArea(t: Pick<TurretType, 'densityRadius'>, x: number, y: number, turrets: Turret[]): Turret[] {
  const r2 = t.densityRadius * t.densityRadius;
  return turrets.filter((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < r2);
}

/**
 * Floor where an engineer could stand but the caps forbid building `type` (row-major, grid-sized). With
 * one area this is the whole base once it's full; in a big base it shows where the next area starts.
 */
export function cappedMask(pl: Placement, type: TurretKey, all: Turret[]): Uint8Array {
  const g = pl.grid, T = g.tile, out = new Uint8Array(g.cols * g.rows);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const i = r * g.cols + c;
    if (g.bytes[i] & 0x1f || (pl.reach && !pl.reach[i])) continue;
    if (buildBlocker(pl.types, type, g.x0 + c * T + T / 2, g.y0 + r * T + T / 2, all)) out[i] = 1;
  }
  return out;
}

/**
 * The server's checks when an engineer builds `type` at (x, y), with `others` already standing
 * (all on the same team). Counts are of turrets inside the NEW turret's density radius, so the
 * build order matters exactly as in game: a Sentry (area cap 9) can still go down after the
 * other turrets have filled the area cap of 6 for themselves.
 */
export function buildBlocker(types: Record<TurretKey, TurretType>, type: TurretKey, x: number, y: number, all: Turret[]): string | null {
  const t = types[type];
  if (t.kind === 'medic') return all.filter((o) => o.type === type).length >= MAX_MEDICS ? `${MAX_MEDICS} medics is plenty for one room.` : null;
  const others = all.filter((o) => types[o.type].kind === 'turret');
  const sameTeamType = others.filter((o) => o.type === type).length;
  if (t.maxTypeOnTeam !== -1 && sameTeamType >= t.maxTypeOnTeam) return `Your team can only have ${t.maxTypeOnTeam} ${t.label} turret${t.maxTypeOnTeam === 1 ? '' : 's'}.`;
  const near = inArea(t, x, y, others);
  const nearType = near.filter((o) => o.type === type).length;
  if (t.maxInArea !== -1 && near.length >= t.maxInArea) return `The area already has ${near.length} turrets, and ${t.label} turrets can't be built once it has ${t.maxInArea}.`;
  if (t.maxTypeInArea !== -1 && nearType >= t.maxTypeInArea) return `Only ${t.maxTypeInArea} ${t.label} turret${t.maxTypeInArea === 1 ? '' : 's'} allowed in an area.`;
  return null;
}

// ── line of sight ───────────────────────────────────────────────────────────

/**
 * InfServer IsPlayerOccluded: walk the tiles from the turret to the target (Bresenham, 16px tiles),
 * remember the smallest vision value met (the last one on ties) and where. The target is hidden
 * once it is floor(vision * 1.8) or more tiles past that point; vision 0 everywhere = seen.
 */
export function occluded(g: Grid, fx: number, fy: number, tx: number, ty: number): boolean {
  let x0 = Math.trunc((fx - g.x0) / g.tile), y0 = Math.trunc((fy - g.y0) / g.tile);
  const x1 = Math.trunc((tx - g.x0) / g.tile), y1 = Math.trunc((ty - g.y0) / g.tile);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, count = 0, size = 8, at = 0;
  for (;;) {
    const v = x0 >= 0 && y0 >= 0 && x0 < g.cols && y0 < g.rows ? g.bytes[y0 * g.cols + x0] >> 5 : 0;
    if (v > 0 && v <= size) { size = v; at = count; }
    count++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return !(size === 8 || count < Math.floor(size * 1.8) + at);
}

/**
 * Tiles (row-major, grid-sized) a turret covers: inside its radius, standable, in sight when the turret
 * obeys LOS, and - when shotZ is given - reachable by its shots at that height (an MG at 27 stops at
 * yellow walls, a Rocket at 38 flies over them; orange and red stop both).
 */
export function coverage(pl: Placement, t: Turret, radius: number, useLos: boolean, shotZ?: number): Uint8Array {
  const g = pl.grid, T = g.tile, out = new Uint8Array(g.cols * g.rows);
  const r2 = radius * radius;
  const c0 = Math.max(0, Math.floor((t.x - radius - g.x0) / T)), c1 = Math.min(g.cols - 1, Math.floor((t.x + radius - g.x0) / T));
  const r0 = Math.max(0, Math.floor((t.y - radius - g.y0) / T)), r1 = Math.min(g.rows - 1, Math.floor((t.y + radius - g.y0) / T));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const cx = g.x0 + c * T + T / 2, cy = g.y0 + r * T + T / 2;
    if ((cx - t.x) ** 2 + (cy - t.y) ** 2 > r2) continue;
    if (g.bytes[r * g.cols + c] & 0x1f) continue; // walls: nobody stands there to be shot
    if (pl.reach && !pl.reach[r * g.cols + c]) continue;
    if (useLos && occluded(g, t.x, t.y, cx, cy)) continue;
    if (shotZ !== undefined && !shotClear(g, t.x, t.y, cx, cy, shotZ)) continue;
    out[r * g.cols + c] = 1;
  }
  return out;
}

/** Zone values from fireZones. */
export const ZONE = { AIMED: 1, STRAY: 2, DEAD: 3 } as const;

/**
 * Where a turret's shots can hurt you. AIMED = it targets you here and its shots are live (pass `aimed`,
 * from coverage with LOS and shot height). DEAD = it targets you, but you're inside its min range, so
 * the shot is still inactive when it passes you. STRAY = it never targets you here, but shots fired at
 * someone in front (or that miss) keep flying this far before running out or hitting a wall at their
 * height. Ranges along the shot are ellipses (ISO_Y).
 */
export function fireZones(pl: Placement, t: Turret, shotZ: number, shotRange: number, aimed: Uint8Array, deadRange = 0): Uint8Array {
  const g = pl.grid, T = g.tile, out = Uint8Array.from(aimed);
  const isDead = (x: number, y: number) => deadRange > 0 && inShotReach(x - t.x, y - t.y, deadRange);
  for (let i = 0; i < out.length; i++) {
    if (out[i] && isDead(g.x0 + (i % g.cols) * T + T / 2, g.y0 + ((i / g.cols) | 0) * T + T / 2)) out[i] = ZONE.DEAD;
  }
  const rays = Math.ceil((2 * Math.PI * Math.min(shotRange, Math.hypot(g.cols * T, g.rows * T))) / 6);
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    // world distance this shot covers along this heading: the squished ellipse
    const reach = Math.min(shotRange / Math.sqrt(dx * dx + (dy / ISO_Y) ** 2), Math.hypot(g.cols * T, g.rows * T));
    let armed = false;
    for (let d = 2; d <= reach; d += 4) {
      const x = t.x + dx * d, y = t.y + dy * d;
      const c = Math.floor((x - g.x0) / T), r = Math.floor((y - g.y0) / T);
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) break;
      if (shotBlockedAt(g, x, y, shotZ)) break;
      const i = r * g.cols + c;
      if (aimed[i]) armed = true;
      else if (armed && !out[i] && !(g.bytes[i] & 0x1f) && (!pl.reach || pl.reach[i]) && !isDead(x, y)) out[i] = ZONE.STRAY;
    }
  }
  return out;
}

// ── share links ─────────────────────────────────────────────────────────────

const LETTER: Record<TurretKey, string> = { rocket: 'r', mg: 'm', sentry: 's', plasma: 'p', medic: 'h' };
const FROM_LETTER: Record<string, TurretKey> = { r: 'rocket', m: 'mg', s: 'sentry', p: 'plasma', h: 'medic' };

/** "r412.390.12_m300.388.40": type letter, base-local x.y, facing. */
export function encodeSetup(base: Pick<PlannerBase, 'x0' | 'y0'>, turrets: Turret[]): string {
  return turrets.map((t) => `${LETTER[t.type]}${Math.round(t.x - base.x0)}.${Math.round(t.y - base.y0)}.${t.facing}`).join('_');
}

export function decodeSetup(base: Pick<PlannerBase, 'x0' | 'y0' | 'w' | 'h'>, s: string, facings = 64): Turret[] {
  const out: Turret[] = [];
  for (const part of s.split('_')) {
    const m = /^([rmsph])(\d+)\.(\d+)(?:\.(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const x = +m[2], y = +m[3];
    if (x >= base.w || y >= base.h) continue;
    out.push({ id: `t${out.length}-${part}`, type: FROM_LETTER[m[1]], x: base.x0 + x, y: base.y0 + y, facing: Math.min(facings - 1, +(m[4] ?? 0)) });
  }
  return out;
}

/** Facing frame (0 = north, clockwise) pointing from (x, y) toward (tx, ty). */
export function facingToward(x: number, y: number, tx: number, ty: number, facings = 64): number {
  const a = Math.atan2(tx - x, -(ty - y)); // 0 north, clockwise
  return ((Math.round((a / (Math.PI * 2)) * facings) % facings) + facings) % facings;
}
