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
  /** role = support first (default); side = optional offense / defense planning groups. */
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
export function PlayerName({ alias, roles, src, focus = null, className = '' }: { alias: string; roles?: PlayerRoles; src: ColorSource; focus?: RoleKey | null; className?: string }) {
  const tier = focus ? covers(roles, focus, src) : null;
  const style: CSSProperties = { color: roleColor(primaryRole(roles, src)) };
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

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex rounded bg-[#0B0F1A] p-px">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`rounded-sm px-1.5 leading-[18px] transition-colors ${value === v ? 'bg-white/10 text-[#E6EDF7]' : 'text-[#8B98B0] hover:text-[#E6EDF7]'}`}>{l}</button>
      ))}
    </span>
  );
}

/** Colour source, sort, skin, and the colour legend. */
export function RosterControls({ prefs, onChange }: { prefs: RosterPrefs; onChange: (p: Partial<RosterPrefs>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#8B98B0]">
      <span className="inline-flex items-center gap-1" title="Draft = their league registration (mains, then secondaries). Mix = what they actually played in CTF mixes.">
        Colour <Seg value={prefs.color} options={[['draft', 'Draft'], ['mix', 'Mixes']]} onChange={(color) => onChange({ color })} />
      </span>
      <span className="inline-flex items-center gap-1">
        Order <Seg value={prefs.sort} options={[['role', 'Role'], ['alpha', 'A–Z'], ['side', 'O / D plan']]} onChange={(sort) => onChange({ sort })} />
      </span>
      <span className="inline-flex items-center gap-1">
        Skin <Seg value={prefs.skin} options={[['site', 'Site'], ['game', 'In-game']]} onChange={(skin) => onChange({ skin })} />
      </span>
      <span className="inline-flex items-center gap-1" title="Field: lineups drawn with the in-game characters and flag. Experimental.">
        View <Seg value={prefs.view} options={[['list', 'List'], ['field', 'Field (beta)']]} onChange={(view) => onChange({ view })} />
      </span>
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        {ROLE_ORDER.map((k) => (
          <span key={k} className="inline-flex items-center gap-0.5" title={ROLE_META[k].label}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROLE_META[k].color }} />
            <span style={{ color: ROLE_META[k].color }}>{ROLE_META[k].short}</span>
          </span>
        ))}
        <span className="text-[#FB923C]" title="Offense lean">O</span><span className="text-[#60A5FA]" title="Defense lean">D</span>
      </span>
    </div>
  );
}
