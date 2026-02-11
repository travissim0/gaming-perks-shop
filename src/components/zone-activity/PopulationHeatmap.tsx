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

interface ZoneHourlyEntry {
  zone_key: string;
  zone_title: string;
  hours: { hour: number; avg_players: number }[];
}

const zoneColors = [
  '#22d3ee', // cyan
  '#f87171', // red
  '#4ade80', // green
  '#fb923c', // orange
  '#818cf8', // indigo
  '#facc15', // yellow
  '#c084fc', // purple
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#a3e635', // lime
  '#fbbf24', // amber
  '#60a5fa', // blue
];

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

function shortZoneName(title: string): string {
  // Strip common prefixes for cleaner display
  const parts = title.split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ') : title;
}

function ChartSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <div className="animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-48 mb-4"></div>
        <div className="h-72 bg-gray-700/30 rounded"></div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const rawData = payload[0]?.payload?._raw || {};
  const visibleEntries = payload.filter((p: any) => p.value != null && p.value > 0 && p.dataKey !== '_raw');
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl max-h-64 overflow-y-auto">
      <p className="text-gray-300 text-sm font-medium mb-1">{label} ET</p>
      {visibleEntries.length > 0 ? (
        visibleEntries
          .sort((a: any, b: any) => ((rawData[b.dataKey] ?? b.value) || 0) - ((rawData[a.dataKey] ?? a.value) || 0))
          .map((p: any) => {
            const realValue = rawData[p.dataKey] ?? p.value;
            return (
              <p key={p.dataKey} className="text-sm" style={{ color: p.color }}>
                {p.name}: {realValue} players
              </p>
            );
          })
      ) : (
        <p className="text-gray-500 text-sm">No players</p>
      )}
    </div>
  );
};

export default function PopulationHeatmap({
  data,
  loading,
}: {
  data: ZoneHourlyEntry[] | null;
  loading: boolean;
}) {
  const [enabledZones, setEnabledZones] = useState<Set<string> | null>(null);

  // Initialize zone list, marking which ones have any activity
  const zoneList = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((z, i) => {
      const hasActivity = z.hours.some((hr) => hr.avg_players > 0);
      return {
        key: z.zone_key,
        title: z.zone_title,
        short: shortZoneName(z.zone_title),
        color: zoneColors[i % zoneColors.length],
        hasActivity,
      };
    });
  }, [data]);

  // Auto-enable only zones with activity on first load
  const activeZones = useMemo(() => {
    if (enabledZones !== null) return enabledZones;
    return new Set(zoneList.filter((z) => z.hasActivity).map((z) => z.key));
  }, [enabledZones, zoneList]);

  const toggleZone = (key: string) => {
    setEnabledZones((prev) => {
      const current = prev ?? new Set(zoneList.map((z) => z.key));
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return Array.from({ length: 24 }, (_, h) => {
      const row: any = { hour: formatHour(h), _raw: {} as any };
      data.forEach((zone) => {
        const hourData = zone.hours.find((hr) => hr.hour === h);
        const raw = hourData ? hourData.avg_players : 0;
        // Visual floor: give non-zero values a minimum height so they don't vanish at the baseline
        row[zone.zone_key] = raw > 0 ? Math.max(raw, 1.5) : 0;
        row._raw[zone.zone_key] = raw;
      });
      return row;
    });
  }, [data]);

  // Calculate a nice Y-axis max that gives breathing room for low counts
  const yMax = useMemo(() => {
    if (!data || data.length === 0) return 10;
    let max = 0;
    data.forEach((zone) => {
      if (!activeZones.has(zone.zone_key)) return;
      zone.hours.forEach((hr) => {
        if (hr.avg_players > max) max = hr.avg_players;
      });
    });
    if (max <= 5) return Math.max(max + 2, 5);
    if (max <= 15) return Math.ceil(max * 1.2);
    return Math.ceil(max * 1.1);
  }, [data, activeZones]);

  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        Zone Population by Hour
        <span className="text-xs text-gray-500 font-normal ml-2">(ET timezone)</span>
      </h3>

      {/* Zone toggles - active zones first, then inactive */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {zoneList
          .sort((a, b) => (b.hasActivity ? 1 : 0) - (a.hasActivity ? 1 : 0))
          .map((zone) => (
          <button
            key={zone.key}
            onClick={() => toggleZone(zone.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              activeZones.has(zone.key)
                ? 'opacity-100'
                : zone.hasActivity
                ? 'border-gray-700/50 opacity-40 hover:opacity-60'
                : 'border-gray-700/50 opacity-20 hover:opacity-35'
            }`}
            style={{
              color: zone.color,
              borderColor: activeZones.has(zone.key) ? zone.color : undefined,
              backgroundColor: activeZones.has(zone.key)
                ? `${zone.color}15`
                : 'transparent',
            }}
          >
            {zone.short}
          </button>
        ))}
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <defs>
              {zoneList.map((zone) => (
                <linearGradient key={zone.key} id={`grad-${zone.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={zone.color} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={zone.color} stopOpacity={0.2} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hour"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              interval={1}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              allowDecimals={false}
              domain={[0, yMax]}
              tickCount={Math.min(yMax + 1, 8)}
              label={{
                value: 'Players',
                angle: -90,
                position: 'insideLeft',
                offset: 20,
                style: { fill: '#6b7280', fontSize: 12 },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            {zoneList.map((zone) =>
              activeZones.has(zone.key) ? (
                <Area
                  key={zone.key}
                  type="monotone"
                  dataKey={zone.key}
                  name={zone.short}
                  stroke={zone.color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${zone.key})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: zone.color,
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
