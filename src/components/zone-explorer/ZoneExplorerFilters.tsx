'use client';

import React from 'react';
import type { ZoneCategory, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';

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
    <div className="space-y-3">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeCategory === null
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-gray-600/50 hover:text-gray-300'
          }`}
        >
          All
        </button>
        {categories.map((cat) => {
          const accent = (cat.accent_color || 'cyan') as AccentColor;
          const colors = colorClasses[accent] || colorClasses.cyan;
          const isActive = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                isActive
                  ? `${colors.button} border ${colors.border}`
                  : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-gray-600/50 hover:text-gray-300'
              }`}
            >
              <span>{cat.icon}</span>
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
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg
              bg-gray-800/50 border border-gray-700/50
              text-gray-200 placeholder-gray-500
              focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20
              transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
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
          className="px-3 py-2 text-sm rounded-lg
            bg-gray-800/50 border border-gray-700/50
            text-gray-300 cursor-pointer
            focus:outline-none focus:border-cyan-500/40
            transition-colors appearance-none"
          style={{ minWidth: '140px' }}
        >
          <option value="popular">Most Popular</option>
          <option value="active">Most Active</option>
          <option value="az">A → Z</option>
        </select>
      </div>
    </div>
  );
}
