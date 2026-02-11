'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity } from 'lucide-react';
import PopulationHeatmap from '@/components/zone-activity/PopulationHeatmap';
import PeakHoursCard from '@/components/zone-activity/PeakHoursCard';
import PopulationTrendChart from '@/components/zone-activity/PopulationTrendChart';

const dayOptions = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

export default function ZoneActivityPage() {
  const [selectedDays, setSelectedDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [zoneHourlyData, setZoneHourlyData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [peakHoursData, setPeakHoursData] = useState<any>(null);
  const [hasData, setHasData] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const daysParam = `&days=${selectedDays}`;

    try {
      const [zoneHourlyRes, heatmapRes, peakRes] = await Promise.all([
        fetch(`/api/zone-analytics?type=zone-hourly${daysParam}`),
        fetch(`/api/zone-analytics?type=heatmap${daysParam}`),
        fetch(`/api/zone-analytics?type=peak-hours${daysParam}`),
      ]);

      const [zoneHourly, heatmap, peak] = await Promise.all([
        zoneHourlyRes.json(),
        heatmapRes.json(),
        peakRes.json(),
      ]);

      setZoneHourlyData(zoneHourly);
      setHeatmapData(heatmap);
      setPeakHoursData(peak);

      setHasData(Array.isArray(zoneHourly) && zoneHourly.length > 0);
    } catch (error) {
      console.error('Failed to fetch zone analytics:', error);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [selectedDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header with inline time range */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-7 h-7 text-cyan-400" />
            Zone Activity
          </h1>
          <div className="flex gap-1.5">
            {dayOptions.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDays(d.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  selectedDays === d.value
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                    : 'text-gray-400 border-gray-700/50 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {!loading && !hasData && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/30 p-12 text-center">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-400 mb-2">
              Collecting population data...
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Analytics will appear after 24 hours of data collection. The server
              records zone populations every 30 minutes.
            </p>
          </div>
        )}

        {/* Charts */}
        {(loading || hasData) && (
          <div className="space-y-4">
            <PopulationHeatmap data={zoneHourlyData} loading={loading} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PopulationTrendChart data={heatmapData} loading={loading} />
              <PeakHoursCard data={peakHoursData} loading={loading} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
