'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.payload?._raw ?? payload[0]?.value;
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-gray-300 text-sm font-medium">{label} ET</p>
      <p className="text-cyan-400 text-sm font-bold">{value} avg players</p>
    </div>
  );
};

export default function AveragePopulationWidget() {
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [peakTotal, setPeakTotal] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [hourlyRes, summaryRes] = await Promise.all([
          fetch('/api/zone-analytics?type=zone-hourly&days=7'),
          fetch('/api/zone-analytics?type=summary&days=7'),
        ]);
        const [zoneHourly, summary] = await Promise.all([
          hourlyRes.json(),
          summaryRes.json(),
        ]);

        if (!Array.isArray(zoneHourly) || zoneHourly.length === 0) {
          setChartData([]);
          setLoading(false);
          return;
        }

        // Sum all zones per hour to get total average population
        const hourlyTotals = Array.from({ length: 24 }, (_, h) => {
          let total = 0;
          zoneHourly.forEach((zone: any) => {
            const hourData = zone.hours.find((hr: any) => hr.hour === h);
            if (hourData) total += hourData.avg_players;
          });
          const raw = Math.round(total * 10) / 10;
          return {
            hour: formatHour(h),
            value: raw > 0 ? Math.max(raw, 1.5) : 0,
            _raw: raw,
          };
        });

        setChartData(hourlyTotals);

        // Actual peak total population from summary
        if (summary.max_server_pop) {
          setPeakTotal(summary.max_server_pop);
        }
      } catch (error) {
        console.error('Failed to fetch average population:', error);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const yMax = useMemo(() => {
    if (!chartData || chartData.length === 0) return 10;
    const max = Math.max(...chartData.map((d) => d._raw));
    if (max <= 5) return Math.max(max + 2, 5);
    if (max <= 15) return Math.ceil(max * 1.2);
    return Math.ceil(max * 1.1);
  }, [chartData]);

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl shadow-cyan-500/5">
        <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-green-400" />
        <div className="p-4 animate-pulse">
          <div className="h-5 bg-gray-700 rounded w-48 mb-3"></div>
          <div className="h-36 bg-gray-700/30 rounded"></div>
        </div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0 || chartData.every((d) => d._raw === 0)) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl shadow-cyan-500/5">
      {/* Top gradient accent */}
      <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-green-400" />

      <div className="px-4 py-3 border-b border-cyan-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-6 bg-gradient-to-b from-cyan-400 via-blue-400 to-green-400 rounded-full" />
            <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-green-400 uppercase tracking-wider">
              Average Population
            </h3>
          </div>
          <Link href="/community/zone-activity" className="text-gray-500 hover:text-cyan-400 transition-colors text-xs">
            Analytics &rarr;
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {peakTotal !== null && (
        <div className="px-4 pt-3 flex items-center justify-end text-xs">
          <div>
            <span className="text-gray-500">7d Peak</span>
            <span className="text-green-400 font-bold ml-1.5">{peakTotal}</span>
            <span className="text-gray-600 ml-1">players</span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-2 pb-3 pt-1 relative">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -5, bottom: 0 }}
            >
              <defs>
                <linearGradient id="avgPopGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hour"
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, yMax]}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={1.5}
                fill="url(#avgPopGrad)"
                fillOpacity={1}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: '#22d3ee',
                  stroke: '#111827',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <span className="absolute bottom-4 right-4 text-[9px] text-gray-600">ET</span>
      </div>
    </div>
  );
}
