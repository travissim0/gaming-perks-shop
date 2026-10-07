'use client';

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { toast } from 'react-hot-toast';
import { ROLE_META, covers, placeSides, primaryRole, roleColor, rolesTitle, type ColorSource, type RoleKey, type SideLetter } from '@/lib/ctf-roles';
import type { RolesMap } from '@/components/ctf/RosterRoles';

/**
 * Experimental "field" view of a lineup (opt-in from the roster controls): every player
 * drawn as their class's in-game character, starters split into offense and defense with
 * the team's flag behind the defense, the bench greyed out underneath.
 *
 * Captains drag players (or tap one, then tap where it goes) between Offense, Defense,
 * Bench and Out. Start / bench / out are the real lineup, saved with Save lineup as usual.
 * Offense vs defense is only this browser's arrangement: it is a suggestion like the list
 * view's groups and is not saved to the site.
 *
 * Art is baked offline from the game files (scripts/bake-infantry-atlas.mjs):
 *   /sprites/<class>.json + .png   man.blo/gfx00000, 16 facings x 12 walk frames, per class tint
 *   /sprites/ctf-flags.json + .png ctf.blo/CTF_Flags (what ctfdls4.lio uses), 5 colours x 5 frames
 */

type Slot = 'starting' | 'bench' | 'out';
type Side = 'titan' | 'collective';
type Zone = 'O' | 'D' | 'bench' | 'out';

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

const MAN = { cw: 79, ch: 63, cols: 12, frameMs: 96 };
const FLAG = { cw: 38, ch: 59, cols: 5, frameMs: 140 };
/** Atlas rows: 0 faces away, clockwise in 16 steps. */
const FACE = { east: 4, south: 8, west: 12 };
const SLUG: Record<RoleKey, string> = {
  SL: 'squad-leader', MED: 'field-medic', ENG: 'combat-engineer', '10M': 'infiltrator',
  IFL: 'infiltrator', HVY: 'heavy-weapons', INF: 'infantry', JT: 'jump-trooper',
};
/** CTF_Flags rows: green, red, light blue, gold, brown. */
const FLAG_ROW: Record<Side | 'none', number> = { titan: 0, collective: 1, none: 2 };

// Each facing has its own origin inside the cell; anchor on it so a row of men lines up.
let originCache: Promise<Record<number, { ox: number; oy: number }>> | null = null;
const loadOrigins = () =>
  (originCache ||= fetch('/sprites/infantry.json')
    .then((r) => r.json())
    .then((j) => Object.fromEntries((j.frames as any[]).filter((f) => f.col === 0).map((f) => [f.row, { ox: f.ox, oy: f.oy }])))
    .catch(() => ({})));

const BOX_W = 64;
const BOX_H = 46;

function Man({ role, row, origins }: { role: RoleKey | null; row: number; origins: Record<number, { ox: number; oy: number }> }) {
  const o = origins[row] || { ox: 40, oy: 26 };
  const style: CSSProperties = {
    position: 'absolute',
    left: BOX_W / 2 - o.ox,
    top: BOX_H / 2 + 2 - o.oy,
    width: MAN.cw,
    height: MAN.ch,
    backgroundImage: `url(/sprites/${SLUG[role || 'INF']}.png)`,
    backgroundPosition: `0px -${row * MAN.ch}px`,
    imageRendering: 'pixelated',
  };
  return (
    <span className="relative block overflow-hidden" style={{ width: BOX_W, height: BOX_H }}>
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
        width: FLAG.cw,
        height: FLAG.ch,
        backgroundImage: 'url(/sprites/ctf-flags.png)',
        backgroundPosition: `0px -${FLAG_ROW[side || 'none'] * FLAG.ch}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

const ANIM_CSS = `
@keyframes lf-walk { from { background-position-x: 0px; } to { background-position-x: -${MAN.cols * MAN.cw}px; } }
@keyframes lf-wave { from { background-position-x: 0px; } to { background-position-x: -${FLAG.cols * FLAG.cw}px; } }
.lf-tile:hover .lf-man, .lf-tile[data-sel="1"] .lf-man { animation: lf-walk ${MAN.cols * MAN.frameMs}ms steps(${MAN.cols}) infinite; }
.lf-flag { animation: lf-wave ${FLAG.cols * FLAG.frameMs}ms steps(${FLAG.cols}) infinite; }
@media (prefers-reduced-motion: reduce) { .lf-flag, .lf-tile .lf-man { animation: none !important; } }
`;

// ── Field ───────────────────────────────────────────────────────────────────

const SIDE_TINT: Record<SideLetter, string> = { O: '#FB923C', D: '#60A5FA' };

export default function LineupField({
  matchId, squadId, side, players, roles, src, canEdit, starters, focus, onSlot,
}: {
  matchId: string;
  squadId: string;
  side: Side | null;
  players: FieldPlayer[];
  roles: RolesMap;
  src: ColorSource;
  canEdit: boolean;
  starters: number;
  focus: RoleKey | null;
  onSlot: (playerId: string, slot: Slot) => void;
}) {
  const [origins, setOrigins] = useState<Record<number, { ox: number; oy: number }>>({});
  useEffect(() => { loadOrigins().then(setOrigins); }, []);

  // Offense / defense arrangement: this browser only.
  const key = `lineup-field-sides:${matchId}:${squadId}`;
  const [override, setOverride] = useState<Record<string, SideLetter>>({});
  useEffect(() => {
    try { setOverride(JSON.parse(localStorage.getItem(key) || '{}') || {}); } catch { setOverride({}); }
  }, [key]);
  const saveOverride = (next: Record<string, SideLetter>) => {
    setOverride(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* not remembered */ }
  };

  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState<Zone | null>(null);

  const starting = players.filter((p) => p.slot === 'starting');
  const bench = players.filter((p) => p.slot === 'bench');
  const out = players.filter((p) => p.slot === 'out');
  const placed = useMemo(() => placeSides(starting.map((p) => p.player_id), roles, src), [starting, roles, src]);
  const sideOf = (id: string): SideLetter => override[id] || placed[id]?.side || 'O';
  const offense = starting.filter((p) => sideOf(p.player_id) === 'O');
  const defense = starting.filter((p) => sideOf(p.player_id) === 'D');

  const move = (id: string, zone: Zone) => {
    const p = players.find((x) => x.player_id === id);
    if (!p) return;
    setSel(null);
    if (zone === 'O' || zone === 'D') {
      if (p.slot !== 'starting') {
        if (p.blocked) { toast.error('FS Green: only the captain and later-round picks can start'); return; }
        if (starting.length >= starters) { toast.error(`${starters} starters already: bench someone first`); return; }
        onSlot(id, 'starting');
      }
      saveOverride({ ...override, [id]: zone });
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

  const tile = (p: FieldPlayer, row: number, grey = false) => {
    const r = roles[p.player_id];
    const k = primaryRole(r, src);
    const tier = focus ? covers(r, focus, src) : null;
    const faded = (!!focus && !tier) || grey;
    return (
      <div
        key={p.player_id}
        className={`lf-tile relative flex w-[64px] flex-col items-center rounded transition ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${sel === p.player_id ? 'bg-white/10 ring-1 ring-[#22D3EE]' : canEdit ? 'hover:bg-white/5' : ''}`}
        data-sel={sel === p.player_id ? '1' : '0'}
        title={rolesTitle(p.alias, r)}
        draggable={canEdit}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.player_id); e.dataTransfer.effectAllowed = 'move'; }}
        onClick={(e) => { if (!canEdit) return; e.stopPropagation(); setSel((s) => (s === p.player_id ? null : p.player_id)); }}
        style={faded ? { opacity: grey && !focus ? 0.55 : 0.25, filter: grey ? 'grayscale(1)' : undefined } : undefined}
      >
        {p.ten_man && (
          <span className={`absolute right-0 top-0 z-10 rounded-sm px-0.5 text-[8px] font-semibold leading-3 ${p.ten_man === 'in' ? 'bg-[#d946ef]/30 text-[#f0abfc]' : 'bg-[#FB923C]/25 text-[#FB923C]'}`}>10M {p.ten_man}</span>
        )}
        <Man role={k} row={row} origins={origins} />
        <span
          className="-mt-1 max-w-full truncate px-0.5 text-[10px] leading-3"
          style={{
            color: grey ? '#8B98B0' : roleColor(k),
            fontWeight: tier === 'main' ? 600 : undefined,
            textDecoration: tier && focus ? `underline ${tier === 'main' ? 'solid' : 'dashed'} ${ROLE_META[focus].color}` : undefined,
            textUnderlineOffset: 2,
          }}
        >
          {p.alias}
        </span>
        {p.role !== 'player' && <span className="text-[8px] uppercase leading-3 text-[#F59E0B]">{p.role === 'captain' ? 'C' : 'Co-C'}</span>}
      </div>
    );
  };

  const half = (s: SideLetter, list: FieldPlayer[]) => (
    <div
      {...zoneProps(s)}
      className={`relative min-h-[132px] rounded-md p-1.5 transition-colors ${over === s || (sel && canEdit) ? 'ring-1 ring-inset' : ''}`}
      style={{ backgroundColor: `${SIDE_TINT[s]}${over === s ? '24' : '0f'}`, ['--tw-ring-color' as any]: `${SIDE_TINT[s]}66` }}
    >
      <div className="mb-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: SIDE_TINT[s] }}>
        {s === 'O' ? 'Offense' : 'Defense'} <span className="font-normal tracking-normal text-[#8B98B0] tabular-nums">{list.length}</span>
      </div>
      <div className={`flex gap-y-1 ${s === 'D' ? 'pl-10' : ''}`}>
        <div className="flex flex-wrap justify-center gap-y-1">
          {/* Defense faces the viewer in front of its flag; offense heads out (east). */}
          {list.map((p) => tile(p, s === 'D' ? FACE.south : FACE.east))}
        </div>
      </div>
      {s === 'D' && <div className="pointer-events-none absolute left-1.5 top-5"><Flag side={side} /></div>}
      {list.length === 0 && (
        <p className="mt-6 text-center text-[11px] text-[#8B98B0]/60">{canEdit ? 'Drag players here' : 'Nobody yet'}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-1.5 px-2 py-2" onClick={() => setSel(null)}>
      <style>{ANIM_CSS}</style>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {half('D', defense)}
        {half('O', offense)}
      </div>
      <div
        {...zoneProps('bench')}
        className={`rounded-md bg-black/20 p-1.5 transition-colors ${over === 'bench' ? 'ring-1 ring-inset ring-[#22D3EE]/50' : ''}`}
      >
        <div className="mb-0.5 text-center text-[10px] uppercase tracking-[0.15em] text-[#8B98B0]">
          Bench <span className="tracking-normal tabular-nums">{bench.length}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-y-1">
          {bench.map((p) => tile(p, FACE.south, true))}
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
          Drag players, or tap one then tap where it goes. Start, bench and out save with Save lineup; the offense / defense split is just for you, in this browser.
        </p>
      )}
    </div>
  );
}
