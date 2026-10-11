'use client';

/**
 * Turret planner for engineers: drag the turrets an engineer can build around the Twin Peaks
 * flag rooms instead of pasting screenshots into PowerPoint.
 *
 * Everything on the canvas is baked from the game (scripts/bake-base-planner.mts): the base art,
 * the turret sprites (64 facings), and each base's collision and vision tiles. The rules in
 * src/lib/basePlanner/rules.ts are the zone's own, so a turret only lands where an engineer
 * could stand to build it, the area caps match the server, and "sight" is the server's
 * turret line-of-sight test.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { FLAG_ROOMS, type Rect } from '@/lib/basePlanner/flagRooms';
import {
  ISO_Y, ZONE, buildBlocker, cappedMask, coverage, decodeGrid, inArea, decodeSetup, encodeSetup, facingToward, fireZones, nearestFreeSpot, reachableFrom, spotIsFree, walkableSpotNear,
  type Grid, type Placement, type PlannerBase, type PlannerData, type Turret, type TurretKey, type TurretType,
} from '@/lib/basePlanner/rules';

const ASSETS = '/sprites/base-planner/';
const STORE_KEY = 'base-planner:v1';
const ORDER: TurretKey[] = ['rocket', 'mg', 'sentry', 'plasma', 'medic'];
const COLOR: Record<TurretKey, string> = { rocket: '#fb923c', mg: '#22d3ee', sentry: '#a3e635', plasma: '#e879f9', medic: '#34d399' };
const RGB: Record<TurretKey, [number, number, number]> = { rocket: [251, 146, 60], mg: [34, 211, 238], sentry: [163, 230, 53], plasma: [232, 121, 249], medic: [52, 211, 153] };
const OWNER = { titan: { label: 'Titan', color: '#4ade80' }, collective: { label: 'Collective', color: '#f87171' }, neutral: { label: 'No flag', color: '#9ca3af' } } as const;
const BLURB: Record<TurretKey, string> = {
  rocket: 'Splash damage, longest reach',
  mg: 'Fast hitscan fire',
  sentry: 'No gun: teleport disruption, soaks shots',
  plasma: 'Energy bolts, shorter reach',
  medic: 'Not a turret: heals everyone on the team around them',
};
/** How far out to look for floor that can see a medic (the "safe corner" check). */
const SEEN_FROM = 1000;
const ZOOM_MAX = 6;

/** The map editor's physics colours, which are wall heights: green 16, yellow 32, orange 64, purple 128, red/teal solid. */
type WallGroup = 'green' | 'yellow' | 'orange' | 'purple' | 'red' | 'gate';
const wallGroup = (p: number): WallGroup =>
  p >= 26 && p <= 29 ? 'gate' : p >= 30 || p <= 5 ? 'red' : (['green', 'yellow', 'orange', 'purple'] as const)[Math.floor((p - 6) / 5)];
const WALL_COLOR: Record<WallGroup, [number, number, number, number]> = {
  green: [74, 222, 128, 130], yellow: [250, 204, 21, 140], orange: [251, 146, 60, 145], purple: [192, 132, 252, 140], red: [239, 68, 68, 125], gate: [59, 130, 246, 150],
};

type View = 'room' | 'base';
interface Show { sight: boolean; fire: boolean; stray: boolean; minRange: boolean; blind: boolean; antiWarp: boolean; heal: boolean; walls: boolean; labels: boolean }
interface Cam { cx: number; cy: number; z: number }
interface Ghost { type: TurretKey; x: number; y: number; ok: boolean; reason: string | null }
type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Cam; moved: boolean }
  | { kind: 'move'; id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | { kind: 'aim'; id: string }
  | { kind: 'new'; type: TurretKey; sx: number; sy: number; moved: boolean };

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const roomFor = (b: PlannerBase): Rect => FLAG_ROOMS[b.id] ?? { x0: b.x0, y0: b.y0, x1: b.x0 + b.w, y1: b.y0 + b.h };
const wholeBase = (b: PlannerBase): Rect => ({ x0: b.x0, y0: b.y0, x1: b.x0 + b.w, y1: b.y0 + b.h });
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
});

/** "#K4" or "#D7/r12.34.5_m...": the base, and its setup when the link carries one. */
function parseLink(d: PlannerData, hash: string): { base: string; setup: Turret[] | null } | null {
  const m = /^#([A-Za-z]\d+)(?:\/(.*))?$/.exec(hash);
  const b = m && d.bases.find((x) => x.id === m[1].toUpperCase());
  if (!b) return null;
  return { base: b.id, setup: m![2] !== undefined ? decodeSetup(b, decodeURIComponent(m![2])).map((t) => ({ ...t, id: newId() })) : null };
}

function readStore(): { base?: string; setups?: Record<string, string> } {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); } catch { return {}; }
}
function writeStore(v: { base: string; setups: Record<string, string> }) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private mode: the share link still works */ }
}

export default function BasePlanner() {
  const { user } = useAuth();
  const [data, setData] = useState<PlannerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState('D7');
  const [setups, setSetups] = useState<Record<string, Turret[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const [view, setView] = useState<View>('room');
  const [show, setShow] = useState<Show>({ sight: true, fire: false, stray: false, minRange: false, blind: false, antiWarp: false, heal: true, walls: false, labels: false });
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [imgTick, setImgTick] = useState(0);
  const [ready, setReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useRef({ w: 800, h: 560 });
  const cam = useRef<Cam>({ cx: 0, cy: 0, z: 1 });
  const drag = useRef<Drag | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const masks = useRef(new Map<string, Uint8Array>());
  const overlayCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const wallsCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const history = useRef<Record<string, Turret[][]>>({});
  const raf = useRef(0);
  const flagFrame = useRef(0);
  // pointer-up handlers read the ghost from here: the state copy can be a move behind
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = useCallback((g: Ghost | null) => { ghostRef.current = g; setGhostState(g); }, []);

  // ── data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ASSETS}planner.json`);
        if (!res.ok) throw new Error(`planner data: HTTP ${res.status}`);
        const d = (await res.json()) as PlannerData;
        if (cancelled) return;
        // restore: share link first, then this browser's last setups
        const stored = readStore();
        const restored: Record<string, Turret[]> = {};
        for (const b of d.bases) if (stored.setups?.[b.id]) restored[b.id] = decodeSetup(b, stored.setups[b.id]).map((t) => ({ ...t, id: newId() }));
        let first = d.bases.some((b) => b.id === stored.base) ? stored.base! : 'D7';
        const linked = parseLink(d, window.location.hash);
        if (linked) {
          first = linked.base;
          if (linked.setup) restored[linked.base] = linked.setup;
        }
        setData(d);
        setSetups(restored);
        setBaseId(first);
        setReady(true);
        for (const src of [...d.turrets.map((t) => t.image), d.flags.titan.image, d.flags.collective.image]) {
          loadImage(ASSETS + src).then((img) => { images.current.set(src, img); setImgTick((n) => n + 1); }).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load the planner data.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // a planner link followed inside an already-open tab only changes the hash; load it too.
  // (Our own replaceState updates don't fire hashchange.)
  useEffect(() => {
    if (!data) return;
    const onHash = () => {
      const linked = parseLink(data, window.location.hash);
      if (!linked) return;
      if (linked.setup) setSetups((s) => ({ ...s, [linked.base]: linked.setup! }));
      setBaseId(linked.base);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [data]);

  const types = useMemo(() => (data ? (Object.fromEntries(data.turrets.map((t) => [t.key, t])) as Record<TurretKey, TurretType>) : null), [data]);
  const base = useMemo(() => data?.bases.find((b) => b.id === baseId) ?? null, [data, baseId]);
  const grid = useMemo<Grid | null>(() => (data && base ? decodeGrid(base, data) : null), [data, base]);
  const placement = useMemo<Placement | null>(() => {
    if (!data || !grid || !types || !base) return null;
    // only floor an engineer can walk to from the flag counts; the void around a base is open too
    const reach = reachableFrom(grid, base.seed.x, base.seed.y, base.doors);
    return { grid, man: data.man, types, reach };
  }, [data, grid, types, base]);
  const setup = useMemo(() => setups[baseId] ?? [], [setups, baseId]);

  // the base image loads lazily; preload the neighbours once the first is in
  useEffect(() => {
    if (!data || !base) return;
    const want = [base, ...data.bases.filter((b) => b !== base)];
    let cancelled = false;
    (async () => {
      for (const b of want) {
        if (cancelled || images.current.has(b.image)) continue;
        try { const img = await loadImage(ASSETS + b.image); images.current.set(b.image, img); if (!cancelled) setImgTick((n) => n + 1); } catch { /* shown as missing */ }
      }
    })();
    return () => { cancelled = true; };
  }, [data, base]);

  // persist + keep the address bar a share link (debounced: aiming fires many updates, and
  // Safari refuses more than 100 replaceState calls in 30s)
  useEffect(() => {
    if (!data || !base || !ready) return;
    const id = window.setTimeout(() => {
      const enc: Record<string, string> = {};
      for (const b of data.bases) if (setups[b.id]?.length) enc[b.id] = encodeSetup(b, setups[b.id]);
      writeStore({ base: base.id, setups: enc });
      const hash = `#${base.id}${setup.length ? `/${encodeSetup(base, setup)}` : ''}`;
      if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }, 400);
    return () => window.clearTimeout(id);
  }, [data, base, setups, setup, ready]);

  // ── camera ────────────────────────────────────────────────────────────────
  const minZoom = useCallback(() => {
    if (!base) return 0.2;
    const { w, h } = size.current;
    return Math.min(w / base.w, h / base.h) * 0.9;
  }, [base]);

  const clampCam = useCallback((c: Cam): Cam => {
    if (!base) return c;
    const z = Math.min(ZOOM_MAX, Math.max(minZoom(), c.z));
    // keep the view on the base image; when the view is bigger than the base on an axis, centre it
    const hw = size.current.w / 2 / z, hh = size.current.h / 2 / z;
    const axis = (v: number, lo: number, len: number, half: number) => (half * 2 >= len ? lo + len / 2 : Math.min(lo + len - half, Math.max(lo + half, v)));
    return { z, cx: axis(c.cx, base.x0, base.w, hw), cy: axis(c.cy, base.y0, base.h, hh) };
  }, [base, minZoom]);

  const frame = useCallback((r: Rect) => {
    const { w, h } = size.current;
    cam.current = clampCam({ cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, z: Math.min(w / (r.x1 - r.x0), h / (r.y1 - r.y0)) * 0.98 });
  }, [clampCam]);

  const toWorld = useCallback((sx: number, sy: number) => {
    const c = cam.current, { w, h } = size.current;
    return { x: (sx - w / 2) / c.z + c.cx, y: (sy - h / 2) / c.z + c.cy };
  }, []);
  const toScreen = useCallback((x: number, y: number) => {
    const c = cam.current, { w, h } = size.current;
    return { x: (x - c.cx) * c.z + w / 2, y: (y - c.cy) * c.z + h / 2 };
  }, []);

  // ── turrets ───────────────────────────────────────────────────────────────
  const commit = useCallback((next: Turret[]) => {
    const stack = (history.current[baseId] ??= []);
    stack.push(setup);
    if (stack.length > 100) stack.shift();
    setSetups((s) => ({ ...s, [baseId]: next }));
  }, [baseId, setup]);

  const undo = useCallback(() => {
    const prev = history.current[baseId]?.pop();
    if (!prev) return;
    setSetups((s) => ({ ...s, [baseId]: prev }));
    setSelected(null);
  }, [baseId]);

  const say = useCallback((text: string, bad = false) => setNotice({ text, bad }), []);

  /** Where a turret of `type` would land for a pointer at (x, y), and whether it may be built there. */
  const resolveSpot = useCallback((type: TurretKey, x: number, y: number, ignore: string | null): Ghost => {
    if (!placement || !types) return { type, x, y, ok: false, reason: null };
    const others = setup.filter((t) => t.id !== ignore);
    const spot = nearestFreeSpot(placement, type, x, y, others, 40);
    if (!spot) return { type, x, y, ok: false, reason: 'No room to stand here: walls or another turret.' };
    const blocker = buildBlocker(types, type, spot.x, spot.y, others);
    return { type, x: spot.x, y: spot.y, ok: !blocker, reason: blocker };
  }, [placement, types, setup]);

  const addTurret = useCallback((type: TurretKey, at?: { x: number; y: number }) => {
    if (!placement || !types || !base) return;
    let spot = at ?? null;
    if (!spot) {
      // near the flag (or the middle of the turret side) by walking distance, so it lands in that room, spread from the others
      const room = roomFor(base);
      const c = base.flag ? { x: base.flag.x + 8, y: base.flag.y + 8 } : { x: (room.x0 + room.x1) / 2, y: (room.y0 + room.y1) / 2 };
      spot = walkableSpotNear(placement, type, c.x, c.y, setup);
    }
    if (!spot) { say('No free floor near the flag for that turret.', true); return; }
    const blocker = buildBlocker(types, type, spot.x, spot.y, setup);
    if (blocker) { say(blocker, true); return; }
    // new turrets look into the room
    const room = roomFor(base);
    const facing = facingToward(spot.x, spot.y, (room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, types[type].facings);
    const t: Turret = { id: newId(), type, x: spot.x, y: spot.y, facing };
    commit([...setup, t]);
    setSelected(t.id);
    say(`${types[type].label} placed. Drag it, aim it with the handle, or press Delete to remove it.`);
  }, [placement, types, base, setup, commit, say]);

  const removeTurret = useCallback((id: string) => {
    commit(setup.filter((t) => t.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, [setup, commit]);

  const updateTurret = useCallback((id: string, patch: Partial<Turret>, record = true) => {
    const next = setup.map((t) => (t.id === id ? { ...t, ...patch } : t));
    if (record) commit(next); else setSetups((s) => ({ ...s, [baseId]: next }));
  }, [setup, commit, baseId]);

  // ── drawing ───────────────────────────────────────────────────────────────
  /** shotZ: also require the turret's shots to clear the walls at that height */
  const maskFor = useCallback((t: Pick<Turret, 'type' | 'x' | 'y'>, radius: number, los: boolean, shotZ?: number) => {
    if (!placement || !base) return null;
    const key = `${base.id}|${t.type}|${t.x}|${t.y}|${radius}|${los}|${shotZ ?? '-'}`;
    let m = masks.current.get(key);
    if (!m) {
      if (masks.current.size > 300) masks.current.clear();
      m = coverage(placement, { id: '', facing: 0, ...t }, radius, los, shotZ);
      masks.current.set(key, m);
    }
    return m;
  }, [placement, base]);

  // the draw loop runs outside React renders; it reads the latest state from here
  /** per tile: ZONE.AIMED / STRAY / DEAD (see fireZones) */
  const zonesFor = useCallback((t: Pick<Turret, 'type' | 'x' | 'y'>) => {
    if (!placement || !base || !types) return null;
    const ty = types[t.type], aimed = maskFor(t, ty.fireRadius, true, ty.fireHeight);
    if (!aimed) return null;
    const key = `${base.id}|zones|${t.type}|${t.x}|${t.y}`;
    let m = masks.current.get(key);
    if (!m) { m = fireZones(placement, { id: '', facing: 0, ...t }, ty.fireHeight, ty.shotRange, aimed, ty.deadRange); masks.current.set(key, m); }
    return m;
  }, [placement, base, types, maskFor]);

  const live = useRef({ setup, selected, hovered, ghost, show });
  live.current = { setup, selected, hovered, ghost, show };

  /** Turrets as they should look right now: a dragged one sits at its ghost spot. */
  const shownTurrets = useCallback((): (Turret & { pending?: boolean; bad?: boolean })[] => {
    const L = live.current, d = drag.current, g = L.ghost;
    let list: (Turret & { pending?: boolean; bad?: boolean })[] = L.setup;
    if (d?.kind === 'move' && d.moved && g) list = L.setup.map((t) => (t.id === d.id ? { ...t, x: g.x, y: g.y, pending: true, bad: !g.ok } : t));
    if (d?.kind === 'new' && g) list = [...L.setup, { id: '__new', type: g.type, x: g.x, y: g.y, facing: 32, pending: true, bad: !g.ok }];
    return list;
  }, []);

  const focusTurret = useCallback(() => {
    const L = live.current, list = shownTurrets();
    const d = drag.current;
    const id = d?.kind === 'new' ? '__new' : d?.kind === 'move' || d?.kind === 'aim' ? d.id : L.selected ?? L.hovered;
    return list.find((t) => t.id === id) ?? null;
  }, [shownTurrets]);

  const overlay = useCallback((): HTMLCanvasElement | null => {
    if (!base || !types || !grid || !placement) return null;
    const L = live.current, list = shownTurrets(), focus = L.show.sight ? focusTurret() : null;
    const shooters = list.filter((t) => types[t.type].obeyLos && !t.bad);
    // while placing or moving a turret: where the caps forbid that type (the next area starts past it)
    const d = drag.current, placing = d?.kind === 'new' ? d.type : d?.kind === 'move' && d.moved ? L.setup.find((t) => t.id === d.id)?.type ?? null : null;
    const others = d?.kind === 'move' ? L.setup.filter((t) => t.id !== d.id) : L.setup;
    const key = [
      base.id, L.show.fire, L.show.stray, L.show.blind,
      placing ? `${placing}:${others.map((t) => `${t.type}${t.x},${t.y}`).join(';')}` : '-',
      focus ? `${focus.type}${focus.x},${focus.y}` : '-',
      L.show.blind || L.show.fire || L.show.stray ? shooters.map((t) => `${t.type}${t.x},${t.y}`).join(';') : '',
    ].join('|');
    if (overlayCache.current?.key === key) return overlayCache.current.canvas;
    const n = grid.cols * grid.rows;
    const img = new ImageData(grid.cols, grid.rows);
    const paint = (m: Uint8Array | null, [r, g, b]: [number, number, number], a: number, invert = false) => {
      if (!m) return;
      for (let i = 0; i < n; i++) {
        const on = invert ? !m[i] && !(grid.bytes[i] & 0x1f) && (!placement.reach || placement.reach[i]) : m[i];
        if (!on) continue;
        const k = i * 4, prev = img.data[k + 3] / 255, na = a + prev * (1 - a);
        img.data[k] = (r * a + img.data[k] * prev * (1 - a)) / na;
        img.data[k + 1] = (g * a + img.data[k + 1] * prev * (1 - a)) / na;
        img.data[k + 2] = (b * a + img.data[k + 2] * prev * (1 - a)) / na;
        img.data[k + 3] = na * 255;
      }
    };
    if (L.show.stray && shooters.length) {
      // floor only stray shots reach: past a turret's targets, before a wall stops the shot
      const stray = new Uint8Array(n), aimedAny = new Uint8Array(n);
      for (const t of shooters) { const z = zonesFor(t); if (z) for (let i = 0; i < n; i++) { if (z[i] === ZONE.AIMED) aimedAny[i] = 1; else if (z[i] === ZONE.STRAY) stray[i] = 1; } }
      for (let i = 0; i < n; i++) if (aimedAny[i]) stray[i] = 0;
      paint(stray, [249, 115, 22], 0.2);
    }
    if ((L.show.blind || L.show.fire) && shooters.length) {
      // how many turrets can hit each tile (aimed, and past their min range)
      const seen = new Uint8Array(n);
      for (const t of shooters) { const z = zonesFor(t); if (z) for (let i = 0; i < n; i++) if (z[i] === ZONE.AIMED) seen[i]++; }
      if (L.show.fire) for (let c = 1; c <= 4; c++) {
        const band = new Uint8Array(n);
        for (let i = 0; i < n; i++) band[i] = c === 4 ? (seen[i] >= 4 ? 1 : 0) : seen[i] === c ? 1 : 0;
        paint(band, [250, 204, 21], [0, 0.1, 0.2, 0.3, 0.4][c]);
      }
      if (L.show.blind) paint(seen, [239, 68, 68], 0.38, true);
    }
    if (placing && types[placing].kind === 'turret') {
      const ck = `${base.id}|capped|${placing}|${others.map((t) => `${t.type}${t.x},${t.y}`).join(';')}`;
      let m = masks.current.get(ck);
      if (!m) { m = cappedMask(placement, placing, others); masks.current.set(ck, m); }
      paint(m, [239, 68, 68], 0.24);
    }
    // sentries don't shoot: their anti-warp zone is a plain disc, drawn in paintWorld
    if (focus && types[focus.type].obeyLos) {
      const z = zonesFor(focus);
      if (z) {
        paint(z.map((v) => (v === ZONE.STRAY ? 1 : 0)), RGB[focus.type], 0.12);
        paint(z.map((v) => (v === ZONE.AIMED ? 1 : 0)), RGB[focus.type], 0.32);
      }
    }
    // a medic: where enemies could see them from (the heal circle itself is drawn in paintWorld)
    if (focus && types[focus.type].kind === 'medic') paint(maskFor(focus, SEEN_FROM, true), [239, 68, 68], 0.2);
    const c = overlayCache.current?.canvas ?? document.createElement('canvas');
    c.width = grid.cols; c.height = grid.rows;
    c.getContext('2d')!.putImageData(img, 0, 0);
    overlayCache.current = { key, canvas: c };
    return c;
  }, [base, types, grid, placement, shownTurrets, focusTurret, maskFor, zonesFor]);

  const wallsLayer = useCallback((): HTMLCanvasElement | null => {
    if (!base || !grid) return null;
    if (wallsCache.current?.key === base.id) return wallsCache.current.canvas;
    const img = new ImageData(grid.cols, grid.rows);
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      const p = grid.bytes[i] & 0x1f;
      if (p) img.data.set(WALL_COLOR[wallGroup(p)], i * 4);
    }
    const c = document.createElement('canvas');
    c.width = grid.cols; c.height = grid.rows;
    c.getContext('2d')!.putImageData(img, 0, 0);
    wallsCache.current = { key: base.id, canvas: c };
    return c;
  }, [base, grid]);

  /** Paint the scene into ctx, already transformed to world px. Shared by the canvas and the image export. */
  const paintWorld = useCallback((ctx: CanvasRenderingContext2D, z: number, forExport: boolean) => {
    if (!data || !base || !types) return;
    const L = live.current;
    const img = images.current.get(base.image);
    ctx.imageSmoothingEnabled = z < 1;
    if (img) ctx.drawImage(img, base.x0, base.y0, base.w, base.h);
    ctx.imageSmoothingEnabled = false;
    if (L.show.walls) { const w = wallsLayer(); if (w) ctx.drawImage(w, base.x0, base.y0, base.w, base.h); }
    const o = overlay();
    if (o) ctx.drawImage(o, base.x0, base.y0, base.w, base.h);

    const list = shownTurrets();
    const focus = forExport || !L.show.sight ? null : focusTurret();
    // anti-warp is distance only (the server's 3D distance, walls don't matter): a true circle
    for (const t of list) {
      if (t.bad || !types[t.type].antiWarpRadius || !(L.show.antiWarp || t.id === focus?.id)) continue;
      ctx.fillStyle = 'rgba(192,132,252,0.13)';
      ctx.beginPath(); ctx.arc(t.x, t.y, types[t.type].antiWarpRadius, 0, Math.PI * 2); ctx.fill();
      if (t.id !== focus?.id) {
        ctx.save();
        ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = 1.25 / z; ctx.strokeStyle = 'rgba(192,132,252,0.75)';
        ctx.stroke();
        ctx.restore();
      }
    }
    // min range: inside this ellipse a turret's shots are still inactive and pass through you
    for (const t of list) {
      const tt = types[t.type];
      if (t.bad || !tt.obeyLos || !tt.deadRange || !(L.show.minRange || t.id === focus?.id)) continue;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(t.x, t.y, tt.deadRange, tt.deadRange * ISO_Y, 0, 0, Math.PI * 2);
      if (L.show.minRange) { ctx.fillStyle = 'rgba(96,165,250,0.2)'; ctx.fill(); }
      ctx.setLineDash([3 / z, 3 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = 'rgba(147,197,253,0.95)';
      ctx.stroke();
      ctx.restore();
    }
    // medikit: every teammate within the radius is healed, walls or not (the server's getObjsInRange circle)
    for (const t of list) {
      const hr = types[t.type].healRadius;
      if (t.bad || !hr || !(L.show.heal || t.id === focus?.id)) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(52,211,153,0.1)';
      ctx.beginPath(); ctx.arc(t.x, t.y, hr, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([4 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = 'rgba(52,211,153,0.85)';
      ctx.stroke();
      ctx.restore();
    }
    if (focus) {
      const ft = types[focus.type], r = ft.obeyLos ? ft.fireRadius : ft.antiWarpRadius || ft.healRadius || ft.fireRadius;
      ctx.save();
      ctx.setLineDash([10 / z, 6 / z]);
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = COLOR[focus.type];
      ctx.beginPath(); ctx.arc(focus.x, focus.y, r, 0, Math.PI * 2); ctx.stroke();
      if (ft.kind === 'turret' && ft.densityRadius && (focus.id === L.selected || drag.current)) {
        // the area the server counts for a build here
        ctx.save();
        ctx.setLineDash([16 / z, 10 / z]);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#e5e7eb';
        ctx.beginPath(); ctx.arc(focus.x, focus.y, ft.densityRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (ft.obeyLos && ft.shotRange > ft.fireRadius) {
        // where its shots run out: shots travel 0.7x as far up and down
        ctx.setLineDash([2 / z, 8 / z]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.ellipse(focus.x, focus.y, ft.shotRange, ft.shotRange * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // flag + turrets, back to front
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    if (base.flag && base.owner !== 'neutral') {
      const fs = data.flags[base.owner], fimg = images.current.get(fs.image), f = base.flag;
      if (fimg) items.push({ y: f.y, draw: () => ctx.drawImage(fimg, (flagFrame.current % fs.frames) * fs.frameW, 0, fs.frameW, fs.frameH, f.x - fs.frameW / 2, f.y - fs.frameH / 2, fs.frameW, fs.frameH) });
    }
    for (const t of list) {
      const tt = types[t.type], timg = images.current.get(tt.image);
      items.push({
        y: t.y,
        draw: () => {
          const sel = !forExport && (t.id === L.selected || t.id === '__new' || (drag.current?.kind === 'move' && drag.current.id === t.id));
          if (sel || t.bad) {
            ctx.save();
            ctx.lineWidth = 2 / z;
            ctx.strokeStyle = t.bad ? '#ef4444' : COLOR[t.type];
            ctx.fillStyle = t.bad ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.08)';
            ctx.beginPath(); ctx.ellipse(t.x, t.y + 2, 16, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();
          }
          if (timg) {
            const f = Math.max(0, Math.min(tt.facings - 1, t.facing));
            ctx.globalAlpha = t.bad ? 0.45 : 1;
            ctx.drawImage(timg, (f % tt.columns) * tt.frameW, Math.floor(f / tt.columns) * tt.frameH, tt.frameW, tt.frameH, t.x - tt.anchorX, t.y - tt.anchorY, tt.frameW, tt.frameH);
            ctx.globalAlpha = 1;
          }
        },
      });
    }
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
  }, [data, base, types, wallsLayer, overlay, shownTurrets, focusTurret]);

  const aimHandle = useCallback((t: Turret) => {
    const a = (t.facing / (types?.[t.type].facings ?? 64)) * Math.PI * 2;
    const d = Math.max(34, 44 / cam.current.z);
    return { x: t.x + Math.sin(a) * d, y: t.y - Math.cos(a) * d };
  }, [types]);

  const draw = useCallback(() => {
    raf.current = 0;
    const cv = canvasRef.current;
    if (!cv || !base || !types) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1, { w, h } = size.current, c = cam.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(c.z, c.z);
    ctx.translate(-c.cx, -c.cy);
    paintWorld(ctx, c.z, false);
    ctx.restore();

    // screen-space furniture: aim handle, labels
    const L = live.current, list = shownTurrets();
    const sel = list.find((t) => t.id === L.selected);
    if (sel && drag.current?.kind !== 'move') {
      const p = toScreen(sel.x, sel.y), hd = aimHandle(sel), q = toScreen(hd.x, hd.y);
      ctx.save();
      ctx.strokeStyle = COLOR[sel.type];
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.fillStyle = '#0b1220';
      ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLOR[sel.type];
      ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (L.show.labels) {
      ctx.save();
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const placed: { x0: number; x1: number; y: number }[] = [];
      for (const t of [...list].sort((a, b) => a.y - b.y)) {
        const p = toScreen(t.x, t.y), tt = types[t.type], label = tt.hitpoints ? `${tt.label} ${tt.hitpoints}hp` : tt.label, tw = ctx.measureText(label).width + 10;
        // stack labels of turrets standing close together instead of drawing them over each other
        let y = p.y + Math.max(14, 16 * c.z);
        while (placed.some((q) => Math.abs(q.y - y) < 16 && p.x - tw / 2 < q.x1 && p.x + tw / 2 > q.x0)) y += 17;
        placed.push({ x0: p.x - tw / 2, x1: p.x + tw / 2, y });
        ctx.fillStyle = 'rgba(5,7,11,0.78)';
        ctx.beginPath(); ctx.roundRect(p.x - tw / 2, y - 8, tw, 16, 8); ctx.fill();
        ctx.fillStyle = t.bad ? '#fca5a5' : COLOR[t.type];
        ctx.fillText(label, p.x, y + 0.5);
      }
      ctx.restore();
    }
  }, [base, types, paintWorld, shownTurrets, toScreen, aimHandle]);

  const redraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => { redraw(); }, [redraw, setup, selected, hovered, ghost, show, imgTick]);

  // flag flutter
  useEffect(() => {
    if (!data || !base?.flag || base.owner === 'neutral') return;
    const id = window.setInterval(() => { flagFrame.current++; redraw(); }, data.flags[base.owner].frameMs || 140);
    return () => window.clearInterval(id);
  }, [data, base, redraw]);

  // size the canvas to its box; reframe on base / view change
  const reframe = useCallback(() => {
    if (base) frame(view === 'room' ? roomFor(base) : wholeBase(base));
    redraw();
  }, [base, view, frame, redraw]);

  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const prev = size.current;
      size.current = { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
      cv.width = Math.round(size.current.w * dpr);
      cv.height = Math.round(size.current.h * dpr);
      if (prev.w !== size.current.w || prev.h !== size.current.h) reframe();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [reframe, ready]);

  // reframe identity changes with the base and the view, which is exactly when the camera resets
  useEffect(() => { reframe(); }, [reframe]);
  useEffect(() => { setSelected(null); setGhost(null); }, [baseId, setGhost]);

  // ── pointer ───────────────────────────────────────────────────────────────
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const hitTurret = useCallback((sx: number, sy: number): Turret | null => {
    const p = toWorld(sx, sy), z = cam.current.z;
    let best: Turret | null = null, bestD = Infinity;
    for (const t of setup) {
      const d = Math.hypot(t.x - p.x, t.y - 6 - p.y);
      if (d < Math.max(16, 14 / z) && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }, [setup, toWorld]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || !base) return;
    const { sx, sy } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const sel = setup.find((t) => t.id === selected);
    if (sel) {
      const hd = toScreen(aimHandle(sel).x, aimHandle(sel).y);
      if (Math.hypot(hd.x - sx, hd.y - sy) <= 12) {
        // the whole aim drag is one undo step
        (history.current[baseId] ??= []).push(setup);
        drag.current = { kind: 'aim', id: sel.id };
        return;
      }
    }
    const hit = hitTurret(sx, sy);
    if (hit) {
      const p = toWorld(sx, sy);
      drag.current = { kind: 'move', id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y, sx, sy, moved: false };
      setSelected(hit.id);
      return;
    }
    drag.current = { kind: 'pan', sx, sy, cam: { ...cam.current }, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    const d = drag.current;
    if (!d) {
      const h = hitTurret(sx, sy);
      if ((h?.id ?? null) !== hovered) setHovered(h?.id ?? null);
      e.currentTarget.style.cursor = h ? 'grab' : 'default';
      return;
    }
    if (d.kind === 'pan') {
      if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
      cam.current = clampCam({ ...d.cam, cx: d.cam.cx - (sx - d.sx) / d.cam.z, cy: d.cam.cy - (sy - d.sy) / d.cam.z });
      e.currentTarget.style.cursor = 'grabbing';
      redraw();
    } else if (d.kind === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      const p = toWorld(sx, sy), t = setup.find((x) => x.id === d.id);
      if (t) setGhost(resolveSpot(t.type, p.x + d.dx, p.y + d.dy, t.id));
      e.currentTarget.style.cursor = 'grabbing';
    } else if (d.kind === 'aim') {
      const t = setup.find((x) => x.id === d.id), p = toWorld(sx, sy);
      if (t && types) { const f = facingToward(t.x, t.y, p.x, p.y, types[t.type].facings); if (f !== t.facing) updateTurret(t.id, { facing: f }, false); }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.style.cursor = 'default';
    if (!d) return;
    if (d.kind === 'pan' && !d.moved) setSelected(null);
    if (d.kind === 'move' && d.moved) {
      const g = ghostRef.current;
      if (g?.ok) {
        updateTurret(d.id, { x: g.x, y: g.y });
        setNotice(null);
      } else if (g) say(g.reason ?? 'Can\'t build there.', true);
      setGhost(null);
    }
    redraw();
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    const hit = hitTurret(sx, sy);
    if (hit) { e.preventDefault(); removeTurret(hit.id); }
  };

  // wheel zoom around the cursor (non-passive so the page doesn't scroll)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const before = toWorld(sx, sy), c = cam.current;
      const z = Math.min(ZOOM_MAX, Math.max(minZoom(), c.z * Math.exp(-e.deltaY * 0.0015)));
      const { w, h } = size.current;
      cam.current = clampCam({ z, cx: before.x - (sx - w / 2) / z, cy: before.y - (sy - h / 2) / z });
      redraw();
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [toWorld, minZoom, clampCam, redraw, ready]);

  const zoomBy = (f: number) => {
    const c = cam.current;
    cam.current = clampCam({ ...c, z: c.z * f });
    redraw();
  };

  // ── palette drag (works for mouse and touch) ──────────────────────────────
  const onChipDown = (type: TurretKey) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: 'new', type, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const overCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  const onChipMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (d?.kind !== 'new') return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    if (!overCanvas(e)) { if (ghostRef.current) setGhost(null); return; }
    const { sx, sy } = local(e), p = toWorld(sx, sy);
    setGhost(resolveSpot(d.type, p.x, p.y, null));
  };
  const onChipUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current, g = ghostRef.current;
    drag.current = null;
    if (d?.kind !== 'new') return;
    if (!d.moved) addTurret(d.type);
    else if (overCanvas(e) && g) {
      if (g.ok) addTurret(d.type, { x: g.x, y: g.y });
      else say(g.reason ?? 'Can\'t build there.', true);
    }
    setGhost(null);
  };

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (!data) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        const b = data.bases[Number(e.key) - 1];
        if (b) { e.preventDefault(); setBaseId(b.id); }
        return;
      }
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) { setView((v) => (v === 'room' ? 'base' : 'room')); return; }
      const t = setup.find((x) => x.id === selected);
      if (!t || !types || !placement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeTurret(t.id); return; }
      if (e.key === 'Escape') { setSelected(null); return; }
      if (e.key.toLowerCase() === 'r' || e.key === '[' || e.key === ']') {
        const n = types[t.type].facings, step = e.shiftKey || e.key === '[' ? -2 : 2;
        updateTurret(t.id, { facing: (t.facing + step + n) % n });
        return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const a = arrows[e.key];
      if (a) {
        e.preventDefault();
        const step = e.shiftKey ? 8 : 1, x = t.x + a[0] * step, y = t.y + a[1] * step;
        if (spotIsFree(placement, t.type, x, y, setup.filter((o) => o.id !== t.id))) updateTurret(t.id, { x, y });
        else say('A wall or another turret is in the way.', true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, setup, selected, types, placement, undo, removeTurret, updateTurret, say]);

  // ── export ────────────────────────────────────────────────────────────────
  const shareUrl = () => `${window.location.origin}${window.location.pathname}${window.location.hash}`;

  const renderImage = useCallback(async (): Promise<Blob | null> => {
    if (!base) return null;
    // the visible part of the base, at the game's own scale
    const { w, h } = size.current, c = cam.current;
    const x0 = Math.max(base.x0, Math.floor(c.cx - w / 2 / c.z)), y0 = Math.max(base.y0, Math.floor(c.cy - h / 2 / c.z));
    const x1 = Math.min(base.x0 + base.w, Math.ceil(c.cx + w / 2 / c.z)), y1 = Math.min(base.y0 + base.h, Math.ceil(c.cy + h / 2 / c.z));
    const cw = x1 - x0, ch = y1 - y0, bar = 26;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch + bar;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, cw, ch + bar);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip();
    ctx.translate(-x0, -y0);
    paintWorld(ctx, 1, true);
    ctx.restore();
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = OWNER[base.owner].color;
    ctx.fillText(`${base.id} · ${OWNER[base.owner].label}`, 8, ch + bar / 2);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('freeinf.org/base-planner', cw - 8, ch + bar / 2);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }, [base, paintWorld]);

  const copyImage = async () => {
    const blob = await renderImage();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('Image copied. Paste it straight into Discord.');
    } catch {
      downloadBlob(blob);
      say('This browser can\'t copy images, so it was downloaded instead.');
    }
  };
  const downloadBlob = (blob: Blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${baseId}-turrets.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const download = async () => { const b = await renderImage(); if (b) downloadBlob(b); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl()); say('Link copied. Anyone opening it sees this setup.'); } catch { say(shareUrl()); }
  };

  // ── ui ────────────────────────────────────────────────────────────────────
  const counts = useMemo(() => Object.fromEntries(ORDER.map((k) => [k, setup.filter((t) => t.type === k).length])) as Record<TurretKey, number>, [setup]);
  const selectedTurret = setup.find((t) => t.id === selected) ?? null;
  const areaCap = types ? Math.max(...ORDER.filter((k) => types[k].kind === 'turret' && k !== 'sentry').map((k) => types[k].maxInArea)) : 6;
  const turretCount = types ? setup.filter((t) => types[t.type].kind === 'turret').length : 0;
  // the "safe corner" number for a selected medic: how much of the base's floor can see them
  const medicSeenFrom = useMemo(() => {
    const m = selectedTurret && types?.[selectedTurret.type].kind === 'medic' ? maskFor(selectedTurret, SEEN_FROM, true) : null;
    if (!m || !placement?.reach) return null;
    let seen = 0, floor = 0;
    for (let i = 0; i < m.length; i++) if (placement.reach[i] && !(placement.grid.bytes[i] & 0x1f)) { floor++; seen += m[i]; }
    return floor ? Math.round((seen / floor) * 100) : null;
  }, [selectedTurret, types, maskFor, placement]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-5">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-300">Turret Planner</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-3xl">
            Lay out an engineer&apos;s turrets in the Twin Peaks flag rooms. Turrets only land where an engineer could
            stand to build them, the per-area limits are the server&apos;s, and the sight overlay uses the game&apos;s own
            turret line-of-sight. Share the link or paste the image into Discord.
          </p>
        </div>

        {loadError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{loadError}</div>}

        {/* bases, in the Alt+1..9 scene order */}
        <div className="flex flex-wrap items-center gap-2">
          {data?.bases.map((b, i) => {
            const on = b.id === baseId, n = setups[b.id]?.length ?? 0;
            return (
              <button
                key={b.id}
                onClick={() => setBaseId(b.id)}
                title={`${OWNER[b.owner].label} base (key ${i + 1})`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
                  on ? 'bg-cyan-500/15 border-cyan-400/60 text-white' : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: OWNER[b.owner].color }} />
                {b.id}
                {n > 0 && <span className="text-[11px] font-medium text-gray-400">{n}</span>}
              </button>
            );
          })}
          {base && <span className="text-xs text-gray-500 ml-1">{base.owner === 'neutral' ? `${base.id} has no CTF flag spot` : `${OWNER[base.owner].label} defends ${base.id}`} · {data?.map}</span>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* canvas */}
          <div className="space-y-2 min-w-0">
            <div ref={wrapRef} className="relative h-[min(72vh,760px)] min-h-[360px] rounded-xl overflow-hidden border border-gray-700/70 bg-black">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none select-none"
                aria-label={`${baseId} turret layout. Drag turrets to move them, drag empty floor to pan, scroll to zoom.`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => { if (!drag.current && hovered) setHovered(null); }}
                onContextMenu={onContextMenu}
              />
              {!data && !loadError && <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">Loading the bases…</div>}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <div className="flex rounded-md overflow-hidden border border-gray-600/70 bg-gray-900/85 text-xs">
                  {(['room', 'base'] as View[]).map((v) => (
                    <button key={v} onClick={() => (view === v ? reframe() : setView(v))} title={v === 'room' ? 'Frame the flag room (F)' : 'Show the whole base (F)'}
                      className={`px-2.5 py-1 ${view === v ? 'bg-cyan-500/20 text-cyan-200' : 'text-gray-400 hover:text-gray-200'}`}>
                      {v === 'room' ? (base && FLAG_ROOMS[base.id]?.label) || 'Flag room' : 'Whole base'}
                    </button>
                  ))}
                </div>
                <button onClick={() => zoomBy(1.25)} className="w-7 h-7 rounded-md border border-gray-600/70 bg-gray-900/85 text-gray-300 hover:text-white" title="Zoom in">+</button>
                <button onClick={() => zoomBy(0.8)} className="w-7 h-7 rounded-md border border-gray-600/70 bg-gray-900/85 text-gray-300 hover:text-white" title="Zoom out">−</button>
              </div>
            </div>
            <div aria-live="polite" className={`min-h-[1.25rem] text-sm ${notice?.bad ? 'text-red-300' : 'text-gray-400'}`}>
              {ghost && !ghost.ok ? <span className="text-red-300">{ghost.reason ?? 'Can\'t build there.'}</span> : notice?.text}
            </div>
          </div>

          {/* sidebar */}
          <div className="space-y-3">
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-200">Turrets</h2>
                <span className="text-xs text-gray-500" title={`Caps are per area: the server counts your team's turrets within ${types?.mg.densityRadius ?? 1500}px of where you build. Rocket, MG and Plasma can't be built once that area has ${areaCap}; a Sentry still can.`}>
                  {turretCount} placed · {areaCap} per area
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {types && ORDER.map((k) => {
                  // only the team cap is base-wide; area caps depend on where it goes (dragging shows where)
                  const t = types[k], full = t.maxTypeOnTeam !== -1 && counts[k] >= t.maxTypeOnTeam, medic = t.kind === 'medic';
                  return (
                    <button
                      key={k}
                      onPointerDown={onChipDown(k)}
                      onPointerMove={onChipMove}
                      onPointerUp={onChipUp}
                      onPointerCancel={() => { drag.current = null; setGhost(null); }}
                      title={`${t.name}: ${BLURB[k]}. Click to drop one by the flag, or drag it onto the map.`}
                      className={`touch-none select-none text-left rounded-lg border p-2 transition-colors ${medic ? 'col-span-2 flex items-center gap-3' : ''} ${full ? 'border-gray-700 bg-gray-900/40 opacity-60' : 'border-gray-600/70 bg-gray-900/60 hover:border-gray-400 cursor-grab'}`}
                    >
                      <TurretIcon type={t} />
                      <div className={medic ? 'flex-1' : ''}>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-sm font-semibold" style={{ color: COLOR[k] }}>{t.label}</span>
                          <span className="text-xs text-gray-400" title={medic ? undefined : `${t.maxTypeInArea} per area, ${t.maxTypeOnTeam} per team, ${t.maxPerEngineer} per engineer`}>{medic ? counts[k] || '' : `${counts[k]} · ${t.maxTypeInArea}/area`}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 leading-tight">{BLURB[k]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedTurret && types && (
              <div className="bg-gray-800/50 rounded-xl border p-3 space-y-2" style={{ borderColor: `${COLOR[selectedTurret.type]}55` }}>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold" style={{ color: COLOR[selectedTurret.type] }}>{types[selectedTurret.type].name}</h2>
                  <span className="text-xs text-gray-500">tile {Math.floor(selectedTurret.x / 16)},{Math.floor(selectedTurret.y / 16)}</span>
                </div>
                <PieceStats type={types[selectedTurret.type]} seenFrom={medicSeenFrom}
                  inArea={types[selectedTurret.type].kind === 'turret' ? inArea(types[selectedTurret.type], selectedTurret.x, selectedTurret.y, setup.filter((o) => o.id !== selectedTurret.id && types[o.type].kind === 'turret')).length + 1 : null} />
                <div className="flex gap-1.5">
                  <button onClick={() => updateTurret(selectedTurret.id, { facing: (selectedTurret.facing + types[selectedTurret.type].facings - 4) % types[selectedTurret.type].facings })} className={btn} title="Rotate left ([ or Shift+R)">⟲</button>
                  <button onClick={() => updateTurret(selectedTurret.id, { facing: (selectedTurret.facing + 4) % types[selectedTurret.type].facings })} className={btn} title="Rotate right (] or R)">⟳</button>
                  <button onClick={() => removeTurret(selectedTurret.id)} className={`${btn} flex-1 text-red-300 hover:text-red-200`} title="Remove (Delete)">Remove</button>
                </div>
              </div>
            )}

            <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-3 space-y-1.5">
              <h2 className="text-sm font-semibold text-gray-200 mb-1">Overlays</h2>
              <Toggle on={show.sight} set={(v) => setShow((s) => ({ ...s, sight: v }))} label="Sight of the selected turret" hint="What it can see within its range: the server's turret line-of-sight." />
              <Toggle on={show.fire} set={(v) => setShow((s) => ({ ...s, fire: v }))} label="Fields of fire" hint="Brighter yellow = more Rocket, MG and Plasma turrets can hit that floor (aimed, and past their min range): your kill box." />
              <Toggle on={show.stray} set={(v) => setShow((s) => ({ ...s, stray: v }))} label="Stray fire" hint="Floor no turret aims at, but shots that miss (or pass a closer target) still reach before a wall stops them." />
              <Toggle on={show.minRange} set={(v) => setShow((s) => ({ ...s, minRange: v }))} label="Min range (dead zones)" hint="Blue: too close for that turret. Its shots are still inactive here and pass straight through, so rushers inside are safe from it." />
              <Toggle on={show.blind} set={(v) => setShow((s) => ({ ...s, blind: v }))} label="Blind spots" hint="Floor in the base that no Rocket, MG or Plasma turret can see." />
              <Toggle on={show.antiWarp} set={(v) => setShow((s) => ({ ...s, antiWarp: v }))} label="Sentry anti-warp zones" hint="Enemies can't warp into these circles while the sentry stands. Walls don't matter." />
              <Toggle on={show.heal} set={(v) => setShow((s) => ({ ...s, heal: v }))} label="Medic heal range" hint="Medikit heals every teammate inside the circle; walls don't block it." />
              <Toggle on={show.walls} set={(v) => setShow((s) => ({ ...s, walls: v }))} label="Walls by height" hint="What stops what, from the level's physics." />
              {show.walls && data && types && <WallLegend data={data} types={types} />}
              <Toggle on={show.labels} set={(v) => setShow((s) => ({ ...s, labels: v }))} label="Names and health" />
            </div>

            <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={copyLink} className={btn}>Copy link</button>
                <button onClick={copyImage} className={btn}>Copy image</button>
                <button onClick={download} className={btn}>Download PNG</button>
                <button onClick={undo} className={btn} title="Ctrl+Z">Undo</button>
              </div>
              <button onClick={() => { if (setup.length) { commit([]); setSelected(null); } }} className={`${btn} w-full text-gray-400`}>Clear {baseId}</button>
            </div>

            <details className="text-xs text-gray-500 px-1">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-200">Controls</summary>
              <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
                <li>Click a turret card to drop it by the flag, or drag it onto the map.</li>
                <li>Turret caps are per area: the server counts your team&apos;s computer vehicles (warp points too) within 1500px of where you build. Dragging a turret shades in red where that type can&apos;t go, so in a big base you can see where a second set fits.</li>
                <li>Shots fly 0.7x as far up and down as sideways (the engine squishes projectile y), so shot ranges and dead zones are ellipses. Aim, anti-warp, heal and area ranges are the server&apos;s plain distances: circles.</li>
                <li>Select a medic to see where enemies could spot them from (red): a safe heal spot has little red near the doors.</li>
                <li>Drag a turret to move it; it slides off walls and other turrets.</li>
                <li>Drag the round handle to aim; R / Shift+R or [ ] rotate too.</li>
                <li>Delete or right-click removes. Arrow keys nudge (Shift = 8px).</li>
                <li>Drag the floor to pan, scroll to zoom, F toggles flag room / whole base.</li>
                <li>Keys 1–{data?.bases.length ?? 7} switch bases. Ctrl+Z undoes.</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The numbers for whatever is selected, all from the zone files. */
function PieceStats({ type: t, seenFrom, inArea: area }: { type: TurretType; seenFrom: number | null; inArea: number | null }) {
  const px = (v: number) => `${v}px (${Math.round(v / 16)} tiles)`;
  const rows: [string, string][] = t.kind === 'medic'
    ? [
        ['Heals', `${t.healAmount ?? '?'} HP over ${((t.healTicks ?? 0) / 100).toFixed(1)}s`],
        ['Heal range', `${px(t.healRadius)}, through walls`],
        ...(seenFrom !== null ? [['Seen from', `${seenFrom}% of the base floor within ${SEEN_FROM}px`] as [string, string]] : []),
      ]
    : t.antiWarpRadius > 0
      ? [['Health', `${t.hitpoints} (works above ${t.hpToOperate})`], ['Anti-warp', `${px(t.antiWarpRadius)}, through walls`], ['Shoots', 'no']]
      : [
          ['Health', `${t.hitpoints} (fires above ${t.hpToOperate})`],
          ['Aims within', px(t.fireRadius)],
          ['Shots carry', `${px(t.shotRange)}, ${Math.round(t.shotRange * ISO_Y)}px up/down${t.weapon ? ` (${t.weapon})` : ''}`],
          ['Min range', t.deadRange ? `${t.deadRange}px, ${Math.round(t.deadRange * ISO_Y)}px up/down` : 'none'],
          ['Fires from', `${t.fireHeight} high`],
        ];
  if (t.kind === 'turret') {
    if (area !== null) rows.push(['Its area', `${area} turret${area === 1 ? '' : 's'} within ${t.densityRadius}px`]);
    rows.push(['Caps', `${t.maxTypeInArea}/area, ${t.maxTypeOnTeam}/team, ${t.maxPerEngineer}/engineer`]);
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-gray-500">{k}</dt><dd className="text-gray-300">{v}</dd></Fragment>))}
    </dl>
  );
}

/** A palette icon cut from the same atlas the map uses; facing 40 (south-west) reads well small. */
function TurretIcon({ type }: { type: TurretType }) {
  const f = 40 % type.facings, sx = (f % type.columns) * type.frameW, sy = Math.floor(f / type.columns) * type.frameH;
  const scale = Math.min(1, 52 / type.frameH);
  return (
    <div className="h-[52px] grid place-items-center overflow-hidden">
      <div
        style={{
          width: type.frameW, height: type.frameH,
          backgroundImage: `url(${ASSETS}${type.image})`, backgroundPosition: `-${sx}px -${sy}px`,
          transform: `scale(${scale})`, imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

const btn = 'px-2.5 py-1.5 rounded-md border border-gray-600/70 bg-gray-900/60 text-sm text-gray-300 hover:text-white hover:border-gray-400 transition-colors';

/** Which wall heights stop which turret's shots: a wall stops a shot flying at z when low <= z < high. */
function WallLegend({ data, types }: { data: PlannerData; types: Record<TurretKey, TurretType> }) {
  const groups: { g: WallGroup; p: number; name: string }[] = [
    { g: 'green', p: 6, name: 'Green' }, { g: 'yellow', p: 11, name: 'Yellow' }, { g: 'orange', p: 16, name: 'Orange' },
    { g: 'purple', p: 21, name: 'Purple' }, { g: 'red', p: 1, name: 'Red' },
  ];
  const shooters = ORDER.filter((k) => types[k].obeyLos);
  return (
    <div className="ml-10 text-[11px] text-gray-400 space-y-0.5">
      {groups.map(({ g, p, name }) => {
        const lo = data.physicsLow[p] ?? 0, hi = data.physicsHigh[p] ?? 1024;
        const stops = shooters.filter((k) => types[k].fireHeight >= lo && types[k].fireHeight < hi).map((k) => types[k].label);
        const [r, gg, b] = WALL_COLOR[g];
        return (
          <div key={g} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: `rgb(${r},${gg},${b})` }} />
            <span className="text-gray-300">{name}</span>
            <span className="text-gray-500">{hi >= 1024 ? 'full wall' : `${hi} high`}</span>
            <span className="ml-auto">{stops.length === shooters.length ? 'stops all fire' : stops.length ? `stops ${stops.join(', ')}` : 'shots fly over'}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: 'rgb(59,130,246)' }} />
        <span className="text-gray-300">Blue</span><span className="text-gray-500">one-way gate</span>
      </div>
    </div>
  );
}

/** A switch, not a checkbox: the site's global CSS strips native input appearance. */
function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="w-full flex items-start gap-2.5 text-left text-sm text-gray-300 hover:text-white">
      <span className={`mt-0.5 shrink-0 w-8 h-[18px] rounded-full border transition-colors relative ${on ? 'bg-cyan-500/70 border-cyan-400' : 'bg-gray-700 border-gray-600'}`}>
        <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      <span>
        {label}
        {hint && <span className="block text-[11px] text-gray-500 leading-tight">{hint}</span>}
      </span>
    </button>
  );
}
