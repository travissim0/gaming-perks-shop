/**
 * CTF role taxonomy shared by the match page's rosters and lineups (client + server safe).
 *
 * Two sources describe what someone plays:
 *   - draft:  their league registration (free_agents): mains, secondaries and ★ ratings,
 *             in the draft vocabulary ('O INF', 'Medic', '10-man Infil', ...)
 *   - mix:    what they actually played in CTF mixes (player_stats, game_mode 'Mix'):
 *             in-game class names plus offense/defense
 * Both fold into one set of class keys so a roster can colour and count them the same way.
 */

export type RoleKey = 'SL' | 'MED' | 'ENG' | '10M' | 'IFL' | 'HVY' | 'INF' | 'JT';
export type SideLetter = 'O' | 'D';

/** Support roles first: that is what a captain scans for. Also the role sort order. */
export const ROLE_ORDER: RoleKey[] = ['SL', 'MED', 'ENG', '10M', 'IFL', 'HVY', 'INF', 'JT'];
/** The roles worth counting at a glance. */
export const COVERAGE_ROLES: RoleKey[] = ['SL', 'MED', 'ENG', '10M', 'IFL'];

/** In-game class colours (src/utils/classColors.ts), lifted a touch where they were too dark to read on navy. */
export const ROLE_META: Record<RoleKey, { label: string; short: string; color: string }> = {
  SL: { label: 'Squad Leader', short: 'SL', color: '#22c55e' },
  MED: { label: 'Medic', short: 'MED', color: '#eab308' },
  ENG: { label: 'Engineer', short: 'ENG', color: '#c4823a' },
  '10M': { label: '10-man Infil', short: '10M', color: '#f0abfc' },
  IFL: { label: 'Infiltrator', short: 'INFIL', color: '#d946ef' },
  HVY: { label: 'Heavy Weapons', short: 'HVY', color: '#22a6c8' },
  INF: { label: 'Infantry', short: 'INF', color: '#ef4444' },
  JT: { label: 'Jump Trooper', short: 'JT', color: '#cbd5e1' },
};

/** Draft vocabulary (CLASS_OPTIONS in src/lib/constants.ts) → class + side. */
const DRAFT_ROLE: Record<string, { key: RoleKey; side: SideLetter | null }> = {
  'O INF': { key: 'INF', side: 'O' },
  'D INF': { key: 'INF', side: 'D' },
  'O HVY': { key: 'HVY', side: 'O' },
  'D HVY': { key: 'HVY', side: 'D' },
  Medic: { key: 'MED', side: null },
  SL: { key: 'SL', side: null },
  'Foot JT': { key: 'JT', side: 'O' },
  'D Foot JT': { key: 'JT', side: 'D' },
  'Pack JT': { key: 'JT', side: 'O' },
  Engineer: { key: 'ENG', side: null },
  Infil: { key: 'IFL', side: null },
  '10-man Infil': { key: '10M', side: null },
};

/** In-game class names as player_stats records them → class key. */
const STAT_CLASS: Record<string, RoleKey> = {
  Infantry: 'INF',
  'Heavy Weapons': 'HVY',
  'Squad Leader': 'SL',
  'Combat Engineer': 'ENG',
  'Field Medic': 'MED',
  Infiltrator: 'IFL',
  'Jump Trooper': 'JT',
};

export const draftRole = (r: string) => DRAFT_ROLE[r] || null;
export const statClass = (c: string | null | undefined) => (c ? STAT_CLASS[c] || null : null);

/** What the server sends per player. */
export interface PlayerRoles {
  /** Draft mains, best first (★ rating, then the order they were picked in). */
  mains: string[];
  secondaries: string[];
  ratings: Record<string, number>;
  /** Season the draft entry is from, when it isn't the match's own season. */
  draft_season: number | null;
  mix: {
    games: number;
    /** Games per class key, with the offense/defense split. */
    classes: { key: RoleKey; n: number; o: number; d: number }[];
    offense: number;
    defense: number;
  } | null;
}

export type ColorSource = 'draft' | 'mix';

export interface RoleTag {
  key: RoleKey;
  /** Sides played; empty or both = either. */
  sides: SideLetter[];
  tier: 'main' | 'sec';
  /** Mix share of games (0..1), mix tags only. */
  share?: number;
}

/** A mix class counts as played when it is at least this share of their mix games. */
const MIX_MAIN = 0.25;
const MIX_SEC = 0.08;

function sidesOf(o: number, d: number): SideLetter[] {
  const t = o + d;
  if (t === 0) return [];
  if (o / t >= 0.7) return ['O'];
  if (d / t >= 0.7) return ['D'];
  return ['O', 'D'];
}

export function draftTags(p: PlayerRoles | null | undefined): RoleTag[] {
  if (!p) return [];
  const out: RoleTag[] = [];
  const add = (r: string, tier: 'main' | 'sec') => {
    const m = draftRole(r);
    if (!m) return;
    const have = out.find((t) => t.key === m.key);
    if (have) {
      // Same class again: widen its sides. A secondary of a class they already main adds nothing.
      if (have.tier === tier && m.side && !have.sides.includes(m.side)) have.sides.push(m.side);
      return;
    }
    out.push({ key: m.key, sides: m.side ? [m.side] : [], tier });
  };
  p.mains.forEach((r) => add(r, 'main'));
  p.secondaries.forEach((r) => add(r, 'sec'));
  return out;
}

export function mixTags(p: PlayerRoles | null | undefined): RoleTag[] {
  if (!p?.mix || p.mix.games === 0) return [];
  const g = p.mix.games;
  return p.mix.classes
    .filter((c, i) => i === 0 || c.n / g >= MIX_SEC)
    .map((c, i) => ({ key: c.key, sides: sidesOf(c.o, c.d), tier: (i === 0 || c.n / g >= MIX_MAIN ? 'main' : 'sec') as 'main' | 'sec', share: c.n / g }));
}

export const tagsFor = (p: PlayerRoles | null | undefined, src: ColorSource) => (src === 'mix' ? mixTags(p) : draftTags(p));

/** The class a name is coloured by: the chosen source's top class, else the other source's. */
export function primaryRole(p: PlayerRoles | null | undefined, src: ColorSource): RoleKey | null {
  const a = tagsFor(p, src)[0] || tagsFor(p, src === 'mix' ? 'draft' : 'mix')[0];
  return a ? a.key : null;
}

export const roleColor = (k: RoleKey | null) => (k ? ROLE_META[k].color : '#E6EDF7');

/** Offense/defense lean from mixes; falls back to the sides of their draft mains. */
export function sideLean(p: PlayerRoles | null | undefined): { side: SideLetter | 'OD'; pct: number | null } | null {
  if (!p) return null;
  const o = p.mix?.offense || 0;
  const d = p.mix?.defense || 0;
  if (o + d >= 5) {
    const po = o / (o + d);
    if (po >= 0.6) return { side: 'O', pct: Math.round(po * 100) };
    if (po <= 0.4) return { side: 'D', pct: Math.round((1 - po) * 100) };
    return { side: 'OD', pct: null };
  }
  const sides = new Set(p.mains.map((r) => draftRole(r)?.side).filter(Boolean));
  if (sides.size === 1) return { side: [...sides][0] as SideLetter, pct: null };
  if (sides.size === 2) return { side: 'OD', pct: null };
  return null;
}

/**
 * Does the player cover this role? 'main', 'sec' or null, from the chosen source.
 * 10-man infil always comes from the draft: the stats can't tell a 10-man infil from any other.
 */
export function covers(p: PlayerRoles | null | undefined, key: RoleKey, src: ColorSource): 'main' | 'sec' | null {
  const t = tagsFor(p, key === '10M' ? 'draft' : src).find((x) => x.key === key);
  return t ? t.tier : null;
}

/** Sort rank for "by role": support players first, by their primary class. */
export const roleRank = (p: PlayerRoles | null | undefined, src: ColorSource) => {
  const k = primaryRole(p, src);
  return k ? ROLE_ORDER.indexOf(k) : ROLE_ORDER.length;
};

/** One-line hover text with everything known about the player. */
export function rolesTitle(alias: string, p: PlayerRoles | null | undefined): string {
  if (!p) return alias;
  const parts = [alias];
  if (p.mains.length) {
    parts.push(`Draft mains: ${p.mains.map((r) => (p.ratings[r] ? `${r} ★${p.ratings[r]}` : r)).join(', ')}${p.draft_season ? ` (S${p.draft_season})` : ''}`);
  }
  if (p.secondaries.length) parts.push(`Secondary: ${p.secondaries.join(', ')}`);
  if (p.mix && p.mix.games) {
    const cls = p.mix.classes.slice(0, 4).map((c) => `${ROLE_META[c.key].label} ${Math.round((c.n / p.mix!.games) * 100)}%`).join(', ');
    const sided = p.mix.offense + p.mix.defense;
    const od = sided ? ` · O ${Math.round((p.mix.offense / sided) * 100)}% / D ${Math.round((p.mix.defense / sided) * 100)}%` : '';
    parts.push(`Mixes (${p.mix.games}): ${cls}${od}`);
  }
  if (parts.length === 1) parts.push('No draft entry or mix games');
  return parts.join('\n');
}
