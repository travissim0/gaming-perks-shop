'use client';

import React from 'react';

interface SummaryData {
  total_snapshots: number;
  avg_server_pop: number;
  most_popular_zone: { key: string; title: string; avg: number };
  peak_hour: { day_of_week: number; hour_of_day: number; avg_players: number } | null;
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/30 p-4">
          <div className="animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-24 mb-3"></div>
            <div className="h-8 bg-gray-700 rounded w-16 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-20"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ZoneSummaryCards({
  data,
  loading,
}: {
  data: SummaryData | null;
  loading: boolean;
}) {
  if (loading) return <SummarySkeleton />;
  if (!data) return null;

  const cards = [
    {
      label: 'Total Snapshots',
      value: data.total_snapshots.toLocaleString(),
      detail: 'data points collected',
      color: 'text-cyan-400',
    },
    {
      label: 'Avg Server Pop',
      value: data.avg_server_pop.toString(),
      detail: 'players per snapshot',
      color: 'text-green-400',
    },
    {
      label: 'Most Popular Zone',
      value: data.most_popular_zone.title.split(' - ').slice(1).join(' - ') || data.most_popular_zone.title,
      detail: `${data.most_popular_zone.avg} avg players`,
      color: 'text-orange-400',
    },
    {
      label: 'Peak Hour',
      value: data.peak_hour
        ? `${dayNames[data.peak_hour.day_of_week]} ${formatHour(data.peak_hour.hour_of_day)}`
        : 'N/A',
      detail: data.peak_hour ? `${data.peak_hour.avg_players} avg players` : 'not enough data',
      color: 'text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-gray-600/50 transition-colors p-4"
        >
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">{card.label}</p>
          <p className={`text-2xl font-bold ${card.color} mb-1 truncate`}>{card.value}</p>
          <p className="text-xs text-gray-500">{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
