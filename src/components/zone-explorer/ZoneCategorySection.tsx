'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZoneCategory, ZoneExplorerCard as ZoneExplorerCardType, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';
import ZoneExplorerCard from './ZoneExplorerCard';

const ACCENT_GRADIENTS: Record<string, string> = {
  red: 'from-red-400 via-red-500 to-orange-400',
  orange: 'from-orange-400 via-orange-500 to-amber-400',
  green: 'from-green-400 via-emerald-500 to-teal-400',
  purple: 'from-purple-400 via-purple-500 to-pink-400',
  cyan: 'from-cyan-400 via-blue-500 to-cyan-400',
  blue: 'from-blue-400 via-blue-500 to-cyan-400',
  yellow: 'from-yellow-400 via-amber-500 to-orange-400',
};

interface ZoneCategorySectionProps {
  category: ZoneCategory & { zones: ZoneExplorerCardType[] };
  defaultExpanded?: boolean;
  isLoggedIn: boolean;
  subscriptions: Map<string, number>;
  onSubscribe: (zoneTitle: string, threshold: number) => Promise<void>;
  onUnsubscribe: (zoneTitle: string) => Promise<void>;
}

export default function ZoneCategorySection({
  category,
  defaultExpanded = true,
  isLoggedIn,
  subscriptions,
  onSubscribe,
  onUnsubscribe,
}: ZoneCategorySectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accentColor = (category.accent_color || 'cyan') as AccentColor;
  const colors = colorClasses[accentColor] || colorClasses.cyan;
  const gradient = ACCENT_GRADIENTS[accentColor] || ACCENT_GRADIENTS.cyan;
  const totalPlayers = category.zones.reduce((sum, z) => sum + z.current_players, 0);

  return (
    <div className="mb-8">
      {/* Category header panel */}
      <div className={`relative overflow-hidden rounded-xl border ${colors.border} bg-gradient-to-br from-gray-800/40 via-gray-900/50 to-gray-800/30 backdrop-blur-sm mb-4`}>
        {/* Top accent bar */}
        <div className={`h-1 bg-gradient-to-r ${gradient}`} />

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 group"
        >
          <div className="flex items-center gap-3">
            {/* Vertical accent bar */}
            <div className={`w-1 h-8 bg-gradient-to-b ${gradient} rounded-full`} />

            <span
              className="text-2xl"
              style={{ filter: 'drop-shadow(0 0 8px currentColor)' }}
            >
              {category.icon}
            </span>
            <h2 className={`text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r ${gradient} uppercase tracking-wider`}>
              {category.name}
            </h2>
            <span className="text-[11px] font-mono text-gray-500 bg-gray-800/60 px-2.5 py-0.5 rounded-full border border-gray-700/40">
              {category.zones.length} zone{category.zones.length !== 1 ? 's' : ''}
            </span>
            {totalPlayers > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-green-400/90 bg-green-500/10 px-2.5 py-0.5 rounded-full border border-green-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
                {totalPlayers} online
              </span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Category description */}
        {category.description && expanded && (
          <div className={`px-4 pb-3 border-t border-gray-700/30`}>
            <p className="text-xs text-gray-500 pt-2 pl-12">
              {category.description}
            </p>
          </div>
        )}
      </div>

      {/* Zones grid */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {category.zones.map((zone, i) => (
                <motion.div
                  key={zone.zone_key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
                >
                  <ZoneExplorerCard
                    zone={zone}
                    accentColor={accentColor}
                    categoryIcon={category.icon}
                    isLoggedIn={isLoggedIn}
                    isSubscribed={subscriptions.has(zone.zone_title)}
                    subscriptionThreshold={subscriptions.get(zone.zone_title)}
                    onSubscribe={onSubscribe}
                    onUnsubscribe={onUnsubscribe}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
