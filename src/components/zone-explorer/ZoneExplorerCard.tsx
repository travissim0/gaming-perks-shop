'use client';

import React from 'react';
import type { ZoneExplorerCard as ZoneExplorerCardType, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';
import ZoneMediaPreview from './ZoneMediaPreview';
import ZonePeakTimeBadge from './ZonePeakTimeBadge';
import ZoneInterestGauge from './ZoneInterestGauge';
import ZoneNotifyButton from './ZoneNotifyButton';

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

  return (
    <div
      className={`bg-gray-800/50 rounded-xl border ${colors.border} ${colors.hoverBorder}
        transition-all duration-300 overflow-hidden group`}
    >
      {/* Media preview */}
      <ZoneMediaPreview
        media={zone.media}
        zoneName={zone.zone_title}
        zoneIcon={categoryIcon}
        accentColor={accentColor}
      />

      {/* Card body */}
      <div className="p-3 space-y-2">
        {/* Title row + live count + notify */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className={`font-semibold text-sm ${colors.title} truncate`}>
              {zone.zone_title}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Live player count badge */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                zone.current_players > 0
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'
              }`}
            >
              {zone.current_players > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
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
      </div>
    </div>
  );
}
