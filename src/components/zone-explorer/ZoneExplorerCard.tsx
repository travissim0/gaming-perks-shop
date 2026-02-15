'use client';

import React from 'react';
import type { ZoneExplorerCard as ZoneExplorerCardType, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';
import ZoneMediaPreview from './ZoneMediaPreview';
import ZonePeakTimeBadge from './ZonePeakTimeBadge';
import ZoneInterestGauge from './ZoneInterestGauge';
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

const GLOW_SHADOWS: Record<AccentColor, string> = {
  red: '0 0 15px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(239, 68, 68, 0.05)',
  orange: '0 0 15px rgba(249, 115, 22, 0.08), inset 0 1px 0 rgba(249, 115, 22, 0.05)',
  green: '0 0 15px rgba(34, 197, 94, 0.08), inset 0 1px 0 rgba(34, 197, 94, 0.05)',
  purple: '0 0 15px rgba(168, 85, 247, 0.08), inset 0 1px 0 rgba(168, 85, 247, 0.05)',
  cyan: '0 0 15px rgba(6, 182, 212, 0.08), inset 0 1px 0 rgba(6, 182, 212, 0.05)',
  blue: '0 0 15px rgba(59, 130, 246, 0.08), inset 0 1px 0 rgba(59, 130, 246, 0.05)',
  yellow: '0 0 15px rgba(234, 179, 8, 0.08), inset 0 1px 0 rgba(234, 179, 8, 0.05)',
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
  const glow = GLOW_SHADOWS[accentColor] || GLOW_SHADOWS.cyan;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${colors.border} ${colors.hoverBorder}
        bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50
        backdrop-blur-sm transition-all duration-300 group
        hover:shadow-lg`}
      style={{ boxShadow: glow }}
    >
      {/* Top accent gradient bar */}
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />

      {/* Media preview */}
      <ZoneMediaPreview
        media={zone.media}
        zoneName={zone.zone_title}
        zoneIcon={categoryIcon}
        accentColor={accentColor}
      />

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Title row + live count + notify */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className={`font-bold text-sm ${colors.title} truncate`}
              style={{ textShadow: '0 0 20px currentColor' }}
            >
              {zone.zone_title}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Live player count badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                zone.current_players > 0
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30 shadow-sm shadow-green-500/10'
                  : 'bg-gray-800/60 text-gray-500 border border-gray-700/40'
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
        </div>

        {/* Peak time badge */}
        <ZonePeakTimeBadge peakHour={zone.peak_hour} />

        {/* Interest gauge */}
        <ZoneInterestGauge
          interestCount={zone.interest_count}
          accentColor={accentColor}
        />

        {/* Bottom accent line */}
        <div className={`h-px bg-gradient-to-r from-transparent ${gradient.replace('from-', 'via-').split(' ')[0]}via-current/20 to-transparent opacity-30`} />
      </div>
    </div>
  );
}
