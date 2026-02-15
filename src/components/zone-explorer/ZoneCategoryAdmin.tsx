'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { ZoneCategory } from '@/types/zone-explorer';

interface MappingRow {
  zone_title: string;
  category_id: string | null;
}

interface ZoneCategoryAdminProps {
  accessToken: string;
  onMappingsChanged: () => void;
}

export default function ZoneCategoryAdmin({
  accessToken,
  onMappingsChanged,
}: ZoneCategoryAdminProps) {
  const [categories, setCategories] = useState<ZoneCategory[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [discoveredTitles, setDiscoveredTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zone-category-mappings', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCategories(data.categories || []);
      setDiscoveredTitles(data.discovered_titles || []);

      // Build mapping lookup
      const mappingList: MappingRow[] = [];
      const mappingMap = new Map<string, string>();
      (data.mappings || []).forEach((m: any) => {
        mappingMap.set(m.zone_title, m.category_id);
      });

      // Show all discovered titles, with their current mapping
      (data.discovered_titles || []).forEach((title: string) => {
        mappingList.push({
          zone_title: title,
          category_id: mappingMap.get(title) || null,
        });
      });

      // Also show mapped titles that aren't in discovered (stale mappings)
      (data.mappings || []).forEach((m: any) => {
        if (!mappingList.some((r) => r.zone_title === m.zone_title)) {
          mappingList.push({ zone_title: m.zone_title, category_id: m.category_id });
        }
      });

      setMappings(mappingList);
    } catch (err) {
      console.error('Failed to fetch admin mapping data:', err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCategoryChange = async (zoneTitle: string, categoryId: string) => {
    setSaving(zoneTitle);
    try {
      const res = await fetch('/api/admin/zone-category-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          zone_title: zoneTitle,
          category_id: categoryId || null,
        }),
      });

      if (res.ok) {
        // Update local state
        setMappings((prev) =>
          prev.map((m) =>
            m.zone_title === zoneTitle
              ? { ...m, category_id: categoryId || null }
              : m
          )
        );
        onMappingsChanged();
      }
    } catch (err) {
      console.error('Failed to save mapping:', err);
    } finally {
      setSaving(null);
    }
  };

  const unmappedCount = mappings.filter((m) => !m.category_id).length;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold text-amber-400">
            Admin: Zone Category Mappings
          </span>
          {unmappedCount > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/30">
              {unmappedCount} unmapped
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable panel */}
      {expanded && (
        <div className="border-t border-amber-500/20 px-4 py-3">
          {loading ? (
            <div className="text-gray-500 text-sm animate-pulse">Loading mappings...</div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-[1fr_180px] gap-2 text-[11px] text-gray-500 uppercase tracking-wider pb-1 border-b border-gray-700/50 sticky top-0 bg-gray-950/90 backdrop-blur-sm">
                <span>Zone Title (from API)</span>
                <span>Category</span>
              </div>
              {mappings.map((row) => (
                <div
                  key={row.zone_title}
                  className={`grid grid-cols-[1fr_180px] gap-2 items-center py-1.5 ${
                    !row.category_id ? 'bg-red-500/5 -mx-2 px-2 rounded' : ''
                  }`}
                >
                  <span className={`text-sm truncate ${row.category_id ? 'text-gray-300' : 'text-red-300'}`}>
                    {row.zone_title}
                    {!discoveredTitles.includes(row.zone_title) && (
                      <span className="text-[10px] text-gray-600 ml-2">(stale)</span>
                    )}
                  </span>
                  <div className="relative">
                    <select
                      value={row.category_id || ''}
                      onChange={(e) => handleCategoryChange(row.zone_title, e.target.value)}
                      disabled={saving === row.zone_title}
                      className={`w-full text-xs py-1.5 px-2 rounded-lg border transition-colors cursor-pointer appearance-none
                        ${
                          row.category_id
                            ? 'bg-gray-800/80 border-gray-600/50 text-gray-300'
                            : 'bg-red-900/20 border-red-500/30 text-red-300'
                        }
                        focus:outline-none focus:border-amber-500/50
                        ${saving === row.zone_title ? 'opacity-50' : ''}`}
                    >
                      <option value="">-- Uncategorized --</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                    {saving === row.zone_title && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px]">
                        saving...
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {mappings.length === 0 && (
                <p className="text-gray-500 text-sm py-4 text-center">
                  No zone titles discovered yet. Zone titles appear here once the population cron has run.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
