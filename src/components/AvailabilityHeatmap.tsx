'use client';

import { useState, useEffect } from 'react';

interface HeatmapData {
  day_name: string;
  hour_slot: number;
  available_count: number;
  available_players: string[];
}

interface AvailabilityHeatmapProps {
  zoneName: string;
  availabilityData?: Record<string, Record<number, number>>;
  maxCount?: number;
  className?: string;
}

type ViewMode = 'intensity' | 'bubble' | 'bar' | 'gradient';

export default function AvailabilityHeatmap({ zoneName, availabilityData, maxCount, className = "" }: AvailabilityHeatmapProps) {
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('intensity');

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

  useEffect(() => {
    if (availabilityData) {
      // Use provided data instead of fetching
      console.log('🎯 Using provided availability data:', availabilityData);
      setLoading(false);
    } else {
      console.log('🔍 No availability data provided, fetching from API...');
      fetchHeatmapData();
    }
  }, [zoneName, availabilityData]);

  const fetchHeatmapData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/zone-availability-heatmap?zone=${encodeURIComponent(zoneName)}`);
      if (response.ok) {
        const data = await response.json();
        setHeatmapData(data);
      }
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapValue = (day: string, hour: number): HeatmapData | null => {
    // If we have direct availability data, use that instead of API data
    if (availabilityData) {
      // Map day abbreviations to full day names to match the data structure
      const dayMap: Record<string, string> = {
        'Mon': 'Monday',
        'Tue': 'Tuesday', 
        'Wed': 'Wednesday',
        'Thu': 'Thursday',
        'Fri': 'Friday',
        'Sat': 'Saturday',
        'Sun': 'Sunday'
      };
      
      const fullDayName = dayMap[day] || day;
      const count = availabilityData[fullDayName]?.[hour] || 0;
      return {
        day_name: day,
        hour_slot: hour,
        available_count: count,
        available_players: Array.from({ length: count }, (_, i) => `Player ${i + 1}`) // Mock player names
      };
    }
    
    // Fallback to API data format
    const dayMap: Record<string, string> = {
      'Mon': 'Monday',
      'Tue': 'Tuesday', 
      'Wed': 'Wednesday',
      'Thu': 'Thursday',
      'Fri': 'Friday',
      'Sat': 'Saturday',
      'Sun': 'Sunday'
    };
    
    return heatmapData.find(d => d.day_name === dayMap[day] && d.hour_slot === hour) || null;
  };

  // Different intensity calculations for different view modes
  const getIntensityClass = (count: number, maxCount: number, mode: ViewMode): string => {
    if (count === 0) return 'bg-gray-800/50';
    
    const intensity = count / Math.max(maxCount, 1);
    
    switch (mode) {
      case 'intensity':
        // Original green intensity scale with animations for peak times
        if (intensity >= 0.8) return 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse';
        if (intensity >= 0.6) return 'bg-green-400 shadow-md shadow-green-400/40';
        if (intensity >= 0.4) return 'bg-green-300 shadow-sm shadow-green-300/30';
        if (intensity >= 0.2) return 'bg-green-200/70';
        return 'bg-green-100/50';
        
      case 'bubble':
        // Fixed background with size-based bubbles
        return 'bg-cyan-500/20 border border-cyan-400/30';
        
      case 'bar':
        // Blue color scale for bar chart style
        if (intensity >= 0.8) return 'bg-blue-600';
        if (intensity >= 0.6) return 'bg-blue-500';
        if (intensity >= 0.4) return 'bg-blue-400';
        if (intensity >= 0.2) return 'bg-blue-300';
        return 'bg-blue-200';
        
      case 'gradient':
        // Heat map style with red-orange-yellow gradient
        if (intensity >= 0.8) return 'bg-red-500';
        if (intensity >= 0.6) return 'bg-orange-500';
        if (intensity >= 0.4) return 'bg-yellow-500';
        if (intensity >= 0.2) return 'bg-yellow-300';
        return 'bg-yellow-100';
        
      default:
        return 'bg-gray-300';
    }
  };

  const getBubbleSize = (count: number, maxCount: number): string => {
    if (count === 0) return 'w-1 h-1';
    const intensity = count / Math.max(maxCount, 1);
    if (intensity >= 0.8) return 'w-4 h-4';
    if (intensity >= 0.6) return 'w-3.5 h-3.5';
    if (intensity >= 0.4) return 'w-3 h-3';
    if (intensity >= 0.2) return 'w-2.5 h-2.5';
    return 'w-2 h-2';
  };

  const getBarHeight = (count: number, maxCount: number): string => {
    if (count === 0) return 'h-1';
    const intensity = count / Math.max(maxCount, 1);
    if (intensity >= 0.8) return 'h-4';
    if (intensity >= 0.6) return 'h-3.5';
    if (intensity >= 0.4) return 'h-3';
    if (intensity >= 0.2) return 'h-2.5';
    return 'h-2';
  };

  const formatTime = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  const calculatedMaxCount = maxCount || Math.max(...heatmapData.map(d => d.available_count), 1);

  const renderCell = (day: string, hourNum: number) => {
    const data = getHeatmapValue(day, hourNum);
    const count = data?.available_count || 0;
    const players = data?.available_players || [];
    
    const baseClasses = `
      relative transition-all duration-300 cursor-pointer
      ${hoveredCell?.day === day && hoveredCell?.hour === hourNum 
        ? 'scale-110 z-10 ring-2 ring-cyan-400' 
        : 'hover:scale-105'
      }
    `;

    switch (viewMode) {
      case 'bubble':
        return (
          <div
            key={`${day}-${hourNum}`}
            className={`${baseClasses} ${getIntensityClass(count, calculatedMaxCount, viewMode)} h-4 rounded flex items-center justify-center`}
            onMouseEnter={() => setHoveredCell({ day, hour: hourNum })}
            onMouseLeave={() => setHoveredCell(null)}
          >
            {count > 0 && (
              <div className={`${getBubbleSize(count, calculatedMaxCount)} bg-cyan-400 rounded-full transition-all duration-300`}>
              </div>
            )}
            {renderTooltip(day, hourNum, count, players)}
          </div>
        );
        
      case 'bar':
        return (
          <div
            key={`${day}-${hourNum}`}
            className={`${baseClasses} h-4 rounded flex items-end justify-center bg-gray-800/30`}
            onMouseEnter={() => setHoveredCell({ day, hour: hourNum })}
            onMouseLeave={() => setHoveredCell(null)}
          >
            {count > 0 && (
              <div className={`${getBarHeight(count, calculatedMaxCount)} ${getIntensityClass(count, calculatedMaxCount, viewMode)} w-full rounded transition-all duration-300`}>
              </div>
            )}
            {renderTooltip(day, hourNum, count, players)}
          </div>
        );
        
      default:
        return (
          <div
            key={`${day}-${hourNum}`}
            className={`${baseClasses} h-4 rounded ${getIntensityClass(count, calculatedMaxCount, viewMode)}`}
            onMouseEnter={() => setHoveredCell({ day, hour: hourNum })}
            onMouseLeave={() => setHoveredCell(null)}
          >
            {renderTooltip(day, hourNum, count, players)}
            
            {/* Count indicator for high activity */}
            {count >= 3 && viewMode === 'intensity' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white drop-shadow-lg">
                  {count}
                </span>
              </div>
            )}
          </div>
        );
    }
  };

  const renderTooltip = (day: string, hourNum: number, count: number, players: string[]) => {
    if (!(hoveredCell?.day === day && hoveredCell?.hour === hourNum && count > 0)) {
      return null;
    }
    
    return (
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-20">
        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-700 min-w-max">
          <div className="font-semibold text-cyan-300">
            {day} {formatTime(hourNum)}
          </div>
          <div className="text-green-400">
            {count} player{count !== 1 ? 's' : ''} available
          </div>
          {players.length > 0 && (
            <div className="mt-1 space-y-1">
              {players.slice(0, 5).map((player, idx) => (
                <div key={idx} className="text-gray-300">
                  • {player}
                </div>
              ))}
              {players.length > 5 && (
                <div className="text-gray-400">
                  +{players.length - 5} more...
                </div>
              )}
            </div>
          )}
        </div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2">
          <div className="border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-300 mb-4">Availability Heatmap</h3>
        <div className="animate-pulse">
          <div className="grid grid-cols-8 gap-1 mb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-6 bg-gray-700 rounded"></div>
            ))}
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="grid grid-cols-8 gap-1 mb-1">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-4 bg-gray-700 rounded"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800/50 rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-300">Availability Heatmap</h3>
        
        {/* View Mode Selector */}
        <div className="flex gap-1 bg-gray-700/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('intensity')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              viewMode === 'intensity' 
                ? 'bg-green-600 text-white shadow-sm' 
                : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
            }`}
            title="Intensity View - Color intensity shows player count"
          >
            🌈 Intensity
          </button>
          <button
            onClick={() => setViewMode('bubble')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              viewMode === 'bubble' 
                ? 'bg-cyan-600 text-white shadow-sm' 
                : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
            }`}
            title="Bubble View - Bubble size shows player count"
          >
            ⚪ Bubble
          </button>
          <button
            onClick={() => setViewMode('bar')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              viewMode === 'bar' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
            }`}
            title="Bar View - Bar height shows player count"
          >
            📊 Bar
          </button>
          <button
            onClick={() => setViewMode('gradient')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              viewMode === 'gradient' 
                ? 'bg-orange-600 text-white shadow-sm' 
                : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
            }`}
            title="Heat View - Heat colors show player count"
          >
            🔥 Heat
          </button>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
        <span>Less</span>
        <div className="flex gap-1">
          {viewMode === 'intensity' && (
            <>
              <div className="w-3 h-3 bg-gray-800/50 rounded"></div>
              <div className="w-3 h-3 bg-green-100/50 rounded"></div>
              <div className="w-3 h-3 bg-green-200/70 rounded"></div>
              <div className="w-3 h-3 bg-green-300 rounded"></div>
              <div className="w-3 h-3 bg-green-400 rounded"></div>
              <div className="w-3 h-3 bg-green-500 rounded"></div>
            </>
          )}
          {viewMode === 'bubble' && (
            <>
              <div className="w-3 h-3 bg-cyan-500/20 border border-cyan-400/30 rounded flex items-center justify-center">
                <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
              </div>
              <div className="w-3 h-3 bg-cyan-500/20 border border-cyan-400/30 rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
              </div>
              <div className="w-3 h-3 bg-cyan-500/20 border border-cyan-400/30 rounded flex items-center justify-center">
                <div className="w-3 h-3 bg-cyan-400 rounded-full"></div>
              </div>
            </>
          )}
          {viewMode === 'bar' && (
            <>
              <div className="w-3 h-3 bg-gray-800/30 rounded flex items-end">
                <div className="w-full h-1 bg-blue-200 rounded"></div>
              </div>
              <div className="w-3 h-3 bg-gray-800/30 rounded flex items-end">
                <div className="w-full h-2 bg-blue-400 rounded"></div>
              </div>
              <div className="w-3 h-3 bg-gray-800/30 rounded flex items-end">
                <div className="w-full h-3 bg-blue-600 rounded"></div>
              </div>
            </>
          )}
          {viewMode === 'gradient' && (
            <>
              <div className="w-3 h-3 bg-gray-800/50 rounded"></div>
              <div className="w-3 h-3 bg-yellow-100 rounded"></div>
              <div className="w-3 h-3 bg-yellow-300 rounded"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <div className="w-3 h-3 bg-orange-500 rounded"></div>
              <div className="w-3 h-3 bg-red-500 rounded"></div>
            </>
          )}
        </div>
        <span>More</span>
        <span className="ml-2 text-gray-500">•</span>
        <span className="text-gray-500">
          {viewMode === 'intensity' && 'Color intensity shows player count'}
          {viewMode === 'bubble' && 'Bubble size shows player count'}
          {viewMode === 'bar' && 'Bar height shows player count'}
          {viewMode === 'gradient' && 'Heat colors show player count'}
        </span>
      </div>

      <div className="relative">
        {/* Header Row */}
        <div className="grid grid-cols-8 gap-1 mb-2">
          <div className="text-xs text-gray-500"></div>
          {days.map(day => (
            <div key={day} className="text-xs text-gray-400 text-center font-medium">
              {day}
            </div>
          ))}
        </div>

        {/* Heatmap Grid */}
        <div className="space-y-1">
          {hours.map((hour, hourIndex) => {
            // Only show every other hour to reduce clutter
            if (hourIndex % 2 !== 0) return null;
            
            const hourNum = parseInt(hour);
            return (
              <div key={hour} className="grid grid-cols-8 gap-1">
                <div className="text-xs text-gray-500 text-right pr-2 py-1">
                  {formatTime(hourNum)}
                </div>
                {days.map(day => renderCell(day, hourNum))}
              </div>
            );
          })}
        </div>

        {/* Peak times indicator */}
        {calculatedMaxCount > 0 && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="text-sm font-medium text-green-300 mb-1">
              🔥 Peak Activity: {calculatedMaxCount} players
            </div>
            <div className="text-xs text-gray-400">
              {viewMode === 'intensity' && 'Peak times pulse with stronger colors and shadows'}
              {viewMode === 'bubble' && 'Larger bubbles indicate more available players'}
              {viewMode === 'bar' && 'Taller bars indicate more available players'}
              {viewMode === 'gradient' && 'Warmer colors (red) indicate more available players'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 