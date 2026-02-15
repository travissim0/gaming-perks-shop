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
  const hasThumbnail = !!zone.media?.thumbnail_url;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${colors.border} ${colors.hoverBorder}
        bg-gradient-to-br from-gray-800/60 via-gray-900/70 to-gray-800/40
        backdrop-blur-sm transition-all duration-200 group hover:shadow-lg flex flex-col`}
    >
      {/* Top accent line */}
      <div className={`h-0.5 bg-gradient-to-r ${gradient}`} />

      {/* Thumbnail / icon area — square aspect */}
      <div className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${colors.gradient}`}>
        {hasThumbnail ? (
          <img
            src={zone.media!.thumbnail_url!}
            alt={zone.zone_title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-50 select-none drop-shadow-lg">{icon}</span>
          </div>
        )}

        {/* Player count overlay — top right */}
        <div
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-sm ${
            zone.current_players > 0
              ? 'bg-green-900/70 text-green-400 border border-green-500/30'
              : 'bg-gray-900/70 text-gray-400 border border-gray-700/40'
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

        {/* Notify button overlay — top left */}
        <div className="absolute top-2 left-2">
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

        {/* VOD link overlay — bottom right */}
        {zone.media?.vod_link && (
          <a
            href={zone.media.vod_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md
              bg-gray-900/80 backdrop-blur-sm border border-gray-600/40
              text-gray-300 hover:text-white transition-all text-[10px] font-medium"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            VOD
          </a>
        )}
      </div>

      {/* Card body */}
      <div className="px-3 py-2 space-y-1 flex-1">
        {/* Zone title */}
        <h3 className={`font-semibold text-sm ${colors.title} truncate leading-tight`}>
          {zone.zone_title}
        </h3>

        {/* Info row: peak time + interest */}
        <div className="flex items-center justify-between gap-1">
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
