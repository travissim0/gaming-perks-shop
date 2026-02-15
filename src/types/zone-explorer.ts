export interface ZoneCategory {
  id: string;
  name: string;
  icon: string;
  accent_color: string;
  description: string | null;
  sort_order: number;
}

export interface ZoneNameMapping {
  id: string;
  zone_title: string;
  category_id: string | null;
}

export interface ZoneMedia {
  id: string;
  zone_title: string;
  thumbnail_url: string | null;
  hover_preview_url: string | null;
  vod_link: string | null;
  icon_override: string | null;
}

export interface ZoneNotificationSubscription {
  id: string;
  user_id: string;
  zone_title: string;
  threshold: number;
  is_active: boolean;
  last_notified_at: string | null;
}

export interface ZonePeakHour {
  day_of_week: number;
  hour_of_day: number;
  avg_players: number;
  day_name: string;
}

export interface ZoneExplorerCard {
  zone_key: string;
  zone_title: string;
  category: ZoneCategory | null;
  media: ZoneMedia | null;
  current_players: number;
  peak_hour: ZonePeakHour | null;
  interest_count: number;
  subscriber_count: number;
}

export interface ZoneExplorerData {
  categories: (ZoneCategory & {
    zones: ZoneExplorerCard[];
  })[];
  uncategorized: ZoneExplorerCard[];
}

export type AccentColor = 'blue' | 'orange' | 'green' | 'purple' | 'cyan' | 'red' | 'yellow';

export const colorClasses: Record<AccentColor, {
  border: string;
  hoverBorder: string;
  title: string;
  button: string;
  bg: string;
  gradient: string;
}> = {
  blue: {
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/50',
    title: 'text-blue-400',
    button: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400',
    bg: 'bg-blue-500/10',
    gradient: 'from-blue-500/20 to-blue-600/5',
  },
  orange: {
    border: 'border-orange-500/30',
    hoverBorder: 'hover:border-orange-500/50',
    title: 'text-orange-400',
    button: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400',
    bg: 'bg-orange-500/10',
    gradient: 'from-orange-500/20 to-orange-600/5',
  },
  green: {
    border: 'border-green-500/30',
    hoverBorder: 'hover:border-green-500/50',
    title: 'text-green-400',
    button: 'bg-green-500/20 hover:bg-green-500/30 text-green-400',
    bg: 'bg-green-500/10',
    gradient: 'from-green-500/20 to-green-600/5',
  },
  purple: {
    border: 'border-purple-500/30',
    hoverBorder: 'hover:border-purple-500/50',
    title: 'text-purple-400',
    button: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
    bg: 'bg-purple-500/10',
    gradient: 'from-purple-500/20 to-purple-600/5',
  },
  cyan: {
    border: 'border-cyan-500/30',
    hoverBorder: 'hover:border-cyan-500/50',
    title: 'text-cyan-400',
    button: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400',
    bg: 'bg-cyan-500/10',
    gradient: 'from-cyan-500/20 to-cyan-600/5',
  },
  red: {
    border: 'border-red-500/30',
    hoverBorder: 'hover:border-red-500/50',
    title: 'text-red-400',
    button: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
    bg: 'bg-red-500/10',
    gradient: 'from-red-500/20 to-red-600/5',
  },
  yellow: {
    border: 'border-yellow-500/30',
    hoverBorder: 'hover:border-yellow-500/50',
    title: 'text-yellow-400',
    button: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400',
    bg: 'bg-yellow-500/10',
    gradient: 'from-yellow-500/20 to-yellow-600/5',
  },
};
