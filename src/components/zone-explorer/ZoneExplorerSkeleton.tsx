'use client';

import React from 'react';

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-700/30 bg-gradient-to-br from-gray-800/40 to-gray-900/50 animate-pulse overflow-hidden">
      <div className="h-0.5 bg-gray-700/40" />
      <div className="aspect-[4/3] bg-gray-800/50" />
      <div className="px-3 py-2 space-y-1.5">
        <div className="h-4 bg-gray-700/40 rounded w-3/4" />
        <div className="h-3 bg-gray-700/20 rounded w-1/2" />
      </div>
    </div>
  );
}

function CategorySkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-700/20 bg-gray-800/30 mb-2 animate-pulse">
        <div className="w-0.5 h-5 bg-gray-700/40 rounded-full" />
        <div className="w-5 h-5 bg-gray-700/30 rounded" />
        <div className="h-4 bg-gray-700/40 rounded w-20" />
        <div className="h-4 bg-gray-700/30 rounded-full w-8" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function ZoneExplorerSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter bar skeleton */}
      <div className="flex gap-2 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 bg-gray-800/50 rounded-md" style={{ width: `${50 + i * 6}px` }} />
        ))}
        <div className="flex-1" />
        <div className="h-7 bg-gray-800/40 rounded-md w-32" />
        <div className="h-7 bg-gray-800/40 rounded-md w-24" />
      </div>

      <CategorySkeleton cardCount={4} />
      <CategorySkeleton cardCount={3} />
      <CategorySkeleton cardCount={5} />
    </div>
  );
}
