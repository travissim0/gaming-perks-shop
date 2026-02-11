'use client';

import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface HeatmapEntry {
  day_of_week: number;
  hour_of_day: number;
  avg_players: number;
  max_players: number;
  min_players: number;
  sample_count: number;
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayColors: Record<number, string> = {
  0: '#f87171', // Sun - red
  1: '#fb923c', // Mon - orange
  2: '#facc15', // Tue - yellow
  3: '#4ade80', // Wed - green
  4: '#22d3ee', // Thu - cyan
  5: '#818cf8', // Fri - indigo
  6: '#c084fc', // Sat - purple
};

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

function TrendSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <div className="animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-44 mb-4"></div>
        <div className="h-56 bg-gray-700/30 rounded"></div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-gray-300 text-sm font-medium mb-1">{label}</p>
      {payload
        .filter((p: any) => p.value != null)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
        .map((p: any) => (
          <p key={p.dataKey} className="text-sm" style={{ color: p.color }}>
            {p.name}: {p.value} avg
          </p>
        ))}
    </div>
  );
};

export default function PopulationTrendChart({
  data,
  loading,
}: {
  data: HeatmapEntry[] | null;
  loading: boolean;
}) {
  const [enabledDays, setEnabledDays] = useState<Set<number>>(
    new Set([0, 1, 2, 3, 4, 5, 6])
  );

  const toggleDay = (day: number) => {
    setEnabledDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Build a row per hour with a column per day
    const hours = Array.from({ length: 24 }, (_, h) => {
      const row: any = { hour: formatHour(h) };
      for (let d = 0; d < 7; d++) {
        const entry = data.find(
          (e) => e.day_of_week === d && e.hour_of_day === h
        );
        row[dayNames[d]] = entry ? Number(entry.avg_players) : 0;
      }
      return row;
    });
    return hours;
  }, [data]);

  if (loading) return <TrendSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
        <span className="text-2xl">📈</span>
        Population by Hour
        <span className="text-xs text-gray-500 font-normal ml-2">(ET)</span>
      </h3>

      {/* Day toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {dayNames.map((name, idx) => (
          <button
            key={idx}
            onClick={() => toggleDay(idx)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              enabledDays.has(idx)
                ? 'border-opacity-60 opacity-100'
                : 'border-gray-700/50 opacity-30 hover:opacity-50'
            }`}
            style={{
              color: dayColors[idx],
              borderColor: enabledDays.has(idx) ? dayColors[idx] : undefined,
              backgroundColor: enabledDays.has(idx)
                ? `${dayColors[idx]}15`
                : 'transparent',
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <defs>
              {dayNames.map((name, idx) => (
                <linearGradient key={name} id={`grad-day-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={dayColors[idx]} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={dayColors[idx]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hour"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              interval={2}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {dayNames.map((name, idx) =>
              enabledDays.has(idx) ? (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name}
                  stroke={dayColors[idx]}
                  strokeWidth={1.5}
                  fill={`url(#grad-day-${idx})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: dayColors[idx],
                    stroke: '#111827',
                    strokeWidth: 2,
                  }}
                />
              ) : null
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
