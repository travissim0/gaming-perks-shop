'use client';

import React from 'react';
import type { AccentColor } from '@/types/zone-explorer';

interface ZoneInterestGaugeProps {
  interestCount: number;
  accentColor: AccentColor;
}

const BAR_COLORS: Record<AccentColor, string> = {
  blue: 'bg-blue-400',
  orange: 'bg-orange-400',
  green: 'bg-green-400',
  purple: 'bg-purple-400',
  cyan: 'bg-cyan-400',
  red: 'bg-red-400',
  yellow: 'bg-yellow-400',
};

export default function ZoneInterestGauge({
  interestCount,
  accentColor,
}: ZoneInterestGaugeProps) {
  if (interestCount <= 0) return null;

  // Normalize to 0-100 (cap at 20 interested = full bar)
  const pct = Math.min((interestCount / 20) * 100, 100);
  const barColor = BAR_COLORS[accentColor] || BAR_COLORS.cyan;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-gray-700/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
        {interestCount} interested
      </span>
    </div>
  );
}
