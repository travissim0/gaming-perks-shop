'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { getClassColor } from '@/utils/classColors';

/*
 * Shared pieces for the CTF stats pages (/stats, /stats/game/[id], /stats/player/[name]).
 *
 * One dark base, one accent, flat cards, condensed display face - the `.ctf-theme` tokens in
 * src/app/league/ctf-theme.css. Everything here reads the schema-2 columns the CTF script has
 * posted since 2026-09-11 (class_play_times, weapon_stats, play_seconds, is_captain, ...) and
 * degrades to the schema-1 row when they are missing, so old games still render.
 */

export const T = {
  page: '#0B0F1A',
  card: '#131A2B',
  card2: '#1B2438',
  accent: '#22D3EE',
  highlight: '#F59E0B',
  win: '#34D399',
  loss: '#F87171',
  text: '#E6EDF7',
  muted: '#8B98B0',
} as const;

/** Offense / defense hues. Defense takes the site accent; offense the highlight amber so neither reads as win/loss. */
export const SIDE = {
  defense: { label: 'Defense', color: T.accent },
  offense: { label: 'Offense', color: T.highlight },
} as const;
export type Side = keyof typeof SIDE;

export const isSide = (s: unknown): s is Side => s === 'offense' || s === 'defense';

// ---- Row shape -------------------------------------------------------------------------------

/** A player_stats row as the API returns it; schema-2 fields optional. */
export interface StatRow {
  id?: number;
  game_id?: string | null;
  player_name: string;
  team: string;
  game_mode: string;
  arena_name?: string;
  base_used?: string;
  side: string;
  result: string;
  main_class: string;
  kills: number;
  deaths: number;
  captures?: number;
  flag_captures?: number;
  carrier_kills: number;
  carry_time_seconds: number;
  class_swaps: number;
  turret_damage: number;
  eb_hits: number;
  accuracy: number;
  avg_resource_unused_per_death?: number;
  avg_explosive_unused_per_death?: number;
  game_length_minutes?: number;
  game_date: string;
  elo_before?: number | null;
  elo_after?: number | null;
  elo_change?: number | null;
  season?: string | null;
  left_early?: boolean | null;
  class_play_times?: Record<string, number> | null;
  weapon_stats?: Record<string, { fired: number; landed: number }> | null;
  play_seconds?: number | null;
  times_summoned?: number | null;
  summons_performed?: number | null;
  mined_tso?: number | null;
  mined_tox?: number | null;
  is_captain?: boolean | null;
  schema_version?: number | null;
  script_version?: string | null;
}

// ---- Formatters ------------------------------------------------------------------------------

export const fmtPct = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined || !isFinite(Number(n)) ? '—' : `${(Number(n) * 100).toFixed(d)}%`;
export const fmtNum = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || !isFinite(Number(n)) ? '—' : Number(n).toFixed(d);
export const fmtKD = (k: number, d: number) => (d > 0 ? (k / d).toFixed(2) : k.toFixed(2));
export const fmtMMSS = (s: number | null | undefined) => {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
export const fmtMinutes = (m: number | null | undefined) => fmtMMSS((Number(m) || 0) * 60);
export const fmtDelta = (v: number | null | undefined, d = 1) => {
  if (v === null || v === undefined || !isFinite(Number(v))) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`;
};
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const relDate = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};

/** Team-name side by the zone's own convention: "PT T" / "Titan Militia'" are Titan, "CKY C" / "Collective'" are Collective. */
export const teamFaction = (team: string | null | undefined): 'T' | 'C' | null => {
  if (!team) return null;
  const t = team.trim();
  if (/\sT$/.test(t) || /titan/i.test(t)) return 'T';
  if (/\sC$/.test(t) || /collective/i.test(t)) return 'C';
  return null;
};

// ---- Small chrome ----------------------------------------------------------------------------

export function Card({ title, right, children, className = '', pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-xl overflow-hidden bg-[#131A2B] min-w-0 ${className}`}>
      {(title || right) && (
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {title && <h2 className="font-display text-lg text-[#E6EDF7]">{title}</h2>}
          {right && <div className="ml-auto text-xs text-[#8B98B0]">{right}</div>}
        </div>
      )}
      <div className={pad ? 'px-4 pb-4' : ''}>{children}</div>
    </section>
  );
}

export function Tag({ children, color, className = '', title }: { children: ReactNode; color?: string; className?: string; title?: string }) {
  const style = color ? { color, background: `${color}1f` } : undefined;
  return (
    <span title={title} style={style} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${color ? '' : 'bg-white/5 text-[#8B98B0]'} ${className}`}>
      {children}
    </span>
  );
}

export function SideBadge({ side, className = '' }: { side: string | null | undefined; className?: string }) {
  if (!isSide(side)) return null;
  return <Tag color={SIDE[side].color} className={className}>{SIDE[side].label}</Tag>;
}

export function ResultBadge({ result, className = '' }: { result: string | null | undefined; className?: string }) {
  const r = (result || '').toLowerCase();
  if (r === 'win') return <Tag color={T.win} className={className}>Win</Tag>;
  if (r === 'loss') return <Tag color={T.loss} className={className}>Loss</Tag>;
  return <Tag className={className}>—</Tag>;
}

export function ModeBadge({ mode, className = '' }: { mode: string | null | undefined; className?: string }) {
  const m = mode || 'Unknown';
  const color = m === 'OvD' ? T.accent : m === 'Mix' ? '#A78BFA' : undefined;
  return <Tag color={color} className={className}>{m}</Tag>;
}

export function CaptainMark({ className = '' }: { className?: string }) {
  return <span title="Captain" aria-label="Captain" className={`text-[#F59E0B] ${className}`}>★</span>;
}

export function PlayerName({ name, mainClass, captain, className = '', link = true }: { name: string; mainClass?: string | null; captain?: boolean | null; className?: string; link?: boolean }) {
  const inner = (
    <span className={`inline-flex items-center gap-1 font-medium ${className}`} style={{ color: mainClass ? getClassColor(mainClass) : T.text }} title={mainClass || undefined}>
      {captain && <CaptainMark />}
      <span className="truncate">{name}</span>
    </span>
  );
  return link ? <Link href={`/stats/player/${encodeURIComponent(name)}`} className="hover:underline underline-offset-2 min-w-0">{inner}</Link> : inner;
}

export function ClassChip({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={`text-[#8B98B0] ${className}`}>—</span>;
  return <span className={`font-medium ${className}`} style={{ color: getClassColor(name) }}>{name}</span>;
}

// ---- Class split -----------------------------------------------------------------------------

export type ClassEntries = Array<[string, number]>;

/** Normalised, sorted class -> seconds entries; anything under 5% of the total is folded away. */
export function classEntries(classes: Record<string, number> | null | undefined, minShare = 0.05): { shown: ClassEntries; all: ClassEntries; total: number } {
  const all = Object.entries(classes ?? {})
    .map(([n, s]) => [n, Number(s)] as [string, number])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = all.reduce((s, [, v]) => s + v, 0);
  const shown = total > 0 ? all.filter(([, s]) => s / total >= minShare) : [];
  return { shown, all, total };
}

/**
 * The class a player is credited with plus, when they spent real time as more than one, a thin
 * stacked bar in class colours and a "Infantry 62% · Heavy Weapons 38%" line. Hover for minutes.
 */
export function ClassSplit({ classes, primary, compact = false }: { classes?: Record<string, number> | null; primary: string; compact?: boolean }) {
  const { shown, all, total } = classEntries(classes);
  if (shown.length < 2) return <ClassChip name={primary} />;
  return (
    <div className="min-w-[7rem]" title={all.map(([n, s]) => `${n} ${fmtMMSS(s)}`).join(' · ')}>
      <ClassChip name={primary} />
      <div className="mt-1 flex h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        {shown.map(([n, s]) => <span key={n} style={{ width: `${(s / total) * 100}%`, background: getClassColor(n) }} />)}
      </div>
      {!compact && (
        <div className="mt-0.5 whitespace-nowrap text-[10px] text-[#8B98B0]">
          {shown.map(([n, s]) => `${n} ${Math.round((s / total) * 100)}%`).join(' · ')}
        </div>
      )}
    </div>
  );
}

/** Horizontal class-time bars for an aggregate (a player across games, or a whole team). */
export function ClassBars({ classes, emptyText = 'No class time recorded.' }: { classes: Record<string, number> | null | undefined; emptyText?: string }) {
  const { all, total } = classEntries(classes, 0);
  if (!all.length) return <p className="text-sm text-[#8B98B0]">{emptyText}</p>;
  const max = all[0][1];
  return (
    <ul className="space-y-1.5">
      {all.map(([n, s]) => (
        <li key={n} className="grid grid-cols-[minmax(6rem,1fr)_minmax(0,3fr)_3.5rem_3rem] items-center gap-2 text-sm">
          <ClassChip name={n} className="truncate" />
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s / max) * 100}%`, background: getClassColor(n) }} /></div>
          <span className="text-right tabular-nums text-[#E6EDF7]">{fmtMMSS(s)}</span>
          <span className="text-right tabular-nums text-xs text-[#8B98B0]">{Math.round((s / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

// ---- Weapons ---------------------------------------------------------------------------------

export type WeaponCell = { fired: number; landed: number };
export type WeaponMap = Record<string, WeaponCell>;

export function mergeWeapons(into: WeaponMap, from: WeaponMap | null | undefined): WeaponMap {
  for (const [name, cell] of Object.entries(from ?? {})) {
    if (!cell) continue;
    const cur = into[name] ?? (into[name] = { fired: 0, landed: 0 });
    cur.fired += Number(cell.fired) || 0;
    cur.landed += Number(cell.landed) || 0;
  }
  return into;
}

export function mergeClasses(into: Record<string, number>, from: Record<string, number> | null | undefined): Record<string, number> {
  for (const [name, secs] of Object.entries(from ?? {})) into[name] = (into[name] ?? 0) + (Number(secs) || 0);
  return into;
}

export function weaponRows(weapons: WeaponMap | null | undefined) {
  return Object.entries(weapons ?? {})
    .map(([name, c]) => ({ name, fired: Number(c?.fired) || 0, landed: Number(c?.landed) || 0, acc: c?.fired ? (Number(c.landed) || 0) / Number(c.fired) : 0 }))
    .filter((w) => w.fired > 0)
    .sort((a, b) => b.fired - a.fired);
}

/** Per-weapon shots fired / landed / accuracy, with a bar so the best gun stands out. */
export function WeaponTable({ weapons, max = 12, emptyText = 'No weapon data for this game.' }: { weapons: WeaponMap | null | undefined; max?: number; emptyText?: string }) {
  const rows = weaponRows(weapons).slice(0, max);
  if (!rows.length) return <p className="text-sm text-[#8B98B0]">{emptyText}</p>;
  const most = rows[0].fired;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0]">
          <th className="py-1 pr-2 text-left font-normal">Weapon</th>
          <th className="py-1 px-2 text-right font-normal">Fired</th>
          <th className="py-1 px-2 text-right font-normal">Hit</th>
          <th className="py-1 pl-2 text-right font-normal w-28">Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => (
          <tr key={w.name} className="border-t border-white/[0.06]">
            <td className="py-1 pr-2 text-[#E6EDF7]">
              <div className="truncate max-w-[14rem]">{w.name}</div>
              <div className="mt-0.5 h-1 w-full max-w-[14rem] rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-[#22D3EE]/60" style={{ width: `${(w.fired / most) * 100}%` }} /></div>
            </td>
            <td className="py-1 px-2 text-right tabular-nums text-[#E6EDF7]">{w.fired}</td>
            <td className="py-1 px-2 text-right tabular-nums text-[#8B98B0]">{w.landed}</td>
            <td className="py-1 pl-2 text-right tabular-nums" style={{ color: w.acc >= 0.5 ? T.win : w.acc >= 0.3 ? T.text : T.muted }}>{fmtPct(w.acc)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- Stat tiles ------------------------------------------------------------------------------

export function StatTile({ label, value, hint, color }: { label: string; value: ReactNode; hint?: ReactNode; color?: string }) {
  return (
    <div className="rounded-lg bg-[#131A2B] px-3 py-3 text-center min-w-0">
      <div className="font-display text-2xl leading-none tabular-nums" style={{ color: color || T.text }}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[#8B98B0]">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[#8B98B0]">{hint}</div>}
    </div>
  );
}

export function Skeleton({ rows = 4, h = 'h-9' }: { rows?: number; h?: string }) {
  return <div className="space-y-2 animate-pulse">{Array.from({ length: rows }).map((_, i) => <div key={i} className={`${h} rounded-md bg-white/5`} />)}</div>;
}
