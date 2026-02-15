'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZoneCategory, ZoneExplorerCard as ZoneExplorerCardType, AccentColor } from '@/types/zone-explorer';
import ZoneExplorerCard from './ZoneExplorerCard';

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
  const totalPlayers = category.zones.reduce(
    (sum, z) => sum + z.current_players,
    0
  );

  return (
    <div className="mb-6">
      {/* Category header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 py-3 px-1 group"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{category.icon}</span>
          <h2 className="text-lg font-bold text-gray-100 group-hover:text-white transition-colors">
            {category.name}
          </h2>
          <span className="text-xs text-gray-500 bg-gray-800/70 px-2 py-0.5 rounded-full">
            {category.zones.length} zone{category.zones.length !== 1 ? 's' : ''}
          </span>
          {totalPlayers > 0 && (
            <span className="text-xs text-green-400/80 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
              {totalPlayers} online
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
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
        <p className="text-xs text-gray-500 pl-11 -mt-1 mb-3">
          {category.description}
        </p>
      )}

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {category.zones.map((zone, i) => (
                <motion.div
                  key={zone.zone_key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
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
