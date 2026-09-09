'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import NeutralNavbar from '@/components/home/NeutralNavbar';

/** Titan / Collective series colors - validated for the dark surface, keep in fixed order. */
export const SIDE_COLORS = { T: '#2fa866', C: '#d95926' } as const;   // Titan green, Collective orange-red
/** Single-series chart hue (class / weapon bars) so it never reads as a side. */
export const SERIES_NEUTRAL = '#3987e5';

const TABS = [
  { href: '/usl-mix', label: 'Overview' },
  { href: '/usl-mix/games', label: 'Games' },
  { href: '/usl-mix/api', label: 'Public API' },
];

type Accent = 'cyan' | 'green' | 'amber' | 'purple' | 'rose';

/** Home-page card accents: [top bar, title text, border, shadow, side bar]. */
const ACCENTS: Record<Accent, { bar: string; text: string; border: string; shadow: string; divider: string }> = {
  cyan: { bar: 'from-cyan-400 via-blue-500 to-green-400', text: 'from-cyan-400 via-blue-400 to-green-400', border: 'border-cyan-500/20', shadow: 'shadow-cyan-500/5', divider: 'border-cyan-500/10' },
  green: { bar: 'from-green-400 via-emerald-500 to-teal-400', text: 'from-green-400 via-emerald-400 to-teal-400', border: 'border-green-500/20', shadow: 'shadow-green-500/5', divider: 'border-green-500/10' },
  amber: { bar: 'from-amber-400 via-orange-500 to-rose-400', text: 'from-amber-400 via-orange-400 to-rose-400', border: 'border-amber-500/20', shadow: 'shadow-amber-500/5', divider: 'border-amber-500/10' },
  purple: { bar: 'from-purple-400 via-violet-500 to-blue-400', text: 'from-purple-400 via-violet-400 to-blue-400', border: 'border-purple-500/20', shadow: 'shadow-purple-500/5', divider: 'border-purple-500/10' },
  rose: { bar: 'from-rose-400 via-pink-500 to-orange-400', text: 'from-rose-400 via-pink-400 to-orange-400', border: 'border-rose-500/20', shadow: 'shadow-rose-500/5', divider: 'border-rose-500/10' },
};

/** Deterministic star field so server and client render the same markup. */
function seededStars(count: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const colors = ['#ffffff', '#ffffff', '#cce0ff', '#ffe8d6', '#b4dcff', '#c8ffff'];
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    r: +(rand() * 0.9 + 0.4).toFixed(2),
    opacity: +(rand() * 0.45 + 0.1).toFixed(2),
    color: colors[Math.floor(rand() * colors.length)],
  }));
}

/**
 * Perf notes (Firefox scroll-lag report, 2026-09-06, measured in headless Firefox over WebDriver BiDi):
 * the sky is ONE element with a multi-layer CSS background. 140 absolutely positioned star divs
 * cost 2-3x the scroll frame time, and any animated opacity in this layer (per-star twinkle or a
 * single full-screen overlay) was worse still, so nothing here animates. Nothing above this layer
 * may use backdrop-filter either: a blurred surface over a fixed backdrop is re-sampled on every
 * scroll step, and even the navbar's blur, scrolled out of view, cost a third of the frame budget.
 */
const STAR_W = 1920;
const STAR_H = 1080;
const STAR_FIELD = (() => {
  const circles = seededStars(140, 20260905)
    .map((st) => `<circle cx='${Math.round(st.x * STAR_W)}' cy='${Math.round(st.y * STAR_H)}' r='${st.r}' fill='${st.color}' fill-opacity='${st.opacity}'/>`)
    .join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${STAR_W}' height='${STAR_H}'>${circles}</svg>`)}")`;
})();
const SKY_BACKGROUND = [
  `${STAR_FIELD} center / cover no-repeat`,
  'radial-gradient(ellipse at 75% 25%, rgba(139, 92, 246, 0.06) 0%, transparent 45%)',
  'radial-gradient(ellipse at 15% 75%, rgba(139, 92, 246, 0.04) 0%, transparent 40%)',
  'radial-gradient(ellipse at 25% 15%, rgba(34, 211, 238, 0.07) 0%, transparent 50%)',
  'radial-gradient(ellipse at 80% 80%, rgba(34, 211, 238, 0.04) 0%, transparent 40%)',
  'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)',
].join(', ');

function SpaceBackdrop() {
  return <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden style={{ background: SKY_BACKGROUND }} />;
}

export default function UslMixShell({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const pathname = usePathname() || '';
  return (
    <div className="min-h-screen relative text-gray-100">
      <SpaceBackdrop />
      <div className="relative z-10">
        <NeutralNavbar />
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-8">
            <div className="min-w-0">
              <Link href="/usl-mix" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/80 hover:text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                USL Mix Stats
              </Link>
              <h1 className="mt-2 text-3xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 break-words">
                {title ?? 'USL Mix Stats'}
              </h1>
              {subtitle && <p className="text-gray-400 mt-3 max-w-3xl text-sm md:text-base leading-relaxed">{subtitle}</p>}
            </div>
            <nav className="flex gap-2 flex-wrap shrink-0">
              {TABS.map((t) => {
                const active = t.href === '/usl-mix' ? pathname === '/usl-mix' : pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-400/40 text-cyan-100 shadow-lg shadow-cyan-500/10'
                        : 'bg-gray-900/50 border-gray-700/40 text-gray-300 hover:border-cyan-500/30 hover:text-white hover:bg-cyan-500/5'
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
  className = '',
  accent = 'cyan',
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  accent?: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <section className={`relative overflow-hidden rounded-2xl border ${a.border} bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 shadow-xl ${a.shadow} ${className}`}>
      <div className={`h-1.5 bg-gradient-to-r ${a.bar}`} />
      {(title || right) && (
        <div className={`px-4 py-3 border-b ${a.divider} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {title && (
              <>
                <div className={`w-1 h-6 bg-gradient-to-b ${a.text} rounded-full shrink-0`} />
                <h2 className={`text-base md:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r ${a.text} uppercase tracking-wider`}>{title}</h2>
              </>
            )}
          </div>
          {right && <div className="text-right ml-auto">{right}</div>}
        </div>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, accent = 'cyan' }: { label: string; value: string | number; hint?: string; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${a.border} bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 shadow-lg ${a.shadow} p-4`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">{label}</div>
      <div className={`mt-1.5 text-3xl md:text-4xl font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-r ${a.text}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1.5">{hint}</div>}
    </div>
  );
}

export function SideBadge({ side }: { side: string | null | undefined }) {
  if (side !== 'T' && side !== 'C') return <span className="text-gray-500">?</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
      style={{ color: SIDE_COLORS[side], border: `1px solid ${SIDE_COLORS[side]}55`, background: `${SIDE_COLORS[side]}22` }}
    >
      {side === 'T' ? 'Titan' : 'Collective'}
    </span>
  );
}

export function ResultBadge({ result }: { result: string | null | undefined }) {
  const cls =
    result === 'win'
      ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40'
      : result === 'loss'
        ? 'text-rose-300 bg-rose-500/15 border-rose-500/40'
        : 'text-gray-300 bg-gray-500/15 border-gray-500/40';
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border uppercase tracking-wide ${cls}`}>{result ?? '—'}</span>;
}

/** Shared table styling so every page reads like the home page's lists. */
export const tableCls = {
  table: 'w-full text-sm',
  thead: 'text-[11px] uppercase tracking-wider text-gray-400',
  headRow: 'border-b border-cyan-500/10',
  row: 'border-b border-gray-700/30 hover:bg-cyan-500/5 transition-colors duration-150',
  rowStatic: 'border-b border-gray-700/30',
};

export const controlCls = 'bg-gray-900/60 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-500/50';

/**
 * Individual ELO is computed on every mix but NOT published during the season (2026-09-09).
 * A public ladder was changing how people played - slower, campier, less talking - in a scene that
 * logs on for casual organised games. Ratings have exactly one job now: balancing drafts. There is
 * deliberately NO end-of-season reveal and no ranking - a promised reveal is still an incentive to
 * try-hard, which is the thing being fixed (Angelus, 2026-09-09). Flip this to true only if the room
 * changes its mind; every rating surface on the site is gated on it.
 */
export const SHOW_RATINGS = false;

// ---- Sortable tables --------------------------------------------------------------------------
// Click a header to sort by that column: numbers high-to-low first (kills, ratings, win rates -
// what you want to see on a first click), text A-Z first, a second click flips. Column getters
// live beside each table so the row shape never has to match the header label; a getter returning
// null/undefined/'' sorts last either way, and ties keep the table's original order.

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string = string> { key: K; dir: SortDir }
export type SortValue = number | string | null | undefined;
export type SortGetters<T, K extends string> = Record<K, (row: T) => SortValue>;

export function sortRows<T, K extends string>(rows: T[], getters: SortGetters<T, K>, sort: SortState<K>): T[] {
  const get = getters[sort.key];
  if (!get) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const isEmpty = (v: SortValue) => v === null || v === undefined || v === '';
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      if (isEmpty(a.v) && isEmpty(b.v)) return a.i - b.i;
      if (isEmpty(a.v)) return 1;
      if (isEmpty(b.v)) return -1;
      const cmp = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: 'base', numeric: true });
      return cmp === 0 ? a.i - b.i : cmp * dir;
    })
    .map((x) => x.row);
}

/** Sort state on its own - for several tables that should follow one click (the two team boards on a game page). */
export function useSortState<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = useCallback((key: K, firstDir: SortDir = 'desc') => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }));
  }, []);
  return { sort, toggle };
}

/** Sort state plus the sorted rows, for a single table. Keep `getters` at module scope so it is stable. */
export function useSortedRows<T, G extends SortGetters<T, string>>(rows: T[], getters: G, initial: SortState<Extract<keyof G, string>>) {
  // K comes from the getters' keys, not from `initial` - otherwise TS narrows K to the one initial key
  type K = Extract<keyof G, string>;
  const { sort, toggle } = useSortState<K>(initial);
  const sorted = useMemo(() => sortRows(rows, getters as SortGetters<T, K>, sort), [rows, getters, sort]);
  return { rows: sorted, sort, toggle };
}

/** A clickable header cell. `text` columns sort A-Z on the first click; everything else high-to-low. */
export function SortTh<K extends string>({
  col, sort, onToggle, text = false, className = '', title, children,
}: {
  col: K; sort: SortState<K>; onToggle: (key: K, firstDir?: SortDir) => void; text?: boolean; className?: string; title?: string; children: ReactNode;
}) {
  const active = sort.key === col;
  return (
    <th
      className={`${className} cursor-pointer select-none whitespace-nowrap ${active ? 'text-cyan-300' : 'hover:text-gray-200'}`}
      title={title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onToggle(col, text ? 'asc' : 'desc')}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span aria-hidden className={`text-[9px] leading-none ${active ? 'opacity-100' : 'opacity-0'}`}>{active && sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>
      </span>
    </th>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl overflow-hidden border border-gray-700/50 bg-gray-900/60">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-2 text-sm font-semibold transition-colors ${value === o.value ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/25 text-cyan-100' : 'text-gray-300 hover:text-white hover:bg-cyan-500/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


/**
 * Class colors = the in-game backpack hues (Travis, 2026-09-06), re-saturated on 2026-09-08 after
 * Chris found the desaturated set too flat; class names now render bold in these colors. Ripper
 * Gunner and Heavy Ripper Gunner wear the same suit in game, so they share a red (light / dark).
 * Grenadier is a saturated dark brown. Sniper is still a placeholder.
 */
export const CLASS_COLORS: Array<{ match: RegExp; color: string; label: string }> = [
  { match: /heavy\s*ripper/i, color: '#d14545', label: 'Heavy Ripper Gunner' },
  { match: /ripper/i, color: '#e86c6c', label: 'Ripper Gunner' },
  { match: /machine\s*gun|lmg/i, color: '#f9fafb', label: 'LMG' },
  { match: /marine/i, color: '#2ec4b6', label: 'Marine' },
  { match: /demo/i, color: '#5ed36a', label: 'Demolitions' },
  { match: /medic/i, color: '#e5c445', label: 'Medic' },
  { match: /assault/i, color: '#a970e0', label: 'Assault Trooper' },
  { match: /ranger/i, color: '#e57bd0', label: 'Ranger' },
  { match: /grenad/i, color: '#b5651d', label: 'Grenadier' },
  { match: /sniper/i, color: '#7da6e3', label: 'Sniper (placeholder)' },
];

export function classColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.replace(/^(Titan|Collective)\s+/i, '');
  return CLASS_COLORS.find((c) => c.match.test(n))?.color;
}

/** A class name in its backpack color, bold so the hue reads; falls back to plain text for unknown classes. */
export function ClassName({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={className}>—</span>;
  const color = classColor(name);
  return (
    <span className={`font-semibold ${className}`} style={color ? { color } : undefined}>
      {name}
    </span>
  );
}

export function fmtDuration(s: number | null | undefined) {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtDelta(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

export const tooltipStyle = {
  contentStyle: { background: 'rgba(10, 14, 26, 0.95)', border: '1px solid rgba(34, 211, 238, 0.25)', borderRadius: 12, color: '#e5e7eb', fontSize: 12 },
  labelStyle: { color: '#9ca3af' },
  cursor: { fill: 'rgba(34, 211, 238, 0.05)' },
};
