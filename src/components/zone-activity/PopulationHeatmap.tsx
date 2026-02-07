'use client';

import React, { useMemo } from 'react';

interface HeatmapEntry {
  day_of_week: number;
  hour_of_day: number;
  avg_players: number;
  max_players: number;
  min_players: number;
  sample_count: number;
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabels = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12a';
  if (i === 12) return '12p';
  return i > 12 ? `${i - 12}p` : `${i}a`;
});

function HeatmapSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <div className="animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-48 mb-4"></div>
        <div className="h-48 bg-gray-700/30 rounded"></div>
      </div>
    </div>
  );
}

export default function PopulationHeatmap({
  data,
  loading,
}: {
  data: HeatmapEntry[] | null;
  loading: boolean;
}) {
  if (loading) return <HeatmapSkeleton />;
  if (!data || data.length === 0) return null;

  const { grid, maxAvg } = useMemo(() => {
    // Build a 7x24 grid
    const g: (HeatmapEntry | null)[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(null)
    );
    let max = 0;
    data.forEach((entry) => {
      g[entry.day_of_week][entry.hour_of_day] = entry;
      if (entry.avg_players > max) max = entry.avg_players;
    });
    return { grid: g, maxAvg: max };
  }, [data]);

  function getCellColor(avg: number | undefined): string {
    if (!avg || maxAvg === 0) return 'bg-gray-900/50';
    const intensity = avg / maxAvg;
    if (intensity > 0.8) return 'bg-cyan-400/80';
    if (intensity > 0.6) return 'bg-cyan-500/60';
    if (intensity > 0.4) return 'bg-cyan-600/50';
    if (intensity > 0.2) return 'bg-cyan-700/40';
    if (intensity > 0.05) return 'bg-cyan-800/30';
    return 'bg-gray-900/50';
  }

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
        <span className="text-2xl">🗓️</span>
        Population Heatmap
        <span className="text-xs text-gray-500 font-normal ml-2">(ET timezone)</span>
      </h3>

      {/* Scrollable container for mobile */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels row */}
          <div className="flex mb-1">
            <div className="w-10 shrink-0"></div>
            {hourLabels.map((label, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[10px] text-gray-500 font-mono"
              >
                {i % 3 === 0 ? label : ''}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {dayLabels.map((day, dayIdx) => (
            <div key={dayIdx} className="flex mb-0.5">
              <div className="w-10 shrink-0 text-xs text-gray-400 font-medium flex items-center">
                {day}
              </div>
              {Array.from({ length: 24 }, (_, hourIdx) => {
                const cell = grid[dayIdx][hourIdx];
                const avg = cell ? Number(cell.avg_players) : 0;
                return (
                  <div
                    key={hourIdx}
                    className={`flex-1 aspect-square rounded-sm mx-px ${getCellColor(avg)} transition-colors cursor-default group relative`}
                    title={
                      cell
                        ? `${day} ${hourLabels[hourIdx]}: avg ${cell.avg_players}, max ${cell.max_players}, ${cell.sample_count} samples`
                        : `${day} ${hourLabels[hourIdx]}: no data`
                    }
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                      <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                        <p className="text-gray-300 font-medium">{day} {hourLabels[hourIdx]}</p>
                        {cell ? (
                          <>
                            <p className="text-cyan-400">Avg: {cell.avg_players} players</p>
                            <p className="text-gray-400">Max: {cell.max_players} | Min: {cell.min_players}</p>
                            <p className="text-gray-500">{cell.sample_count} samples</p>
                          </>
                        ) : (
                          <p className="text-gray-500">No data</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 justify-end">
            <span className="text-xs text-gray-500">Less</span>
            <div className="w-4 h-4 rounded-sm bg-gray-900/50"></div>
            <div className="w-4 h-4 rounded-sm bg-cyan-800/30"></div>
            <div className="w-4 h-4 rounded-sm bg-cyan-700/40"></div>
            <div className="w-4 h-4 rounded-sm bg-cyan-600/50"></div>
            <div className="w-4 h-4 rounded-sm bg-cyan-500/60"></div>
            <div className="w-4 h-4 rounded-sm bg-cyan-400/80"></div>
            <span className="text-xs text-gray-500">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
