'use client';

import React from 'react';

function CardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-700/30 bg-gradient-to-br from-gray-800/40 via-gray-900/50 to-gray-800/30 backdrop-blur-sm animate-pulse">
      {/* Top accent bar */}
      <div className="h-1 bg-gray-700/40" />
      {/* Media placeholder */}
      <div className="aspect-video bg-gray-800/50" />
      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-700/40 rounded w-32" />
          <div className="h-6 bg-gray-700/40 rounded-full w-12" />
        </div>
        <div className="h-3 bg-gray-700/30 rounded w-44" />
        <div className="h-1 bg-gray-700/20 rounded-full w-full" />
      </div>
    </div>
  );
}

function CategorySkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div className="mb-8">
      {/* Category header */}
      <div className="relative overflow-hidden rounded-xl border border-gray-700/20 bg-gradient-to-br from-gray-800/30 via-gray-900/40 to-gray-800/20 backdrop-blur-sm mb-4 animate-pulse">
        <div className="h-1 bg-gray-700/30" />
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-1 h-8 bg-gray-700/40 rounded-full" />
          <div className="w-8 h-8 bg-gray-700/30 rounded" />
          <div className="h-5 bg-gray-700/40 rounded w-28" />
          <div className="h-5 bg-gray-700/30 rounded-full w-16" />
        </div>
      </div>
      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: cardCount }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function ZoneExplorerSkeleton() {
  return (
    <div className="space-y-8">
      {/* Filter bar skeleton */}
      <div className="relative overflow-hidden rounded-xl border border-gray-700/20 bg-gradient-to-br from-gray-800/30 via-gray-900/40 to-gray-800/20 backdrop-blur-sm p-4 space-y-4 animate-pulse">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-8 bg-gray-800/50 rounded-lg" style={{ width: `${60 + i * 8}px` }} />
          ))}
        </div>
        <div className="flex gap-3">
          <div className="flex-1 h-10 bg-gray-800/40 rounded-lg" />
          <div className="h-10 bg-gray-800/40 rounded-lg w-40" />
        </div>
      </div>

      {/* Category sections */}
      <CategorySkeleton cardCount={2} />
      <CategorySkeleton cardCount={1} />
      <CategorySkeleton cardCount={2} />
    </div>
  );
}
