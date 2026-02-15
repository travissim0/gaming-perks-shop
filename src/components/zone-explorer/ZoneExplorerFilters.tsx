'use client';

import React from 'react';
import type { ZoneCategory, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';

const ACCENT_GRADIENTS: Record<string, string> = {
  red: 'from-red-400 to-orange-400',
  orange: 'from-orange-400 to-amber-400',
  green: 'from-green-400 to-teal-400',
  purple: 'from-purple-400 to-pink-400',
  cyan: 'from-cyan-400 to-blue-400',
  blue: 'from-blue-400 to-cyan-400',
  yellow: 'from-yellow-400 to-orange-400',
};

interface ZoneExplorerFiltersProps {
  categories: ZoneCategory[];
  activeCategory: string | null;
  searchQuery: string;
  sortBy: 'popular' | 'az' | 'active';
  onCategoryChange: (categoryId: string | null) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: 'popular' | 'az' | 'active') => void;
}

export default function ZoneExplorerFilters({
  categories,
  activeCategory,
  searchQuery,
  sortBy,
  onCategoryChange,
  onSearchChange,
  onSortChange,
}: ZoneExplorerFiltersProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-cyan-500/15 bg-gradient-to-br from-gray-800/40 via-gray-900/50 to-gray-800/30 backdrop-blur-sm p-4 space-y-4">
      {/* Subtle top accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            activeCategory === null
              ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/25 text-cyan-300 border border-cyan-400/40 shadow-sm shadow-cyan-500/10'
              : 'bg-gray-800/40 text-gray-400 border border-gray-700/40 hover:border-gray-500/40 hover:text-gray-300 hover:bg-gray-700/30'
          }`}
        >
          All Zones
        </button>
        {categories.map((cat) => {
          const accent = (cat.accent_color || 'cyan') as AccentColor;
          const colors = colorClasses[accent] || colorClasses.cyan;
          const gradient = ACCENT_GRADIENTS[accent] || ACCENT_GRADIENTS.cyan;
          const isActive = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                isActive
                  ? `bg-gradient-to-r ${gradient.replace('from-', 'from-').replace('to-', 'to-')}/20 ${colors.title} border ${colors.border} shadow-sm`
                  : 'bg-gray-800/40 text-gray-400 border border-gray-700/40 hover:border-gray-500/40 hover:text-gray-300 hover:bg-gray-700/30'
              }`}
            >
              <span className="text-sm">{cat.icon}</span>
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Search + Sort row */}
      <div className="flex gap-3">
        {/* Search input */}
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search zones..."
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg
              bg-gray-900/60 border border-gray-700/50
              text-gray-200 placeholder-gray-500
              focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20
              focus:shadow-sm focus:shadow-cyan-500/10
              transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as 'popular' | 'az' | 'active')}
          className="px-3.5 py-2.5 text-sm rounded-lg
            bg-gray-900/60 border border-gray-700/50
            text-gray-300 cursor-pointer
            focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20
            transition-all appearance-none"
          style={{ minWidth: '150px' }}
        >
          <option value="active">Most Active</option>
          <option value="popular">Most Popular</option>
          <option value="az">A → Z</option>
        </select>
      </div>
    </div>
  );
}
