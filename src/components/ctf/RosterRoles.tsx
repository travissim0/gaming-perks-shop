'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  COVERAGE_ROLES, ROLE_META, ROLE_ORDER, covers, placeSides, primaryRole, roleColor, roleRank, rolesTitle, sideLean, tagsFor,
  type ColorSource, type PlayerRoles, type RoleKey, type SideLetter, type SidePlacement,
} from '@/lib/ctf-roles';

/**
 * Roster/lineup display helpers for the match page: names coloured by the class
 * they play, compact role tags, a support-coverage strip and the view controls.
 */

export type RolesMap = Record<string, PlayerRoles>;

export interface RosterPrefs {
  /** Colour and tag names from the draft registration or from mix play. */
  color: ColorSource;
  /** role = support first (default). 'side' groups by offense / defense: used internally by the Plan tab. */
  sort: 'side' | 'role' | 'alpha';
  /** 'game' = black, tight, small type, closer to the in-game player list. */
  skin: 'site' | 'game';
  /** 'field' = experimental sprite view of the lineups (LineupField.tsx). */
  view: 'list' | 'field';
}

const PREFS_KEY = 'match-roster-prefs-v3';
const DEFAULT_PREFS: RosterPrefs = { color: 'draft', sort: 'role', skin: 'site', view: 'list' };

/** Per-viewer view settings, remembered in this browser when it allows it. */
export function useRosterPrefs(): [RosterPrefs, (p: Partial<RosterPrefs>) => void] {
  const [prefs, setPrefs] = useState<RosterPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (saved && typeof saved === 'object') setPrefs({ ...DEFAULT_PREFS, ...saved });
    } catch { /* private window or blocked storage: defaults */ }
  }, []);
  const update = useCallback((p: Partial<RosterPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
      return next;
    });
  }, []);
  return [prefs, update];
}

/** Sort players for display: as given (alpha), or support roles first. */
export function sortByPrefs<T extends { alias: string }>(list: T[], idOf: (x: T) => string, roles: RolesMap, prefs: RosterPrefs): T[] {
  if (prefs.sort === 'alpha') return list;
  return [...list].sort((a, b) => roleRank(roles[idOf(a)], prefs.color) - roleRank(roles[idOf(b)], prefs.color) || a.alias.localeCompare(b.alias));
}

export const SIDE_COLOR: Record<SideLetter, string> = { O: '#FB923C', D: '#60A5FA' };

export interface Bucket<T> { key: SideLetter | 'all'; label: string; items: T[]; place: Record<string, SidePlacement> }

/**
 * Optional offense / defense groups (Order: O / D). A planning aid for captains only: the
 * zone never reads it. The captain's own arrangement (plan, saved with the lineup) wins;
 * otherwise placeSides in ctf-roles.ts suggests one (medics on defense, their own lean,
 * then either-side players to cover missing support, then to even the numbers).
 * One bucket holding everyone when the viewer isn't grouping by side.
 */
export function bucketBySide<T extends { alias: string }>(list: T[], idOf: (x: T) => string, roles: RolesMap, prefs: RosterPrefs, plan: Record<string, SideLetter> = {}): Bucket<T>[] {
  const sorted = sortByPrefs(list, idOf, roles, prefs);
  if (prefs.sort !== 'side') return [{ key: 'all', label: '', items: sorted, place: {} }];
  const place = placeSides(sorted.map(idOf), roles, prefs.color, plan);
  return (['O', 'D'] as SideLetter[])
    .map((k) => ({ key: k, label: k === 'O' ? 'Offense' : 'Defense', items: sorted.filter((x) => place[idOf(x)]?.side === k), place }))
    .filter((b) => b.items.length > 0);
}

/** A side's header: just its name and head count, centred. */
export function BucketHeader({ k, label, count, className = '' }: { k: SideLetter | 'all'; label: string; count: number; className?: string }) {
  if (k === 'all') return null;
  const color = SIDE_COLOR[k];
  return (
    <div
      className={`border-l-[3px] px-2 text-center text-[11px] font-semibold uppercase leading-5 tracking-[0.15em] ${className}`}
      style={{ borderColor: color, backgroundColor: `${color}14`, color }}
      title="Planning aid for your squad only. It has no effect on where the zone puts anyone."
    >
      {label} <span className="font-normal tracking-normal text-[#8B98B0] tabular-nums">{count}</span>
    </div>
  );
}

/** Rows under a side header carry its colour down the left edge. */
export const sideRail = (k: SideLetter | 'all') => (k === 'all' ? undefined : { borderLeft: `3px solid ${SIDE_COLOR[k]}55` });

/** Why an either-side player was suggested for this group. Nothing when it's their lean, their class or the captain's call. */
export function PlaceMark({ p }: { p?: SidePlacement }) {
  if (!p || p.why === 'lean' || p.why === 'role' || p.why === 'plan') return null;
  if (p.why === 'need' && p.role) {
    return (
      <span className="shrink-0 text-[9px] opacity-75" style={{ color: ROLE_META[p.role].color }} title={`Plays either side. Suggested for ${p.side === 'D' ? 'defense' : 'offense'} to cover ${ROLE_META[p.role].label}.`}>
        ⇄ {ROLE_META[p.role].short}
      </span>
    );
  }
  return <span className="shrink-0 text-[10px] text-[#8B98B0]/60" title="Plays either side (or not enough mix games to tell). Suggested here to even the numbers.">⇄</span>;
}

/**
 * A name in its class colour. With a coverage role focused, mains of that role get a solid
 * underline in the role colour and secondaries a dashed one, so the two read apart.
 */
export function PlayerName({ alias, roles, src, focus = null, as = null, className = '' }: { alias: string; roles?: PlayerRoles; src: ColorSource; focus?: RoleKey | null; as?: RoleKey | null; className?: string }) {
  const tier = focus ? covers(roles, focus, src) : null;
  // `as` = the class the captain planned them on for this match; it wins over what they usually play.
  const style: CSSProperties = { color: roleColor(as || primaryRole(roles, src)) };
  if (tier && focus) {
    style.textDecorationLine = 'underline';
    style.textDecorationColor = ROLE_META[focus].color;
    style.textUnderlineOffset = '3px';
    style.textDecorationStyle = tier === 'main' ? 'solid' : 'dashed';
    style.textDecorationThickness = tier === 'main' ? '2px' : '1px';
    if (tier === 'main') style.fontWeight = 600;
    else style.opacity = 0.8;
  }
  return (
    <span className={className} style={style} title={`${rolesTitle(alias, roles)}${tier && focus ? `\n${ROLE_META[focus].label}: ${tier === 'main' ? 'main' : 'secondary'}` : ''}`}>
      {alias}
    </span>
  );
}

/** The class a captain planned this player on (Field view), shown solid next to the name. */
export function PlanClassTag({ k }: { k?: RoleKey | null }) {
  if (!k) return null;
  return (
    <span className="shrink-0 rounded-sm px-1 text-[9px] font-semibold leading-[14px]" style={{ color: '#0B0F1A', backgroundColor: ROLE_META[k].color }} title={`Planned as ${ROLE_META[k].label} for this match`}>
      {ROLE_META[k].short}
    </span>
  );
}

/** The player's in-game answer to their plan: a check for ?y, what they'd rather play for ?n. */
export function PlanAckTag({ ack, side, cls }: { ack?: 'yes' | 'no' | null; side?: 'O' | 'D' | null; cls?: RoleKey | null }) {
  if (!ack) return null;
  if (ack === 'yes') return <span className="shrink-0 text-[11px] font-bold leading-none text-[#34D399]" title="Accepted in game (?y)">✓</span>;
  const want = [side, cls ? ROLE_META[cls].short : null].filter(Boolean).join(' ');
  return (
    <span className="shrink-0 rounded-sm bg-[#F59E0B]/15 px-1 text-[9px] font-semibold leading-[14px] text-[#F59E0B]" title={want ? `Declined in game; would rather play ${want}` : 'Declined in game (?n)'}>
      {want ? `wants ${want}` : 'declined'}
    </span>
  );
}

/** Tiny tags: mains bright, secondaries dim. Sides prefix the class ("D INF"). */
export function RoleTags({ roles, src, max = 4, className = '' }: { roles?: PlayerRoles; src: ColorSource; max?: number; className?: string }) {
  const tags = tagsFor(roles, src);
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {shown.map((t) => (
        <span
          key={t.key}
          className={`rounded-sm px-1 text-[9px] font-semibold leading-[14px] tracking-wide ${t.tier === 'main' ? '' : 'opacity-50'}`}
          style={{ color: ROLE_META[t.key].color, backgroundColor: `${ROLE_META[t.key].color}1f` }}
          title={`${ROLE_META[t.key].label}${t.sides.length === 1 ? (t.sides[0] === 'O' ? ' · offense' : ' · defense') : ''} · ${t.tier === 'main' ? 'main' : 'secondary'}${t.share != null ? ` · ${Math.round(t.share * 100)}% of mixes` : ''}`}
        >
          {t.sides.length === 1 ? `${t.sides[0]} ` : ''}{ROLE_META[t.key].short}
        </span>
      ))}
      {tags.length > max && <span className="text-[9px] text-[#8B98B0]" title={tags.slice(max).map((t) => ROLE_META[t.key].label).join(', ')}>+{tags.length - max}</span>}
    </span>
  );
}

/** O / D lean from mixes (or draft sides). */
export function SideLean({ roles }: { roles?: PlayerRoles }) {
  const l = sideLean(roles);
  if (!l) return null;
  const cls = l.side === 'O' ? 'text-[#FB923C]' : l.side === 'D' ? 'text-[#60A5FA]' : 'text-[#8B98B0]';
  const title = l.side === 'OD' ? 'Plays both offense and defense' : `${l.side === 'O' ? 'Offense' : 'Defense'}${l.pct ? ` ${l.pct}% of sided mix games` : ' (draft)'}`;
  return <span className={`text-[9px] font-semibold tabular-nums ${cls}`} title={title}>{l.side}{l.pct ? <span className="opacity-70">{l.pct}</span> : null}</span>;
}

/**
 * Who covers the critical roles: mains, plus secondaries after the "+".
 * Click a role to highlight the players who can play it.
 */
export function Coverage({ ids, roles, src, label, focus, onFocus }: {
  ids: string[]; roles: RolesMap; src: ColorSource; label: string;
  focus: RoleKey | null; onFocus: (k: RoleKey | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px]">
      <span className="uppercase tracking-wide text-[#8B98B0] mr-0.5">{label}</span>
      {COVERAGE_ROLES.map((k) => {
        let main = 0;
        let sec = 0;
        ids.forEach((id) => { const c = covers(roles[id], k, src); if (c === 'main') main += 1; else if (c === 'sec') sec += 1; });
        const none = main + sec === 0;
        const on = focus === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onFocus(on ? null : k)}
            className={`rounded-sm px-1 leading-[16px] tabular-nums transition-colors ${on ? 'ring-1 ring-current' : 'hover:bg-white/5'} ${none ? 'opacity-60' : ''}`}
            style={{ color: none ? '#F87171' : ROLE_META[k].color }}
            title={`${ROLE_META[k].label}: ${main} main${sec ? `, ${sec} secondary` : ''}${none ? ' · nobody' : ''}. Click to highlight them.`}
          >
            <span className="font-semibold">{ROLE_META[k].short}</span> {main}{sec ? <span className="opacity-60">+{sec}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Dim a row when a coverage role is focused and this player doesn't cover it. */
export const dimmed = (roles: PlayerRoles | undefined, focus: RoleKey | null, src: ColorSource) =>
  !!focus && !covers(roles, focus, src);

/** One labelled choice in the Display panel: full-width buttons, easy to hit. */
function Choice<T extends string>({ label, hint, value, options, onChange }: { label: string; hint: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-[#E6EDF7]">{label}</span>
        <span className="text-[10px] text-[#8B98B0]">{hint}</span>
      </div>
      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${value === v ? 'bg-[#22D3EE]/15 text-[#22D3EE] ring-1 ring-[#22D3EE]/40' : 'bg-white/5 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]'}`}
          >{l}</button>
        ))}
      </div>
    </div>
  );
}

/** The class colour key: a dot and short name per class. */
export function RoleLegend({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] ${className}`}>
      {ROLE_ORDER.map((k) => (
        <span key={k} className="inline-flex items-center gap-1" title={ROLE_META[k].label}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROLE_META[k].color }} />
          <span style={{ color: ROLE_META[k].color }}>{ROLE_META[k].short}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Display settings for rosters and lineups: one small button that opens a panel with the
 * choices spelled out and the class colour key.
 */
export function RosterControls({ prefs, onChange }: { prefs: RosterPrefs; onChange: (p: Partial<RosterPrefs>) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${open ? 'bg-white/10 text-[#E6EDF7]' : 'bg-white/5 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]'}`}
          title="How rosters and lineups are shown (just for you)"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 4h12M2 8h12M2 12h12" /><circle cx="5" cy="4" r="1.5" fill="currentColor" /><circle cx="11" cy="8" r="1.5" fill="currentColor" /><circle cx="7" cy="12" r="1.5" fill="currentColor" /></svg>
          Display
          <span className="text-[#8B98B0]/80">{prefs.color === 'mix' ? 'Mixes' : 'Draft'} · {prefs.view === 'field' ? 'Field' : 'List'}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg bg-[#0B0F1A] p-3 shadow-xl ring-1 ring-white/10">
            <Choice label="Colour names by" hint="draft roles or mix play" value={prefs.color} options={[['draft', 'Draft'], ['mix', 'Mixes']]} onChange={(color) => onChange({ color })} />
            <Choice label="Order" hint="support classes first, or by name" value={prefs.sort === 'alpha' ? 'alpha' : 'role'} options={[['role', 'Role'], ['alpha', 'A–Z']]} onChange={(sort) => onChange({ sort })} />
            <Choice label="View" hint="field draws the in-game characters" value={prefs.view} options={[['list', 'List'], ['field', 'Field (beta)']]} onChange={(view) => onChange({ view })} />
            <Choice label="Skin" hint="site or in-game look" value={prefs.skin} options={[['site', 'Site'], ['game', 'In-game']]} onChange={(skin) => onChange({ skin })} />
            <div>
              <div className="text-[11px] font-medium text-[#E6EDF7]">Class colours</div>
              <RoleLegend className="mt-1" />
            </div>
            <p className="text-[10px] text-[#8B98B0]/80">Only changes how this page looks for you.</p>
          </div>
        )}
    </span>
  );
}
