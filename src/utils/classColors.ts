export const CLASS_COLORS: Record<string, string> = {
  // Standard CTF class names
  'Infantry': '#ef4444', // red
  'Heavy Weapons': '#0891b2', // darker shade of light blue
  'Squad Leader': '#22c55e', // green
  'Combat Engineer': '#a3621b', // brown
  'Field Medic': '#ca8a04', // dark yellow
  'Infiltrator': '#d946ef', // pinkish purple
  'Jump Trooper': '#818cf8', // indigo - was grey, which now means 'not in the game'
  // Game mode class names (used in recordings/game data)
  'Engineer': '#f59e0b', // amber
  'Medic': '#10b981', // green
  'Rifleman': '#ef4444', // red
  'Grenadier': '#f97316', // orange
  'Rocket': '#3b82f6', // blue
  'Mortar': '#8b5cf6', // purple
  'Sniper': '#06b6d4', // cyan
  'Pilot': '#84cc16', // lime
};

export const getClassColor = (className: string): string => {
  return CLASS_COLORS[className] || '#9ca3af'; // default gray
};

export const getClassColorStyle = (className: string): React.CSSProperties => {
  return {
    color: getClassColor(className)
  };
};

/**
 * Teams that are not actually playing: Not Playing and the spectator side.
 *
 * Matched on word boundaries rather than a bare substring test - `includes('np')`
 * would also catch a team called "Snipers".
 */
const NON_PLAYING_TEAM = /(^|[^a-z])(np|not\s*playing|spec|spectator)([^a-z]|$)/i;

export const isNonPlayingTeam = (team?: string | null): boolean => {
  if (!team) return false;
  return NON_PLAYING_TEAM.test(team.trim());
};

/** Grey, reserved for players who are not in the game. */
export const NON_PLAYING_COLOR = '#6b7280';

/**
 * Colour for a player in a live list. Class colours mean "in the game"; anyone on NP
 * or spec is grey regardless of the vehicle they happen to be sitting in, since a
 * spectator vehicle still reports a class name.
 */
export const getPlayerColor = (className: string, team?: string | null): string =>
  isNonPlayingTeam(team) ? NON_PLAYING_COLOR : getClassColor(className);

export const getPlayerColorStyle = (
  className: string,
  team?: string | null,
): React.CSSProperties => ({ color: getPlayerColor(className, team) }); 