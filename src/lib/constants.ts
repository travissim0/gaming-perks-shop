// System user ID used for anonymous/official operations (historical squad imports, anonymous ratings, etc.)
export const SYSTEM_USER_ID = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';

// SVG placeholder for video thumbnails when YouTube thumbnail fails to load
export const VIDEO_THUMBNAIL_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
    <rect width="480" height="360" fill="#1f2937"/>
    <g transform="translate(240,180)">
      <circle r="40" fill="none" stroke="#4b5563" stroke-width="3"/>
      <polygon points="-12,-20 -12,20 20,0" fill="#4b5563"/>
    </g>
    <text x="240" y="240" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="14">Video Thumbnail Unavailable</text>
  </svg>`
)}`;

// ─── Free Agent / Class Constants ────────────────────────────────────────────

export const SKILL_LEVEL_COLORS: Record<string, string> = {
  beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  intermediate: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  advanced: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  expert: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const ROLE_COLORS: Record<string, string> = {
  'Offense': 'bg-red-500/20 text-red-300 border-red-500/30',
  'Defense': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Support': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Captain': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Flex': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
};

export const CLASS_COLORS: Record<string, string> = {
  'O INF': 'bg-red-500/20 text-red-500 border-red-500/30',
  'D INF': 'bg-red-500/20 text-red-400 border-red-500/30',
  'O HVY': 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  'D HVY': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Medic': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'SL': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Foot JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'D Foot JT': 'bg-gray-400/20 text-gray-400 border-gray-400/30',
  'Pack JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'Engineer': 'bg-amber-700/20 text-amber-800 border-amber-700/30',
  'Infil': 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
  '10-man Infil': 'bg-fuchsia-600/20 text-fuchsia-500 border-fuchsia-600/30',
};

export const CLASS_OPTIONS = [
  'O INF', 'D INF', 'O HVY', 'D HVY', 'Medic', 'SL',
  'Foot JT', 'D Foot JT', 'Pack JT', 'Engineer', 'Infil', '10-man Infil',
];

export const TIMEZONE_OPTIONS = [
  { value: 'America/Los_Angeles', label: 'PST - Pacific' },
  { value: 'America/Denver', label: 'MST - Mountain' },
  { value: 'America/Phoenix', label: 'MST - Arizona' },
  { value: 'America/Chicago', label: 'CST - Central' },
  { value: 'America/New_York', label: 'EST - Eastern' },
  { value: 'Europe/London', label: 'GMT - London' },
  { value: 'Europe/Paris', label: 'CET - Central Europe' },
  { value: 'Europe/Berlin', label: 'CET - Berlin' },
  { value: 'Asia/Tokyo', label: 'JST - Tokyo' },
  { value: 'Australia/Sydney', label: 'AEST - Sydney' },
  { value: 'America/Toronto', label: 'EST - Toronto' },
  { value: 'America/Vancouver', label: 'PST - Vancouver' },
];

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Convert IANA timezone to common abbreviation */
export const TIMEZONE_ABBR_MAP: Record<string, string> = {
  'America/Los_Angeles': 'PST',
  'America/Denver': 'MST',
  'America/Phoenix': 'MST',
  'America/Chicago': 'CST',
  'America/New_York': 'EST',
  'America/Toronto': 'EST',
  'America/Vancouver': 'PST',
  'Europe/London': 'GMT',
  'Europe/Paris': 'CET',
  'Europe/Berlin': 'CET',
  'Asia/Tokyo': 'JST',
  'Australia/Sydney': 'AEST',
};

export const toTimezoneAbbr = (tz?: string): string => {
  if (!tz) return 'EST';
  if (TIMEZONE_ABBR_MAP[tz]) return TIMEZONE_ABBR_MAP[tz];
  if (/^[A-Z]{2,5}$/.test(tz)) return tz;
  return tz.includes('/') ? (tz.split('/').pop() || tz) : tz;
};

/** Role groups for the free-agent join form class selector */
export const ROLE_GROUPS = [
  {
    name: 'Infantry',
    roles: [
      { key: 'O INF', label: 'Offense', tag: 'Offense' },
      { key: 'D INF', label: 'Defense', tag: 'Defense' },
    ],
  },
  {
    name: 'Heavy Weapons',
    roles: [
      { key: 'O HVY', label: 'Offense', tag: 'Offense' },
      { key: 'D HVY', label: 'Defense', tag: 'Defense' },
    ],
  },
  {
    name: 'Jump Trooper',
    roles: [
      { key: 'Foot JT', label: 'Offense', tag: 'Fighter' },
      { key: 'D Foot JT', label: 'Defense', tag: 'Fighter' },
    ],
  },
  {
    name: 'Jump Trooper Pack',
    roles: [{ key: 'Pack JT', label: 'Pack', tag: 'Offense' }],
  },
  {
    name: 'Field Medic',
    roles: [{ key: 'Medic', label: 'Medic', tag: 'Support' }],
  },
  {
    name: 'Combat Engineer',
    roles: [{ key: 'Engineer', label: 'Engineer', tag: 'Support' }],
  },
  {
    name: 'Squad Leader',
    roles: [{ key: 'SL', label: 'Leader', tag: 'Support' }],
  },
  {
    name: 'Infiltrator',
    roles: [
      { key: 'Infil', label: '5-man', tag: 'Offense' },
      { key: '10-man Infil', label: '10-man', tag: 'Fighter' },
    ],
  },
];
