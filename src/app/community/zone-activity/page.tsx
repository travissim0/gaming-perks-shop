'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity } from 'lucide-react';
import ZoneSelector from '@/components/zone-activity/ZoneSelector';
import ZoneSummaryCards from '@/components/zone-activity/ZoneSummaryCards';
import PopulationHeatmap from '@/components/zone-activity/PopulationHeatmap';
import PeakHoursCard from '@/components/zone-activity/PeakHoursCard';
import PopulationTrendChart from '@/components/zone-activity/PopulationTrendChart';

export default function ZoneActivityPage() {
  const [zones, setZones] = useState<{ key: string; name: string }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [peakHoursData, setPeakHoursData] = useState<any>(null);
  const [trendData, setTrendData] = useState<any>(null);
  const [hasData, setHasData] = useState(true);

  // Fetch available zones from recorded data
  useEffect(() => {
    fetch(`/api/zone-analytics?type=zones&days=90`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setZones(data);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const zoneParam = selectedZone ? `&zone=${selectedZone}` : '';
    const daysParam = `&days=${selectedDays}`;

    try {
      const [summaryRes, heatmapRes, peakRes, trendRes] = await Promise.all([
        fetch(`/api/zone-analytics?type=summary${daysParam}`),
        fetch(`/api/zone-analytics?type=heatmap${zoneParam}${daysParam}`),
        fetch(`/api/zone-analytics?type=peak-hours${zoneParam}${daysParam}`),
        fetch(`/api/zone-analytics?type=daily-trend${zoneParam}${daysParam}`),
      ]);

      const [summary, heatmap, peak, trend] = await Promise.all([
        summaryRes.json(),
        heatmapRes.json(),
        peakRes.json(),
        trendRes.json(),
      ]);

      setSummaryData(summary);
      setHeatmapData(heatmap);
      setPeakHoursData(peak);
      setTrendData(trend);

      // Check if we have any data at all
      const totalSnapshots = summary.total_snapshots || 0;
      setHasData(totalSnapshots > 0);
    } catch (error) {
      console.error('Failed to fetch zone analytics:', error);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [selectedZone, selectedDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-cyan-400" />
            Zone Activity
          </h1>
          <p className="text-gray-400 mt-1">
            Population analytics and best times to play
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <ZoneSelector
            zones={zones}
            selectedZone={selectedZone}
            onZoneChange={setSelectedZone}
            selectedDays={selectedDays}
            onDaysChange={setSelectedDays}
          />
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

        {/* Data Content */}
        {(loading || hasData) && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <ZoneSummaryCards data={summaryData} loading={loading} />

            {/* Heatmap - full width */}
            <PopulationHeatmap data={heatmapData} loading={loading} />

            {/* Bottom row: Trend + Peak Hours */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PopulationTrendChart data={trendData} loading={loading} />
              <PeakHoursCard data={peakHoursData} loading={loading} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
