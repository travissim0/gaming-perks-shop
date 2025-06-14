export const CLASS_COLORS = {
  'Infantry': '#ef4444', // red
  'Heavy Weapons': '#0891b2', // darker shade of light blue
  'Squad Leader': '#22c55e', // green
  'Combat Engineer': '#a3621b', // brown
  'Field Medic': '#ca8a04', // dark yellow (between regular and dark yellow)
  'Infiltrator': '#d946ef', // pinkish purple
  'Jump Trooper': '#6b7280' // light grey (but not too light)
} as const;

export const getClassColor = (className: string): string => {
  return CLASS_COLORS[className as keyof typeof CLASS_COLORS] || '#9ca3af'; // default gray
};

export const getClassColorStyle = (className: string): React.CSSProperties => {
  return {
    color: getClassColor(className)
  };
}; 