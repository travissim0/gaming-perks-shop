'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
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
  const visibleEntries = payload.filter((p: any) => p.value != null && p.value > 0);
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl max-h-64 overflow-y-auto">
      <p className="text-gray-300 text-sm font-medium mb-1">{label} ET</p>
      {visibleEntries.length > 0 ? (
        visibleEntries
          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
          .map((p: any) => (
            <p key={p.dataKey} className="text-sm" style={{ color: p.color }}>
              {p.name}: {p.value} players
            </p>
          ))
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

  // Initialize enabled zones on first data load
  const zoneList = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((z, i) => ({
      key: z.zone_key,
      title: z.zone_title,
      short: shortZoneName(z.zone_title),
      color: zoneColors[i % zoneColors.length],
    }));
  }, [data]);

  // Auto-enable all zones on first load
  const activeZones = useMemo(() => {
    if (enabledZones !== null) return enabledZones;
    return new Set(zoneList.map((z) => z.key));
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
      const row: any = { hour: formatHour(h) };
      data.forEach((zone) => {
        const hourData = zone.hours.find((hr) => hr.hour === h);
        row[zone.zone_key] = hourData ? hourData.avg_players : 0;
      });
      return row;
    });
  }, [data]);

  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        Zone Population by Hour
        <span className="text-xs text-gray-500 font-normal ml-2">(ET timezone)</span>
      </h3>

      {/* Zone toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {zoneList.map((zone) => (
          <button
            key={zone.key}
            onClick={() => toggleZone(zone.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              activeZones.has(zone.key)
                ? 'opacity-100'
                : 'border-gray-700/50 opacity-30 hover:opacity-50'
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
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
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
                <Line
                  key={zone.key}
                  type="monotone"
                  dataKey={zone.key}
                  name={zone.short}
                  stroke={zone.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: zone.color,
                    stroke: '#111827',
                    strokeWidth: 2,
                  }}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
