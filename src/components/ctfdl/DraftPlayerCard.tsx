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

function chip(cls: string, variant: 'preferred' | 'secondary' | 'try', rating?: number, emphasis?: boolean) {
  const color = CLASS_COLORS[cls] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  const style =
    variant === 'preferred' ? color
    : variant === 'secondary' ? `${color} opacity-60`
    : 'border-dashed border-white/20 text-[#8B98B0]';
  return (
    <span key={`${variant}-${cls}`} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${style} ${emphasis ? 'ring-1 ring-[#22D3EE]' : ''}`}>
      {cls}
      {rating ? <span className={variant === 'preferred' ? 'text-[#F59E0B]' : 'text-[#F59E0B]/60'}>★{rating}</span> : null}
    </span>
  );
}

/** Seven tiny day cells. */
function DayStrip({ days, size = 'md' }: { days: Set<string>; size?: 'sm' | 'md' }) {
  return (
    <div className={`grid grid-cols-7 overflow-hidden rounded ${size === 'sm' ? 'w-[70px] gap-px' : 'gap-0.5'}`}>
      {DAY_ORDER.map((d) => (
        <div
          key={d}
          title={d}
          className={`text-center font-semibold ${size === 'sm' ? 'h-2.5 text-[0px]' : 'py-0.5 text-[9px]'} ${days.has(d) ? 'bg-[#34D399]/30 text-[#34D399]' : 'bg-[#0B0F1A] text-[#8B98B0]/50'}`}
        >
          {size === 'sm' ? '' : d.slice(0, 2)}
        </div>
      ))}
    </div>
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
  /** Compact = one scannable row; click the row to expand the full card. */
  compact?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Class currently being filtered on — emphasised in the chip row. */
  focusClass?: string | null;
  /** Label to show when drafted (e.g. "#7 · [PT] Pure Talent"). */
  pickedLabel?: string | null;
}

/**
 * A player's registration, laid out so a captain can size them up fast:
 * compact row (name, staff rank, top classes, days) that expands to the full
 * card (secondary + learning classes, time windows, Discord, notes).
 * Captain interest is never shown here.
 */
export default function DraftPlayerCard({ player: p, actions, queuePos, highlight, compact = false, expanded = false, onToggle, focusClass, pickedLabel }: Props) {
  const days = new Set(p.availability_days || []);
  const wins = windows(p);
  const tz = toTimezoneAbbr(p.timezone || undefined);
  const showDetails = !compact || expanded;

  const badges = (
    <>
      {p.staff_rank != null && (
        <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title="Staff pre-draft ranking">
          #{p.staff_rank}
        </span>
      )}
      {queuePos != null && (
        <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]" title="Your queue position">
          Q{queuePos}
        </span>
      )}
      {pickedLabel && <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{pickedLabel}</span>}
    </>
  );

  // Preferred chips, the filtered class first if present.
  const preferred = focusClass && p.preferred_roles.includes(focusClass)
    ? [focusClass, ...p.preferred_roles.filter((c) => c !== focusClass)]
    : p.preferred_roles;
  const secondaryHasFocus = !!focusClass && !p.preferred_roles.includes(focusClass) && p.secondary_roles.includes(focusClass);

  return (
    <article className={`rounded-lg bg-[#131A2B] ${compact ? 'px-2.5 py-1.5' : 'p-3'} ${highlight ? 'ring-1 ring-[#22D3EE]/60' : ''} ${pickedLabel ? 'opacity-60' : ''}`}>
      {/* Row / header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={!compact}
          className={`min-w-0 flex-1 text-left ${compact ? 'cursor-pointer' : 'cursor-default'}`}
          aria-expanded={compact ? expanded : undefined}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-base leading-tight text-[#E6EDF7]">{p.alias}</span>
            {badges}
            {compact && !expanded && (
              <>
                <span className="flex flex-wrap gap-1">
                  {preferred.slice(0, 4).map((c) => chip(c, 'preferred', p.class_ratings?.[c], c === focusClass))}
                  {secondaryHasFocus && chip(focusClass!, 'secondary', p.class_ratings?.[focusClass!], true)}
                  {preferred.length > 4 && <span className="text-[10px] text-[#8B98B0]">+{preferred.length - 4}</span>}
                </span>
                <span className="ml-auto"><DayStrip days={days} size="sm" /></span>
              </>
            )}
          </div>
          {showDetails && p.contact_info && <div className="text-xs text-[#8B98B0]">@{p.contact_info.replace(/^@/, '')}</div>}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      {showDetails && (
        <>
          <div className="mt-2 space-y-1">
            {p.preferred_roles.length > 0 && (
              <div className="flex flex-wrap gap-1">{preferred.map((c) => chip(c, 'preferred', p.class_ratings?.[c], c === focusClass))}</div>
            )}
            {p.secondary_roles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Also</span>
                {p.secondary_roles.map((c) => chip(c, 'secondary', p.class_ratings?.[c], c === focusClass))}
              </div>
            )}
            {p.classes_to_try.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Learning</span>
                {p.classes_to_try.map((c) => chip(c, 'try'))}
              </div>
            )}
          </div>

          <div className="mt-2">
            <DayStrip days={days} />
            <div className="mt-0.5 text-[11px] text-[#8B98B0]">
              {wins.length > 0 ? `${wins.join(' · ')} EST` : days.size > 0 ? 'Times not set' : 'Availability not set'}
              {p.timezone && p.timezone !== 'America/New_York' ? ` · plays from ${tz}` : ''}
            </div>
          </div>

          {p.notes && <p className="mt-2 text-xs text-[#E6EDF7]/80">{p.notes}</p>}
        </>
      )}
    </article>
  );
}
