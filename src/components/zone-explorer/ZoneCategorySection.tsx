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
    <div className="mb-4">
      {/* Compact category header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border ${colors.border}
          bg-gradient-to-r from-gray-800/40 to-gray-900/40 backdrop-blur-sm
          hover:from-gray-800/60 hover:to-gray-900/50 transition-all group mb-2`}
      >
        <div className={`w-0.5 h-5 bg-gradient-to-b ${gradient} rounded-full shrink-0`} />
        <span className="text-lg shrink-0">{category.icon}</span>
        <h2 className={`text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r ${gradient} uppercase tracking-wider`}>
          {category.name}
        </h2>
        <span className="text-[10px] font-mono text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full border border-gray-700/30">
          {category.zones.length}
        </span>
        {totalPlayers > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-green-400/90 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            {totalPlayers}
          </span>
        )}
        <div className="flex-1" />
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Zones grid */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {category.zones.map((zone, i) => (
                <motion.div
                  key={zone.zone_key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25, ease: 'easeOut' }}
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
