'use client';

import React from 'react';

function CardSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/30 overflow-hidden animate-pulse">
      {/* Media placeholder */}
      <div className="aspect-video bg-gray-700/30" />
      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-700/50 rounded w-32" />
          <div className="h-5 bg-gray-700/50 rounded-full w-10" />
        </div>
        <div className="h-3 bg-gray-700/30 rounded w-40" />
        <div className="h-1 bg-gray-700/30 rounded-full w-full" />
      </div>
    </div>
  );
}

export default function ZoneExplorerSkeleton() {
  return (
    <div className="space-y-8">
      {/* Filter bar skeleton */}
      <div className="space-y-3 animate-pulse">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-800/50 rounded-lg w-20" />
          ))}
        </div>
        <div className="flex gap-3">
          <div className="flex-1 h-9 bg-gray-800/50 rounded-lg" />
          <div className="h-9 bg-gray-800/50 rounded-lg w-36" />
        </div>
      </div>

      {/* Category sections skeleton */}
      {[1, 2, 3].map((section) => (
        <div key={section}>
          <div className="flex items-center gap-3 mb-4 animate-pulse">
            <div className="w-8 h-8 bg-gray-700/30 rounded" />
            <div className="h-5 bg-gray-700/50 rounded w-28" />
            <div className="h-4 bg-gray-700/30 rounded-full w-16" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: section === 1 ? 2 : section === 2 ? 1 : 2 }).map(
              (_, i) => (
                <CardSkeleton key={i} />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
