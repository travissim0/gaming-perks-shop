export const CLASS_COLORS: Record<string, string> = {
  // Standard CTF class names
  'Infantry': '#ef4444', // red
  'Heavy Weapons': '#0891b2', // darker shade of light blue
  'Squad Leader': '#22c55e', // green
  'Combat Engineer': '#a3621b', // brown
  'Field Medic': '#ca8a04', // dark yellow
  'Infiltrator': '#d946ef', // pinkish purple
  'Jump Trooper': '#6b7280', // light grey
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