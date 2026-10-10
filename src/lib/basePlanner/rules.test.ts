import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_MEDICS, buildBlocker, coverage, decodeGrid, fireZones, decodeSetup, encodeSetup, facingToward, hullFits, nearestFreeSpot,
  occluded, pointSolid, reachableFrom, shotClear, spotIsFree, walkableSpotNear, type Grid, type PlannerData, type Placement, type TurretKey, type TurretType, type Turret,
} from './rules';

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/sprites/base-planner/planner.json'), 'utf8')) as PlannerData;
const types = Object.fromEntries(data.turrets.map((t) => [t.key, t])) as Record<TurretKey, TurretType>;
const base = (id: string) => data.bases.find((b) => b.id === id)!;
const placement = (id: string): Placement => ({ grid: decodeGrid(base(id), data), man: data.man, types });

/** A hand-made grid: '.' open, '#' wall (physics 1, vision v), digits = open with that vision. */
function grid(rows: string[], vision = 1): Grid {
  const cols = rows[0].length;
  const bytes = new Uint8Array(cols * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    bytes[y * cols + x] = ch === '#' ? 1 | (vision << 5) : /\d/.test(ch) ? Number(ch) << 5 : 0;
  }));
  return { x0: 0, y0: 0, cols, rows: rows.length, tile: 16, bytes, physicsLow: data.physicsLow, physicsHigh: data.physicsHigh };
}

const t = (type: TurretKey, x: number, y: number): Turret => ({ id: `${type}${x},${y}`, type, x, y, facing: 0 });

test('the baked data matches the zone', () => {
  assert.deepEqual(data.bases.map((b) => b.id), ['A7', 'D7', 'A5', 'F6', 'F5', 'B8']);
  assert.deepEqual(data.man, { radius: 8, lowZ: 0, highZ: 48 });
  assert.equal(types.rocket.maxTypeInArea, 1);
  assert.equal(types.mg.maxTypeInArea, 2);
  assert.equal(types.sentry.maxTypeInArea, 2);
  for (const b of data.bases) assert.equal(Buffer.from(b.tiles, 'base64').length, b.cols * b.rows);
});

test('every flag spot is somewhere an engineer can stand', () => {
  for (const b of data.bases) {
    const pl = placement(b.id);
    assert.ok(b.flag, `${b.id} has a flag`);
    // the flag sits on the tile's top-left corner; its tile centre must be standable ground
    assert.ok(hullFits(pl.grid, b.flag!.x + 8, b.flag!.y + 8, 0, 0, 48), `${b.id} flag tile is open`);
  }
});

test('walls and the map edge block a hull; open floor does not', () => {
  const g = grid(['....', '.#..', '....', '....']);
  assert.equal(pointSolid(g, 20, 20, 0, 48), true);
  assert.equal(pointSolid(g, 40, 40, 0, 48), false);
  assert.equal(pointSolid(g, -1, 10, 0, 48), true);
  assert.equal(hullFits(g, 36, 36, 8, 0, 48), false, 'rim reaches into the wall tile');
  assert.equal(hullFits(g, 40, 40, 8, 0, 48), true, 'clear of the corner by 11px');
  assert.equal(hullFits(g, 48, 48, 8, 0, 48), true);
});

test('turrets keep a hull apart and the search slides off walls', () => {
  const pl = placement('D7');
  const flag = base('D7').flag!;
  const spot = nearestFreeSpot(pl, 'mg', flag.x, flag.y, [])!;
  assert.ok(spot, 'a spot near the flag');
  assert.ok(spotIsFree(pl, 'mg', spot.x, spot.y, []));
  const others = [t('mg', spot.x, spot.y)];
  assert.equal(spotIsFree(pl, 'rocket', spot.x + 10, spot.y, others), false, 'overlapping turret');
  const next = nearestFreeSpot(pl, 'rocket', spot.x + 10, spot.y, others)!;
  assert.ok(Math.hypot(next.x - spot.x, next.y - spot.y) >= 16);
});

test('auto-placement walks from the flag and stays in its room', () => {
  const pl = placement('D7');
  const f = base('D7').flag!;
  const placed: Turret[] = [];
  for (const k of ['rocket', 'mg', 'mg', 'sentry', 'sentry', 'plasma'] as TurretKey[]) {
    const s = walkableSpotNear(pl, k, f.x + 8, f.y + 8, placed)!;
    assert.ok(s, `room for ${k}`);
    // the flag room's north wall runs along y 7712..7743; the pods room is beyond it
    assert.ok(s.y >= 7744, `${k} at ${s.x},${s.y} is south of the wall`);
    placed.push(t(k, s.x, s.y));
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) >= 40);
});

test('the void outside a base is open collision but not reachable from the flag', () => {
  const b = base('D7'), pl = placement('D7');
  // the two tile columns west of D7's outer wall have physics 0
  assert.equal(spotIsFree(pl, 'rocket', 4060, 7800, []), true, 'open per the collision layer alone');
  const reach = reachableFrom(pl.grid, b.flag!.x + 8, b.flag!.y + 8, b.doors);
  assert.equal(spotIsFree({ ...pl, reach }, 'rocket', 4060, 7800, []), false, 'but nobody can walk there');
  assert.equal(spotIsFree({ ...pl, reach }, 'rocket', 4200, 7800, []), true, 'the flag room is');
  // doors connect the rooms: the D3 lift room at the top of the base is reachable
  assert.equal(reach[Math.floor((6900 - b.y0) / 16) * b.cols + Math.floor((4200 - b.x0) / 16)], 1);
});

test('build caps follow the order of building, like the server', () => {
  const at = (n: number) => t('mg', 100 + n * 20, 100);
  assert.equal(buildBlocker(types, 'rocket', 0, 0, []), null);
  assert.match(buildBlocker(types, 'rocket', 0, 0, [t('rocket', 50, 50)])!, /Only 1 Rocket/);
  assert.match(buildBlocker(types, 'mg', 0, 0, [at(0), at(1)])!, /Only 2 MG/);
  const five = [t('rocket', 0, 0), at(0), at(1), t('plasma', 0, 40), t('plasma', 0, 80)];
  const six = [...five, t('sentry', 40, 40)];
  assert.match(buildBlocker(types, 'plasma', 0, 0, six)!, /already has 6 turrets/);
  assert.equal(buildBlocker(types, 'sentry', 0, 0, six), null, 'sentries have an area cap of 9');
  // medics are players, not turrets: they never count toward a cap
  const medics = [t('medic', 10, 10), t('medic', 20, 20)];
  assert.match(buildBlocker(types, 'plasma', 0, 0, [...six, ...medics])!, /already has 6 turrets/);
  assert.equal(buildBlocker(types, 'plasma', 0, 0, [...five.slice(0, 4), ...medics]), null, '4 turrets + 2 medics is not 6 turrets');
  assert.equal(buildBlocker(types, 'medic', 0, 0, six), null);
  assert.match(buildBlocker(types, 'medic', 0, 0, Array.from({ length: MAX_MEDICS }, (_, i) => t('medic', i, 0)))!, /medics/);
  // out of density range nothing counts
  assert.equal(buildBlocker(types, 'rocket', 5000, 5000, [t('rocket', 0, 0)]), null);
});

test('line of sight is the server rule: vision depth before a target hides', () => {
  // vision-1 wall one tile thick at column 3
  const g = grid(['.........', '.........', '.........'].map((r) => r.slice(0, 3) + '#' + r.slice(4)), 1);
  const c = (tx: number) => tx * 16 + 8;
  assert.equal(occluded(g, c(0), c(1), c(2), c(1)), false, 'before the wall');
  assert.equal(occluded(g, c(0), c(1), c(3), c(1)), true, 'wall tile itself: floor(1.8)+3 = 4 tiles walked');
  assert.equal(occluded(g, c(0), c(1), c(8), c(1)), true, 'behind the wall');
  // vision 3 needs floor(5.4)=5 tiles past it before hiding
  const g3 = grid(['..3......'], 3);
  assert.equal(occluded(g3, c(0), c(0), c(5), c(0)), false, '6 tiles walked < 5 + 2');
  assert.equal(occluded(g3, c(0), c(0), c(6), c(0)), true, '7 tiles walked');
});

test('coverage stops at walls for LOS turrets and ignores them for the sentry', () => {
  const g = grid(['....#....', '....#....', '....#....'], 1);
  const pl: Placement = { grid: g, man: data.man, types };
  const tur = t('mg', 8, 24);
  const los = coverage(pl, tur, 400, true), anti = coverage(pl, tur, 400, false);
  assert.equal(los[1 * 9 + 7], 0, 'behind the wall');
  assert.equal(anti[1 * 9 + 7], 1, 'anti-warp ignores walls');
  assert.equal(los[1 * 9 + 4], 0, 'never on a wall tile');
});

test('shots stop at walls whose height band holds them: MG under yellow, Rocket over it, nothing over orange', () => {
  // physics 11 = yellow (high 32), 16 = orange (high 64), with no vision so only the shot matters
  const lane = (p: number) => {
    const bytes = new Uint8Array(9); bytes[4] = p;
    return { x0: 0, y0: 0, cols: 9, rows: 1, tile: 16, bytes, physicsLow: data.physicsLow, physicsHigh: data.physicsHigh } as Grid;
  };
  const fire = (g: Grid, k: TurretKey) => shotClear(g, 8, 8, 8 * 16 + 8, 8, types[k].fireHeight);
  assert.deepEqual([types.mg.fireHeight, types.plasma.fireHeight, types.rocket.fireHeight], [27, 34, 38]);
  assert.equal(fire(lane(11), 'mg'), false, 'MG at 27 hits a yellow wall');
  assert.equal(fire(lane(11), 'rocket'), true, 'Rocket at 38 clears it');
  assert.equal(fire(lane(11), 'plasma'), true, 'Plasma at 34 clears it');
  assert.equal(fire(lane(6), 'mg'), true, 'green (16) stops nothing');
  for (const k of ['mg', 'rocket', 'plasma'] as TurretKey[]) assert.equal(fire(lane(16), k), false, `orange stops ${k}`);
  for (const k of ['mg', 'rocket', 'plasma'] as TurretKey[]) assert.equal(fire(lane(1), k), false, `red stops ${k}`);
});

test('weapons: shots fly further than turrets aim; the medic heals 500px', () => {
  assert.deepEqual([types.mg.shotRange, types.plasma.shotRange, types.rocket.shotRange], [1500, 2000, 5000]);
  for (const k of ['mg', 'plasma', 'rocket'] as TurretKey[]) assert.ok(types[k].shotRange > types[k].fireRadius, `${k} shots outrun its aim`);
  assert.equal(types.medic.kind, 'medic');
  assert.equal(types.medic.healRadius, 500);
});

test('stray fire carries past the aim radius and stops where a wall stops the shot', () => {
  // an open lane 100 tiles long with a yellow wall (physics 11, 32 high) at tile 80
  const cols = 100, bytes = new Uint8Array(cols * 3);
  for (let r = 0; r < 3; r++) bytes[r * cols + 80] = 11;
  const g: Grid = { x0: 0, y0: 0, cols, rows: 3, tile: 16, bytes, physicsLow: data.physicsLow, physicsHigh: data.physicsHigh };
  const pl: Placement = { grid: g, man: data.man, types };
  const zones = (k: TurretKey) => {
    const tur = t(k, 8, 24), ty = types[k];
    return fireZones(pl, tur, ty.fireHeight, ty.shotRange, coverage(pl, tur, ty.fireRadius, true, ty.fireHeight));
  };
  const mg = zones('mg'), rocket = zones('rocket');
  const at = (z: Uint8Array, c: number) => z[1 * cols + c];
  assert.equal(at(mg, 10), 1, 'aimed');
  assert.equal(at(mg, 60), 2, 'MG aims to 800px (tile 50); tile 60 only takes stray fire');
  assert.equal(at(mg, 85), 0, 'the yellow wall stops MG shots');
  assert.equal(at(rocket, 70), 2, 'past the rocket aim (1000px = tile 62)');
  assert.equal(at(rocket, 90), 2, 'rockets fly over yellow walls');
});

test('share strings round-trip in base-local coordinates', () => {
  const b = base('D7');
  const setup = [t('rocket', b.x0 + 100, b.y0 + 200), { ...t('sentry', b.x0 + 5, b.y0 + 6), facing: 40 }];
  const s = encodeSetup(b, setup);
  assert.equal(s, 'r100.200.0_s5.6.40');
  assert.deepEqual(decodeSetup(b, s).map(({ type, x, y, facing }) => ({ type, x, y, facing })), setup.map(({ type, x, y, facing }) => ({ type, x, y, facing })));
  assert.deepEqual(decodeSetup(b, 'x1.2_m99999.1_p1.2'), [{ id: 't0-p1.2', type: 'plasma', x: b.x0 + 1, y: b.y0 + 2, facing: 0 }]);
  assert.equal(decodeSetup(b, encodeSetup(b, [t('medic', b.x0 + 7, b.y0 + 9)]))[0].type, 'medic');
});

test('facing 0 is north and runs clockwise', () => {
  assert.equal(facingToward(0, 0, 0, -10), 0);
  assert.equal(facingToward(0, 0, 10, 0), 16);
  assert.equal(facingToward(0, 0, 0, 10), 32);
  assert.equal(facingToward(0, 0, -10, 0), 48);
});
