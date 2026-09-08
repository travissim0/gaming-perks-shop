'use client';

import type { ReactNode } from 'react';
import { CLASS_COLORS, toTimezoneAbbr } from '@/lib/constants';
import type { DraftPlayer } from '@/lib/ctfdl-draft';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function fmt(time: string) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const dh = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return m === '00' ? `${dh}${ampm}` : `${dh}:${m}${ampm}`;
}

function windows(p: DraftPlayer) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of DAY_ORDER) {
    const t = p.availability_times?.[d];
    if (!t) continue;
    const k = `${t.start}-${t.end}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(`${fmt(t.start)}–${fmt(t.end)}`);
  }
  return out;
}

function chip(cls: string, variant: 'preferred' | 'secondary' | 'try', rating?: number) {
  const color = CLASS_COLORS[cls] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  const style = variant === 'preferred' ? color : variant === 'secondary' ? `${color} opacity-70` : 'border-dashed border-white/20 text-[#8B98B0]';
  return (
    <span key={`${variant}-${cls}`} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${style}`}>
      {cls}
      {rating ? <span className="text-[#F59E0B]">★{rating}</span> : null}
    </span>
  );
}

interface Props {
  player: DraftPlayer;
  /** Right-hand slot for actions (Pick / Queue buttons). */
  actions?: ReactNode;
  /** Position in the viewer's queue (1-based), if queued. */
  queuePos?: number | null;
  /** Highlight (e.g. next auto-pick). */
  highlight?: boolean;
  /** Show notes/availability (false = compact one-liner for the recap). */
  detailed?: boolean;
  /** Label to show when drafted (e.g. "#7 · [PT] Pure Talent"). */
  pickedLabel?: string | null;
}

/**
 * A player's full registration, laid out so a captain can size them up at a
 * glance: classes with self-ratings, availability, Discord, notes, staff rank.
 * Captain interest is never shown here.
 */
export default function DraftPlayerCard({ player: p, actions, queuePos, highlight, detailed = true, pickedLabel }: Props) {
  const days = new Set(p.availability_days || []);
  const wins = windows(p);
  const tz = toTimezoneAbbr(p.timezone || undefined);
  return (
    <article className={`rounded-lg bg-[#131A2B] p-3 ${highlight ? 'ring-1 ring-[#22D3EE]/60' : ''} ${pickedLabel ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-base leading-tight text-[#E6EDF7]">{p.alias}</span>
            {p.staff_rank != null && (
              <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title="Staff pre-draft ranking">
                Staff #{p.staff_rank}
              </span>
            )}
            {queuePos != null && (
              <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]" title="Your queue position">
                Queue #{queuePos}
              </span>
            )}
            {pickedLabel && <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{pickedLabel}</span>}
          </div>
          {p.contact_info && <div className="text-xs text-[#8B98B0]">@{p.contact_info.replace(/^@/, '')}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      <div className="mt-2 space-y-1">
        {p.preferred_roles.length > 0 && (
          <div className="flex flex-wrap gap-1">{p.preferred_roles.map((c) => chip(c, 'preferred', p.class_ratings?.[c]))}</div>
        )}
        {detailed && p.secondary_roles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Also</span>
            {p.secondary_roles.map((c) => chip(c, 'secondary', p.class_ratings?.[c]))}
          </div>
        )}
        {detailed && p.classes_to_try.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Learning</span>
            {p.classes_to_try.map((c) => chip(c, 'try'))}
          </div>
        )}
      </div>

      {detailed && (
        <div className="mt-2">
          <div className="grid grid-cols-7 gap-0.5 overflow-hidden rounded">
            {DAY_ORDER.map((d) => (
              <div key={d} title={d} className={`py-0.5 text-center text-[9px] font-semibold ${days.has(d) ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-[#0B0F1A] text-[#8B98B0]/50'}`}>
                {d.slice(0, 2)}
              </div>
            ))}
          </div>
          <div className="mt-0.5 text-[11px] text-[#8B98B0]">
            {wins.length > 0 ? `${wins.join(' · ')} EST` : days.size > 0 ? 'Times not set' : 'Availability not set'}
            {p.timezone && p.timezone !== 'America/New_York' ? ` · plays from ${tz}` : ''}
          </div>
        </div>
      )}

      {detailed && p.notes && (
        <p className="mt-2 line-clamp-3 text-xs text-[#E6EDF7]/80" title={p.notes}>{p.notes}</p>
      )}
    </article>
  );
}
