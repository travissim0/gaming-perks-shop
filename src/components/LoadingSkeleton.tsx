import React from 'react';

interface LoadingSkeletonProps {
  className?: string;
  height?: string;
  width?: string;
  rounded?: boolean;
}

export function LoadingSkeleton({ className = '', height = 'h-4', width = 'w-full', rounded = false }: LoadingSkeletonProps) {
  return (
    <div 
      className={`animate-pulse bg-gray-300 dark:bg-gray-700 ${height} ${width} ${rounded ? 'rounded-full' : 'rounded'} ${className}`} 
    />
  );
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm ${className}`}>
      <LoadingSkeleton className="mb-3" height="h-6" width="w-3/4" />
      <LoadingSkeleton className="mb-2" height="h-4" width="w-full" />
      <LoadingSkeleton className="mb-2" height="h-4" width="w-5/6" />
      <LoadingSkeleton height="h-4" width="w-2/3" />
    </div>
  );
}

export function VideoSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
      <LoadingSkeleton height="h-48" className="mb-0 rounded-none" />
      <div className="p-4">
        <LoadingSkeleton className="mb-2" height="h-5" width="w-4/5" />
        <LoadingSkeleton height="h-4" width="w-2/3" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-gray-200 dark:border-gray-700">
      <td className="px-4 py-3">
        <LoadingSkeleton height="h-4" width="w-20" />
      </td>
      <td className="px-4 py-3">
        <LoadingSkeleton height="h-4" width="w-16" />
      </td>
      <td className="px-4 py-3">
        <LoadingSkeleton height="h-4" width="w-12" />
      </td>
      <td className="px-4 py-3">
        <LoadingSkeleton height="h-4" width="w-14" />
      </td>
    </tr>
  );
}

export function UserListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3 p-2">
          <LoadingSkeleton height="h-8" width="w-8" rounded />
          <LoadingSkeleton height="h-4" width="w-24" />
        </div>
      ))}
    </div>
  );
}

export function SquadCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-3 mb-4">
        <LoadingSkeleton height="h-12" width="w-12" rounded />
        <div className="flex-1">
          <LoadingSkeleton className="mb-1" height="h-5" width="w-32" />
          <LoadingSkeleton height="h-3" width="w-20" />
        </div>
      </div>
      <LoadingSkeleton className="mb-3" height="h-4" width="w-full" />
      <LoadingSkeleton height="h-4" width="w-3/4" />
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <LoadingSkeleton height="h-5" width="w-2/3" />
        <LoadingSkeleton height="h-4" width="w-16" />
      </div>
      <div className="flex items-center space-x-4 mb-2">
        <LoadingSkeleton height="h-4" width="w-20" />
        <span className="text-gray-400">vs</span>
        <LoadingSkeleton height="h-4" width="w-20" />
      </div>
      <LoadingSkeleton height="h-3" width="w-24" />
    </div>
  );
} 