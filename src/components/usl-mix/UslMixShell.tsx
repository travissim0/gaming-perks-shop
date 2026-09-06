'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${(rand() * 100).toFixed(2)}%`,
    top: `${(rand() * 100).toFixed(2)}%`,
    size: +(rand() * 1.6 + 0.4).toFixed(2),
    opacity: +(rand() * 0.45 + 0.1).toFixed(2),
    color: colors[Math.floor(rand() * colors.length)],
    duration: `${(rand() * 5 + 3).toFixed(1)}s`,
    delay: `${(rand() * 5).toFixed(1)}s`,
    twinkle: rand() > 0.6,
  }));
}

function SpaceBackdrop() {
  const stars = useMemo(() => seededStars(140, 20260905), []);
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 25% 15%, rgba(34, 211, 238, 0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(34, 211, 238, 0.04) 0%, transparent 40%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 75% 25%, rgba(139, 92, 246, 0.06) 0%, transparent 45%), radial-gradient(ellipse at 15% 75%, rgba(139, 92, 246, 0.04) 0%, transparent 40%)' }} />
      {stars.map((st) => (
        <div
          key={st.id}
          className={`absolute rounded-full ${st.twinkle ? 'animate-pulse' : ''}`}
          style={{ left: st.left, top: st.top, width: st.size, height: st.size, backgroundColor: st.color, opacity: st.opacity, animationDuration: st.duration, animationDelay: st.delay }}
        />
      ))}
    </div>
  );
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
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border backdrop-blur-sm transition-all duration-200 ${
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
    <section className={`relative overflow-hidden rounded-2xl border ${a.border} bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl ${a.shadow} ${className}`}>
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
    <div className={`relative overflow-hidden rounded-2xl border ${a.border} bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-lg ${a.shadow} p-4`}>
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

export const controlCls = 'bg-gray-900/60 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-cyan-500/50 backdrop-blur-sm';

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl overflow-hidden border border-gray-700/50 bg-gray-900/60 backdrop-blur-sm">
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
 * Class colors = the in-game backpack hues (Travis, 2026-09-06). Desaturated so they read as
 * labels, lifted just enough for the dark surface. Grenadier, Ripper Gunner and Sniper were not
 * specified and are placeholders.
 */
export const CLASS_COLORS: Array<{ match: RegExp; color: string; label: string }> = [
  { match: /heavy\s*ripper/i, color: '#b85c5c', label: 'Heavy Ripper' },
  { match: /ripper/i, color: '#d07e7e', label: 'Ripper Gunner (placeholder)' },
  { match: /machine\s*gun|lmg/i, color: '#f3f4f6', label: 'LMG' },
  { match: /marine/i, color: '#5fa8a3', label: 'Marine' },
  { match: /demo/i, color: '#7fb07f', label: 'Demolitions' },
  { match: /medic/i, color: '#c9b35a', label: 'Medic' },
  { match: /assault/i, color: '#9d7cb8', label: 'Assault Trooper' },
  { match: /ranger/i, color: '#c97fb4', label: 'Ranger' },
  { match: /grenad/i, color: '#c9945c', label: 'Grenadier (placeholder)' },
  { match: /sniper/i, color: '#8c9db8', label: 'Sniper (placeholder)' },
];

export function classColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.replace(/^(Titan|Collective)\s+/i, '');
  return CLASS_COLORS.find((c) => c.match.test(n))?.color;
}

/** A class name in its backpack color; falls back to plain text for unknown classes. */
export function ClassName({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={className}>—</span>;
  const color = classColor(name);
  return (
    <span className={`font-medium ${className}`} style={color ? { color } : undefined}>
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
  contentStyle: { background: 'rgba(10, 14, 26, 0.95)', border: '1px solid rgba(34, 211, 238, 0.25)', borderRadius: 12, color: '#e5e7eb', fontSize: 12, backdropFilter: 'blur(6px)' },
  labelStyle: { color: '#9ca3af' },
  cursor: { fill: 'rgba(34, 211, 238, 0.05)' },
};
