'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

interface TrendEntry {
  trend_date: string;
  avg_players: number;
  max_players: number;
  min_players: number;
  snapshot_count: number;
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload;
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-gray-300 text-sm font-medium mb-1">{label}</p>
      <p className="text-cyan-400 text-sm">Avg: {entry.avg_players} players</p>
      <p className="text-green-400 text-sm">Max: {entry.max_players}</p>
      <p className="text-gray-500 text-xs mt-1">{entry.snapshot_count} snapshots</p>
    </div>
  );
};

export default function PopulationTrendChart({
  data,
  loading,
}: {
  data: TrendEntry[] | null;
  loading: boolean;
}) {
  if (loading) return <TrendSkeleton />;
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    ...d,
    date: formatDate(d.trend_date),
    avg_players: Number(d.avg_players),
    max_players: Number(d.max_players),
    min_players: Number(d.min_players),
  }));

  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
        <span className="text-2xl">📈</span>
        Population Trend
      </h3>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="avg_players"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#colorAvg)"
              dot={false}
              activeDot={{ r: 4, fill: '#22d3ee', stroke: '#111827', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="max_players"
              stroke="#4ade80"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, fill: '#4ade80', stroke: '#111827', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-cyan-400 rounded"></div>
          <span className="text-xs text-gray-400">Avg Players</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-400 rounded border-dashed"></div>
          <span className="text-xs text-gray-400">Max Players</span>
        </div>
      </div>
    </div>
  );
}
