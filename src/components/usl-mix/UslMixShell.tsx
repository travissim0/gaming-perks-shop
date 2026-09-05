'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

/** Titan / Collective series colors - validated for the dark surface, keep in fixed order. */
export const SIDE_COLORS = { T: '#3987e5', C: '#d95926' } as const;
/** Single-series chart hue (class / weapon bars) so it never reads as a side. */
export const SERIES_NEUTRAL = '#199e70';

const TABS = [
  { href: '/usl-mix', label: 'Overview' },
  { href: '/usl-mix/games', label: 'Games' },
  { href: '/usl-mix/api', label: 'Public API' },
];

export default function UslMixShell({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const { user } = useAuth();
  const pathname = usePathname() || '';
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <Link href="/usl-mix" className="text-xs uppercase tracking-widest text-cyan-400/80 hover:text-cyan-300">USL Mix Stats</Link>
            <h1 className="text-3xl md:text-4xl font-bold text-white mt-1">{title ?? 'USL Mix Stats'}</h1>
            {subtitle && <p className="text-gray-400 mt-2 max-w-3xl">{subtitle}</p>}
          </div>
          <nav className="flex gap-2 flex-wrap">
            {TABS.map((t) => {
              const active = t.href === '/usl-mix' ? pathname === '/usl-mix' : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    active ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200' : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-cyan-500/40 hover:text-white'
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
  );
}

export function Panel({ title, children, right, className = '' }: { title?: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4 md:p-6 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-2xl md:text-3xl font-bold text-white mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

export function SideBadge({ side }: { side: string | null | undefined }) {
  if (side !== 'T' && side !== 'C') return <span className="text-gray-500">?</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ color: SIDE_COLORS[side], border: `1px solid ${SIDE_COLORS[side]}55`, background: `${SIDE_COLORS[side]}22` }}
    >
      {side === 'T' ? 'Titan' : 'Collective'}
    </span>
  );
}

export function ResultBadge({ result }: { result: string | null | undefined }) {
  const cls = result === 'win' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40' : result === 'loss' ? 'text-rose-300 bg-rose-500/15 border-rose-500/40' : 'text-gray-300 bg-gray-500/15 border-gray-500/40';
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border uppercase ${cls}`}>{result ?? '—'}</span>;
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
  contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', fontSize: 12 },
  labelStyle: { color: '#9ca3af' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};
