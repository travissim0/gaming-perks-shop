'use client';

import React from 'react';
import type { ZoneExplorerCard as ZoneExplorerCardType, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';
import ZonePeakTimeBadge from './ZonePeakTimeBadge';
import ZoneNotifyButton from './ZoneNotifyButton';

const ACCENT_GRADIENTS: Record<AccentColor, string> = {
  red: 'from-red-400 via-red-500 to-orange-400',
  orange: 'from-orange-400 via-orange-500 to-amber-400',
  green: 'from-green-400 via-emerald-500 to-teal-400',
  purple: 'from-purple-400 via-purple-500 to-pink-400',
  cyan: 'from-cyan-400 via-blue-500 to-cyan-400',
  blue: 'from-blue-400 via-blue-500 to-cyan-400',
  yellow: 'from-yellow-400 via-amber-500 to-orange-400',
};

interface ZoneExplorerCardProps {
  zone: ZoneExplorerCardType;
  accentColor: AccentColor;
  categoryIcon?: string;
  isLoggedIn: boolean;
  isSubscribed: boolean;
  subscriptionThreshold?: number;
  onSubscribe: (zoneTitle: string, threshold: number) => Promise<void>;
  onUnsubscribe: (zoneTitle: string) => Promise<void>;
}

export default function ZoneExplorerCard({
  zone,
  accentColor,
  categoryIcon,
  isLoggedIn,
  isSubscribed,
  subscriptionThreshold,
  onSubscribe,
  onUnsubscribe,
}: ZoneExplorerCardProps) {
  const colors = colorClasses[accentColor] || colorClasses.cyan;
  const gradient = ACCENT_GRADIENTS[accentColor] || ACCENT_GRADIENTS.cyan;
  const icon = zone.media?.icon_override || categoryIcon || '🎮';

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${colors.border} ${colors.hoverBorder}
        bg-gradient-to-br from-gray-800/60 via-gray-900/70 to-gray-800/40
        backdrop-blur-sm transition-all duration-200 group hover:shadow-md`}
    >
      {/* Top accent line */}
      <div className={`h-0.5 bg-gradient-to-r ${gradient}`} />

      <div className="px-3 py-2.5 space-y-1.5">
        {/* Title row: icon + name + player count + notify */}
        <div className="flex items-center gap-2">
          <span className="text-base shrink-0">{icon}</span>
          <h3 className={`font-semibold text-sm ${colors.title} truncate flex-1`}>
            {zone.zone_title}
          </h3>
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
              zone.current_players > 0
                ? 'bg-green-500/15 text-green-400 border border-green-500/25'
                : 'bg-gray-800/60 text-gray-500 border border-gray-700/30'
            }`}
          >
            {zone.current_players > 0 && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
            )}
            {zone.current_players}
          </div>
          <ZoneNotifyButton
            zoneTitle={zone.zone_title}
            accentColor={accentColor}
            isSubscribed={isSubscribed}
            currentThreshold={subscriptionThreshold}
            isLoggedIn={isLoggedIn}
            onSubscribe={onSubscribe}
            onUnsubscribe={onUnsubscribe}
          />
        </div>

        {/* Info row: peak time + interest */}
        <div className="flex items-center justify-between gap-2">
          <ZonePeakTimeBadge peakHour={zone.peak_hour} />
          {zone.interest_count > 0 && (
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
              {zone.interest_count} interested
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
