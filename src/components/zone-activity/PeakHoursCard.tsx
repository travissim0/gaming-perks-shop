'use client';

import React from 'react';

interface PeakHour {
  day_of_week: number;
  hour_of_day: number;
  avg_players: number;
  max_players: number;
  sample_count: number;
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  return hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`;
}

function PeakHoursSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <div className="animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-40 mb-4"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-6 w-6 bg-gray-700 rounded-full"></div>
            <div className="h-4 bg-gray-700 rounded w-32"></div>
            <div className="h-4 bg-gray-700 rounded w-16 ml-auto"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PeakHoursCard({
  data,
  loading,
}: {
  data: PeakHour[] | null;
  loading: boolean;
}) {
  if (loading) return <PeakHoursSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
        <span className="text-2xl">🏆</span>
        Best Times to Play
        <span className="text-xs text-gray-500 font-normal ml-2">(ET)</span>
      </h3>

      <div className="space-y-1">
        {data.map((peak, index) => (
          <div
            key={`${peak.day_of_week}-${peak.hour_of_day}`}
            className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2.5"
          >
            <span
              className={`text-lg font-bold w-7 text-center ${
                index === 0
                  ? 'text-yellow-400'
                  : index === 1
                  ? 'text-gray-300'
                  : index === 2
                  ? 'text-orange-400'
                  : 'text-gray-500'
              }`}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-gray-300 text-sm font-medium">
                {dayNames[peak.day_of_week]}
              </p>
              <p className="text-gray-500 text-xs">
                {formatHour(peak.hour_of_day)} ET
              </p>
            </div>
            <div className="text-right">
              <p className="text-cyan-400 font-bold text-lg">{peak.avg_players}</p>
              <p className="text-gray-500 text-xs">avg players</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
