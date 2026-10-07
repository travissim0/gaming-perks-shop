'use client';

import { useEffect, useState, useMemo, type CSSProperties, type DragEvent } from 'react';
import { toast } from 'react-hot-toast';
import { PLAN_CLASSES, ROLE_META, covers, placeSides, primaryRole, roleColor, rolesTitle, type ColorSource, type RoleKey, type SideLetter } from '@/lib/ctf-roles';
import type { RolesMap } from '@/components/ctf/RosterRoles';

/**
 * Experimental "field" view of a lineup (View: Field in the roster controls): every
 * player drawn as an in-game character, starters split into offense and defense with the
 * team's flag behind the defense, the bench underneath.
 *
 * Captains drag players (or tap one, then tap where it goes) between Defense, Offense,
 * Bench and Out. Start / bench / out are the real lineup. The offense / defense split is
 * the captain's plan: saved with the lineup and private like it (their own captains,
 * staff, referees after side release), and the zone never reads it.
 *
 * Art is baked offline from the game files (scripts/bake-infantry-atlas.mjs):
 *   /sprites/infantry-indexed.*  man.blo/gfx00000 as palette indices, so each man is
 *                                recoloured here like the client does: body ramp = class
 *                                colour, helmet + boots ramps = team colours
 *   /sprites/ctf-flags.*         ctf.blo/CTF_Flags (what ctfdls4.lio uses), 5 colours x 5 frames
 */

type Slot = 'starting' | 'bench' | 'out';
type Side = 'titan' | 'collective';
/** S = starting, without an offense / defense split (viewers who don't see the squad's plan). */
type Zone = 'O' | 'D' | 'S' | 'bench' | 'out';

export interface FieldPlayer {
  player_id: string;
  alias: string;
  role: 'captain' | 'co_captain' | 'player';
  slot: Slot;
  ten_man: 'in' | 'out' | null;
  /** FS Green: drafted too early to start. */
  blocked?: boolean;
}

// ── Sprites ─────────────────────────────────────────────────────────────────

/** Atlas rows: 0 faces away, clockwise in 16 steps. Only these two get recoloured. */
const FACE = { east: 4, south: 8 };
const SHEET_ROWS = [FACE.east, FACE.south];
/** man.blo's three recolourable ramps: body 1-16, helmet 17-32, boots/pack 33-48 (black -> colour). */
const RAMP_START = 1;
const RAMP_LEN = 16;
/** Team helmet / boots colours from ctfpl.cfg's [TeamInfo] (as on /uniforms); steel before the side is known. */
const TEAM_RAMPS: Record<Side | 'none', [string, string]> = {
  titan: ['#008000', '#00ff00'],
  collective: ['#800000', '#ff0000'],
  none: ['#4b5a6b', '#9aa8b8'],
};
const FLAG = { cw: 38, ch: 59, cols: 5, frameMs: 140 };
/** CTF_Flags rows: green, red, light blue, gold, brown. */
const FLAG_ROW: Record<Side | 'none', number> = { titan: 0, collective: 1, none: 2 };

interface Indexed {
  w: number; cw: number; ch: number; cols: number; frameMs: number;
  idx: Uint8Array; alpha: Uint8Array; palette: number[][];
  /** Body bounds per facing (first walk frame), shadow excluded. */
  body: Record<number, { x0: number; y0: number; x1: number; y1: number }>;
}

let indexedP: Promise<Indexed | null> | null = null;
const loadIndexed = () =>
  (indexedP ||= (async () => {
    try {
      const meta = await (await fetch('/sprites/infantry-indexed.json')).json();
      const img = new Image();
      img.src = `/sprites/${meta.image}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const n = c.width * c.height;
      const idx = new Uint8Array(n);
      const alpha = new Uint8Array(n);
      for (let i = 0; i < n; i++) { idx[i] = px[i * 4]; alpha[i] = px[i * 4 + 3]; }
      // The baked ox/oy are a draw offset, not the body. The drop shadow is stored as ordinary
      // opaque pixels (only its palette entries are translucent), so leave those out or the
      // "body" drifts onto the shadow and the man gets clipped.
      const cw = meta.cellWidth, ch = meta.cellHeight;
      const isShadow = (i: number) => (meta.palette[i]?.[3] ?? 255) < 255;
      const body: Indexed['body'] = {};
      for (const row of SHEET_ROWS) {
        let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const si = (row * ch + y) * c.width + x;
          if (alpha[si] && !isShadow(idx[si])) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        body[row] = x1 >= 0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: cw - 1, y1: ch - 1 };
      }
      return { w: c.width, cw, ch, cols: meta.columns, frameMs: meta.animationTime, idx, alpha, palette: meta.palette, body };
    } catch (e) {
      console.error('lineup field: sprite atlas failed', e);
      return null;
    }
  })());

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** One recoloured strip (east + south facings, every walk frame) per class + team, cached as a data URL. */
const sheets = new Map<string, string>();
function sheetFor(ix: Indexed, body: string, team: Side | 'none'): string {
  const key = `${body}|${team}`;
  const hit = sheets.get(key);
  if (hit) return hit;
  const lut = ix.palette.map((p) => p.slice());
  [body, ...TEAM_RAMPS[team]].forEach((col, r) => {
    const [cr, cg, cb] = hex(col);
    for (let i = 0; i < RAMP_LEN; i++) {
      // The body (class) ramp is lifted off black: the man mostly uses its dark end, which hid the class colour.
      const k = r === 0 ? 0.3 + 0.7 * (i / (RAMP_LEN - 1)) : i / (RAMP_LEN - 1);
      lut[RAMP_START + r * RAMP_LEN + i] = [Math.round(cr * k), Math.round(cg * k), Math.round(cb * k), 255];
    }
  });
  const c = document.createElement('canvas');
  c.width = ix.cols * ix.cw;
  c.height = SHEET_ROWS.length * ix.ch;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(c.width, c.height);
  const d = out.data;
  SHEET_ROWS.forEach((row, j) => {
    for (let y = 0; y < ix.ch; y++) {
      const sy = row * ix.ch + y;
      for (let x = 0; x < c.width; x++) {
        const si = sy * ix.w + x;
        if (!ix.alpha[si]) continue;
        const e = lut[ix.idx[si]];
        if (e[3] < 255) continue; // drop shadow: smears into the neighbours at this size
        const di = ((j * ix.ch + y) * c.width + x) * 4;
        d[di] = e[0]; d[di + 1] = e[1]; d[di + 2] = e[2]; d[di + 3] = e[3];
      }
    }
  });
  ctx.putImageData(out, 0, 0);
  const url = c.toDataURL();
  sheets.set(key, url);
  return url;
}

const SCALE = 2;
const PAD = 2;

function Man({ ix, role, team, row }: { ix: Indexed | null; role: RoleKey | null; team: Side | 'none'; row: number }) {
  if (!ix) return <span className="block" style={{ width: 44, height: 80 }} />;
  const b = ix.body[row];
  const w = (b.x1 - b.x0 + 1) * SCALE + PAD * 2;
  const h = (b.y1 - b.y0 + 1) * SCALE + PAD * 2;
  const j = SHEET_ROWS.indexOf(row);
  const style: CSSProperties & Record<string, string | number> = {
    position: 'absolute',
    left: PAD - b.x0 * SCALE,
    top: PAD - b.y0 * SCALE,
    width: ix.cw * SCALE,
    height: ix.ch * SCALE,
    backgroundImage: `url(${sheetFor(ix, ROLE_META[role || 'INF'].color, team)})`,
    backgroundSize: `${ix.cols * ix.cw * SCALE}px ${SHEET_ROWS.length * ix.ch * SCALE}px`,
    backgroundPosition: `0px -${j * ix.ch * SCALE}px`,
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    '--lf-run': `-${ix.cols * ix.cw * SCALE}px`,
    '--lf-dur': `${ix.cols * ix.frameMs}ms`,
  };
  // Not clipped: walk frames swing a little past the first frame's bounds.
  return (
    <span className="relative block" style={{ width: w, height: h }}>
      <span className="lf-man" style={style} />
    </span>
  );
}

function Flag({ side }: { side: Side | null }) {
  return (
    <span
      className="lf-flag block"
      title={side ? `${side === 'titan' ? 'Titan' : 'Collective'} flag` : 'Flag (side not picked yet)'}
      style={{
        width: FLAG.cw * 2,
        height: FLAG.ch * 2,
        backgroundImage: 'url(/sprites/ctf-flags.png)',
        backgroundSize: `${FLAG.cols * FLAG.cw * 2}px ${5 * FLAG.ch * 2}px`,
        backgroundPosition: `0px -${FLAG_ROW[side || 'none'] * FLAG.ch * 2}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

const ANIM_CSS = `
@keyframes lf-walk { from { background-position-x: 0px; } to { background-position-x: var(--lf-run); } }
@keyframes lf-wave { from { background-position-x: 0px; } to { background-position-x: -${FLAG.cols * FLAG.cw * 2}px; } }
.lf-tile:hover .lf-man, .lf-tile[data-sel="1"] .lf-man { animation: lf-walk var(--lf-dur) steps(12) infinite; }
.lf-flag { animation: lf-wave ${FLAG.cols * FLAG.frameMs}ms steps(${FLAG.cols}) infinite; }
@media (prefers-reduced-motion: reduce) { .lf-flag, .lf-tile .lf-man { animation: none !important; } }
`;

// ── Field ───────────────────────────────────────────────────────────────────

const SIDE_TINT: Record<SideLetter, string> = { O: '#FB923C', D: '#60A5FA' };
const TILE_W = 72;

export default function LineupField({
  side, players, roles, src, canEdit, strategy, starters, focus, plan, onSlot, onPlan, classes, onClass, onTen,
}: {
  side: Side | null;
  players: FieldPlayer[];
  roles: RolesMap;
  src: ColorSource;
  canEdit: boolean;
  /** Sees this squad's plan (its own members only): offense / defense halves, class and 10M. */
  strategy: boolean;
  starters: number;
  focus: RoleKey | null;
  /** The captain's saved / unsaved offense-defense plan. */
  plan: Record<string, SideLetter>;
  onSlot: (playerId: string, slot: Slot) => void;
  onPlan: (playerId: string, side: SideLetter) => void;
  /** Class each player is planned on for this match (unset = what they usually play). */
  classes: Record<string, RoleKey | null>;
  onClass: (playerId: string, cls: RoleKey | null) => void;
  onTen: (playerId: string, v: 'in' | 'out' | null) => void;
}) {
  const [ix, setIx] = useState<Indexed | null>(null);
  useEffect(() => { loadIndexed().then(setIx); }, []);

  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState<Zone | null>(null);
  const team: Side | 'none' = side || 'none';

  const starting = players.filter((p) => p.slot === 'starting');
  const bench = players.filter((p) => p.slot === 'bench');
  const out = players.filter((p) => p.slot === 'out');
  const placed = useMemo(() => placeSides(starting.map((p) => p.player_id), roles, src, plan), [starting, roles, src, plan]);
  const sideOf = (id: string): SideLetter => placed[id]?.side || 'O';
  const offense = starting.filter((p) => sideOf(p.player_id) === 'O');
  const defense = starting.filter((p) => sideOf(p.player_id) === 'D');

  const move = (id: string, zone: Zone) => {
    const p = players.find((x) => x.player_id === id);
    if (!p) return;
    setSel(null);
    if (zone === 'O' || zone === 'D' || zone === 'S') {
      if (p.slot !== 'starting') {
        if (p.blocked) { toast.error('FS Green: only the captain and later-round picks can start'); return; }
        if (starting.length >= starters) { toast.error(`${starters} starters already: bench someone first`); return; }
        onSlot(id, 'starting');
      }
      if (zone !== 'S') onPlan(id, zone);
      return;
    }
    if (p.slot !== zone) onSlot(id, zone);
  };

  const zoneProps = (zone: Zone) => canEdit ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(zone); },
    onDragLeave: () => setOver((z) => (z === zone ? null : z)),
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, zone); },
    onClick: () => { if (sel) move(sel, zone); },
  } : {};

  const tile = (p: FieldPlayer, row: number) => {
    const r = roles[p.player_id];
    const k = classes[p.player_id] || primaryRole(r, src);
    const tier = focus ? covers(r, focus, src) : null;
    const faded = !!focus && !tier;
    return (
      <div
        key={p.player_id}
        className={`lf-tile relative flex flex-col items-center rounded transition ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${sel === p.player_id ? 'bg-white/10 ring-1 ring-[#22D3EE]' : canEdit ? 'hover:bg-white/5' : ''}`}
        style={{ width: TILE_W, opacity: faded ? 0.25 : 1 }}
        data-sel={sel === p.player_id ? '1' : '0'}
        title={rolesTitle(p.alias, r)}
        draggable={canEdit}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.player_id); e.dataTransfer.effectAllowed = 'move'; }}
        onClick={(e) => { if (!canEdit) return; e.stopPropagation(); setSel((s) => (s === p.player_id ? null : p.player_id)); }}
      >
        {p.ten_man && (
          <span className={`absolute right-0 top-0 z-10 rounded-sm px-0.5 text-[8px] font-semibold leading-3 ${p.ten_man === 'in' ? 'bg-[#d946ef]/30 text-[#f0abfc]' : 'bg-[#FB923C]/25 text-[#FB923C]'}`}>10M {p.ten_man}</span>
        )}
        <Man ix={ix} role={k} team={team} row={row} />
        <span
          className="max-w-full truncate px-0.5 text-[11px] leading-[13px]"
          style={{
            color: roleColor(k),
            fontWeight: tier === 'main' ? 600 : undefined,
            textDecoration: tier && focus ? `underline ${tier === 'main' ? 'solid' : 'dashed'} ${ROLE_META[focus].color}` : undefined,
            textUnderlineOffset: 2,
          }}
        >
          {p.alias}
        </span>
        <span className="flex items-center gap-1 text-[8px] uppercase leading-3">
          {classes[p.player_id] && <span style={{ color: ROLE_META[classes[p.player_id]!].color }} title="Planned class for this match">{ROLE_META[classes[p.player_id]!].short}</span>}
          {p.role !== 'player' && <span className="text-[#F59E0B]">{p.role === 'captain' ? 'C' : 'Co-C'}</span>}
        </span>
      </div>
    );
  };

  const half = (s: SideLetter, list: FieldPlayer[]) => (
    <div
      {...zoneProps(s)}
      className={`relative min-h-[170px] rounded-md p-1.5 transition-colors ${over === s ? 'ring-1 ring-inset' : ''}`}
      style={{ backgroundColor: `${SIDE_TINT[s]}${over === s ? '24' : '0f'}`, ['--tw-ring-color' as string]: `${SIDE_TINT[s]}66` }}
    >
      <div className="mb-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: SIDE_TINT[s] }}>
        {s === 'O' ? 'Offense' : 'Defense'} <span className="font-normal tracking-normal text-[#8B98B0] tabular-nums">{list.length}</span>
      </div>
      {s === 'D' && <div className="pointer-events-none absolute left-1 top-5"><Flag side={side} /></div>}
      {/* Defense faces the viewer in front of its flag; offense heads out (east). */}
      <div className={`flex flex-wrap justify-center ${s === 'D' ? 'pl-[84px]' : ''}`}>
        {list.map((p) => tile(p, s === 'D' ? FACE.south : FACE.east))}
      </div>
      {list.length === 0 && (
        <p className={`mt-8 text-center text-[11px] text-[#8B98B0]/60 ${s === 'D' ? 'pl-[84px]' : ''}`}>{canEdit ? 'Drag players here' : 'Nobody yet'}</p>
      )}
    </div>
  );

  const startingZone = (
    <div
      {...zoneProps('S')}
      className={`relative min-h-[150px] rounded-md bg-[#34D399]/[0.06] p-1.5 transition-colors ${over === 'S' ? 'ring-1 ring-inset ring-[#34D399]/50' : ''}`}
    >
      <div className="mb-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-[#34D399]">
        Starting <span className="font-normal tracking-normal text-[#8B98B0] tabular-nums">{starting.length}/{starters}</span>
      </div>
      <div className="pointer-events-none absolute left-1 top-5"><Flag side={side} /></div>
      <div className="flex flex-wrap justify-center pl-[84px]">
        {starting.map((p) => tile(p, FACE.south))}
      </div>
      {starting.length === 0 && <p className="mt-8 pl-[84px] text-center text-[11px] text-[#8B98B0]/60">{canEdit ? 'Drag players here' : 'Nobody yet'}</p>}
    </div>
  );

  const picked = canEdit && sel ? players.find((p) => p.player_id === sel) || null : null;
  const chip = (on: boolean) => `rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${on ? '' : 'opacity-70 hover:opacity-100'}`;
  const actionBar = picked && (
    <div className="sticky top-0 z-20 rounded-md bg-[#0B0F1A] px-2 py-1.5 ring-1 ring-[#22D3EE]/40" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#8B98B0]">
        <span className="font-semibold text-[#E6EDF7]">{picked.alias}</span>
        {strategy && (<>
        <span className="flex flex-wrap items-center gap-1">
          Class
          {PLAN_CLASSES.map((c) => {
            const on = classes[picked.player_id] === c;
            return (
              <button key={c} type="button" onClick={() => onClass(picked.player_id, on ? null : c)}
                className={chip(on)}
                style={{ color: on ? '#0B0F1A' : ROLE_META[c].color, backgroundColor: on ? ROLE_META[c].color : `${ROLE_META[c].color}1f` }}
                title={on ? 'Clear: back to what they usually play' : `Plan ${picked.alias} as ${ROLE_META[c].label}`}
              >{ROLE_META[c].short}</button>
            );
          })}
        </span>
        <span className="flex items-center gap-1">
          10M
          {([null, 'in', 'out'] as const).map((v) => (
            <button key={String(v)} type="button" onClick={() => onTen(picked.player_id, v)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${picked.ten_man === v ? (v === 'in' ? 'bg-[#d946ef]/30 text-[#f0abfc]' : v === 'out' ? 'bg-[#FB923C]/25 text-[#FB923C]' : 'bg-white/10 text-[#E6EDF7]') : 'bg-white/5 hover:bg-white/10'}`}
              title={v === 'in' ? 'Subs in on 10-man' : v === 'out' ? 'Subs out on 10-man' : 'Not part of the 10-man swap'}
            >{v ?? '–'}</button>
          ))}
        </span>
        </>)}
        <span className="flex items-center gap-1">
          {picked.slot !== 'bench' && <button type="button" onClick={() => move(picked.player_id, 'bench')} className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[11px] text-[#22D3EE] hover:bg-[#22D3EE]/25">Bench</button>}
          {picked.slot !== 'out' && <button type="button" onClick={() => move(picked.player_id, 'out')} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#E6EDF7] hover:bg-white/10">Out</button>}
          <button type="button" onClick={() => setSel(null)} className="px-1 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Close">✕</button>
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-[#8B98B0]/70">{strategy ? 'Tap Defense or Offense to start them there.' : 'Tap Starting to start them.'}</p>
    </div>
  );

  return (
    <div className="space-y-1.5 px-2 py-2" onClick={() => setSel(null)}>
      <style>{ANIM_CSS}</style>
      {actionBar}
      {strategy ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {half('D', defense)}
          {half('O', offense)}
        </div>
      ) : startingZone}
      <div
        {...zoneProps('bench')}
        className={`rounded-md bg-black/20 p-1.5 transition-colors ${over === 'bench' ? 'ring-1 ring-inset ring-[#22D3EE]/50' : ''}`}
      >
        <div className="mb-0.5 text-center text-[10px] uppercase tracking-[0.15em] text-[#8B98B0]">
          Bench <span className="tracking-normal tabular-nums">{bench.length}</span>
        </div>
        <div className="flex flex-wrap justify-center">
          {bench.map((p) => tile(p, FACE.south))}
          {bench.length === 0 && <p className="py-2 text-[11px] text-[#8B98B0]/60">Nobody on the bench</p>}
        </div>
      </div>
      {(out.length > 0 || canEdit) && (
        <div {...zoneProps('out')} className={`rounded-md px-2 py-1 text-[11px] text-[#8B98B0] ${over === 'out' ? 'bg-white/5 ring-1 ring-inset ring-white/20' : ''}`}>
          <span className="uppercase tracking-wide text-[10px]">Out</span>{' '}
          {out.length ? out.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <span
                draggable={canEdit}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', p.player_id)}
                onClick={(e) => { if (!canEdit) return; e.stopPropagation(); setSel((s) => (s === p.player_id ? null : p.player_id)); }}
                className={`${canEdit ? 'cursor-grab' : ''} ${sel === p.player_id ? 'text-[#22D3EE]' : 'text-[#E6EDF7]/70'}`}
              >{p.alias}</span>
            </span>
          )) : <span className="text-[#8B98B0]/60">{canEdit ? 'drop here for players who won’t be at the match' : 'nobody'}</span>}
        </div>
      )}
      {canEdit && (
        <p className="text-center text-[10px] text-[#8B98B0]/70">
          Drag players, or tap one to set their class, 10-man role, bench or out, then tap where they go. Everything saves with Save lineup. Offense / defense and planned classes are your squad&apos;s own plan, private like the lineup. Before the match the zone asks each player in game to confirm their class and side.
        </p>
      )}
    </div>
  );
}
