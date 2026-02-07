'use client';

import React from 'react';

interface ZoneSelectorProps {
  zones: { key: string; name: string }[];
  selectedZone: string | null;
  onZoneChange: (zone: string | null) => void;
  selectedDays: number;
  onDaysChange: (days: number) => void;
}

const dayOptions = [7, 30, 90];

export default function ZoneSelector({
  zones,
  selectedZone,
  onZoneChange,
  selectedDays,
  onDaysChange,
}: ZoneSelectorProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-4">
      {/* Zone Selection */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 font-medium mb-2 block">Zone</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onZoneChange(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedZone === null
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'bg-gray-900/50 text-gray-400 border border-gray-700/50 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            All Zones
          </button>
          {zones.map((zone) => (
            <button
              key={zone.key}
              onClick={() => onZoneChange(zone.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedZone === zone.key
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                  : 'bg-gray-900/50 text-gray-400 border border-gray-700/50 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {zone.name.split(' - ')[0] === zone.name ? zone.name : zone.name.split(' - ').slice(1).join(' - ')}
            </button>
          ))}
        </div>
      </div>

      {/* Time Range */}
      <div>
        <label className="text-sm text-gray-400 font-medium mb-2 block">Time Range</label>
        <div className="flex gap-2">
          {dayOptions.map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedDays === d
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                  : 'bg-gray-900/50 text-gray-400 border border-gray-700/50 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
