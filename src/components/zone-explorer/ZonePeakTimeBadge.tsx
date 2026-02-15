'use client';

import React from 'react';
import type { ZonePeakHour } from '@/types/zone-explorer';

interface ZonePeakTimeBadgeProps {
  peakHour: ZonePeakHour | null;
}

const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHourET(hour: number): string {
  if (hour === 0) return '12AM';
  if (hour === 12) return '12PM';
  return hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
}

export default function ZonePeakTimeBadge({ peakHour }: ZonePeakTimeBadgeProps) {
  if (!peakHour) return null;

  const dayName = peakHour.day_name || DAY_ABBREV[peakHour.day_of_week] || '?';
  const timeStr = formatHourET(peakHour.hour_of_day);
  const avg = Math.round(peakHour.avg_players);

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
      <svg className="w-3 h-3 text-yellow-500/70 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm8-5a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM4.75 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5H4a.75.75 0 01.75.75zm11.546-4.264a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM6.824 14.236a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm8.412 1.061a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM5.764 6.824a.75.75 0 01-1.06 0L3.643 5.763a.75.75 0 011.06-1.06l1.061 1.06a.75.75 0 010 1.061zM13 10a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>
        Best: {dayName} {timeStr} ET
        {avg > 0 && <span className="text-gray-500"> · {avg} avg</span>}
      </span>
    </div>
  );
}
