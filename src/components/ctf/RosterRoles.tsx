'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BUCKET_LABEL, COVERAGE_ROLES, ROLE_META, ROLE_ORDER, covers, primaryRole, roleColor, roleRank, rolesTitle, sideBucket, sideLean, tagsFor,
  type ColorSource, type PlayerRoles, type RoleKey, type SideBucket,
} from '@/lib/ctf-roles';

/**
 * Roster/lineup display helpers for the match page: names coloured by the class
 * they play, compact role tags, a support-coverage strip and the view controls.
 */

export type RolesMap = Record<string, PlayerRoles>;

export interface RosterPrefs {
  /** Colour and tag names from the draft registration or from mix play. */
  color: ColorSource;
  /** 'side' = grouped into offense / defense / either, support roles first within each. */
  sort: 'side' | 'role' | 'alpha';
  /** 'game' = black, tight, small type, closer to the in-game player list. */
  skin: 'site' | 'game';
}

const PREFS_KEY = 'match-roster-prefs-v2';
const DEFAULT_PREFS: RosterPrefs = { color: 'draft', sort: 'side', skin: 'site' };

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

/**
 * Offense / defense / either buckets from each player's lean (mixes, else draft sides).
 * One bucket holding everyone when the viewer isn't sorting by side. Empty buckets are dropped.
 */
export function bucketBySide<T extends { alias: string }>(list: T[], idOf: (x: T) => string, roles: RolesMap, prefs: RosterPrefs): { key: SideBucket | 'all'; label: string; items: T[] }[] {
  const sorted = sortByPrefs(list, idOf, roles, prefs);
  if (prefs.sort !== 'side') return [{ key: 'all', label: '', items: sorted }];
  return (['O', 'D', 'F'] as SideBucket[])
    .map((k) => ({ key: k, label: BUCKET_LABEL[k], items: sorted.filter((x) => sideBucket(roles[idOf(x)]) === k) }))
    .filter((b) => b.items.length > 0);
}

/** A bucket's header: name, head count, and the support roles in it (mains only). */
export function BucketHeader({ k, label, ids, roles, src, note, className = '' }: { k: SideBucket | 'all'; label: string; ids: string[]; roles: RolesMap; src: ColorSource; note?: string; className?: string }) {
  if (k === 'all') return null;
  const color = k === 'O' ? '#FB923C' : k === 'D' ? '#60A5FA' : '#8B98B0';
  const support = COVERAGE_ROLES.map((r) => ({ r, n: ids.filter((id) => covers(roles[id], r, src) === 'main').length })).filter((x) => x.n > 0);
  return (
    <div className={`flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide leading-4 ${className}`} title={k === 'F' ? 'Plays both sides, or not enough mix games to tell. A suggestion only.' : `Leans ${label.toLowerCase()} in mixes (or by draft roles). A suggestion only.`}>
      <span style={{ color }}>{label} <span className="text-[#8B98B0] tabular-nums">{ids.length}</span>{note ? <span className="ml-1.5 normal-case tracking-normal text-[#8B98B0]/80">{note}</span> : null}</span>
      <span className="flex gap-1.5 normal-case tracking-normal opacity-70">
        {support.map((x) => <span key={x.r} style={{ color: ROLE_META[x.r].color }}>{ROLE_META[x.r].short} {x.n}</span>)}
      </span>
    </div>
  );
}

export function PlayerName({ alias, roles, src, className = '' }: { alias: string; roles?: PlayerRoles; src: ColorSource; className?: string }) {
  return (
    <span className={className} style={{ color: roleColor(primaryRole(roles, src)) }} title={rolesTitle(alias, roles)}>
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
        Group <Seg value={prefs.sort} options={[['side', 'O / D'], ['role', 'Role'], ['alpha', 'A–Z']]} onChange={(sort) => onChange({ sort })} />
      </span>
      <span className="inline-flex items-center gap-1">
        Skin <Seg value={prefs.skin} options={[['site', 'Site'], ['game', 'In-game']]} onChange={(skin) => onChange({ skin })} />
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
