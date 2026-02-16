'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ZoneExplorerData,
  ZoneExplorerCard as ZoneExplorerCardType,
} from '@/types/zone-explorer';
import ZoneCategorySection from '@/components/zone-explorer/ZoneCategorySection';
import ZoneExplorerCard from '@/components/zone-explorer/ZoneExplorerCard';
import ZoneExplorerFilters from '@/components/zone-explorer/ZoneExplorerFilters';
import ZoneExplorerSkeleton from '@/components/zone-explorer/ZoneExplorerSkeleton';
import ZoneCategoryAdmin from '@/components/zone-explorer/ZoneCategoryAdmin';
import SpaceBackground from '@/components/SpaceBackground';
import { supabase } from '@/lib/supabase';

export default function ZoneExplorerPage() {
  const [data, setData] = useState<ZoneExplorerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'az' | 'active'>('active');

  // Auth & subscriptions
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [subscriptions, setSubscriptions] = useState<Map<string, number>>(new Map());

  // Check auth + admin status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session?.user);
      setAccessToken(session?.access_token || '');

      if (session?.user) {
        fetchSubscriptions(session.access_token);
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(!!profile?.is_admin);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session?.user);
      setAccessToken(session?.access_token || '');
      if (session?.user) {
        fetchSubscriptions(session.access_token);
      } else {
        setSubscriptions(new Map());
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSubscriptions = async (token: string) => {
    try {
      const res = await fetch('/api/zone-notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const subs = await res.json();
        const map = new Map<string, number>();
        (subs as any[]).forEach((s) => {
          if (s.is_active) map.set(s.zone_title, s.threshold);
        });
        setSubscriptions(map);
      }
    } catch {
      // Silently fail
    }
  };

  const fetchData = useCallback(async (bustCache = false) => {
    try {
      setLoading(true);
      // Add cache-buster when admin changes mappings to bypass CDN s-maxage
      const url = bustCache
        ? `/api/zone-explorer?t=${Date.now()}`
        : '/api/zone-explorer';
      const res = await fetch(url, bustCache ? { cache: 'no-store' } : undefined);
      if (!res.ok) throw new Error('Failed to load zones');
      const json: ZoneExplorerData = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubscribe = useCallback(async (zoneTitle: string, threshold: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch('/api/zone-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ zone_title: zoneTitle, threshold }),
    });

    if (res.ok) {
      setSubscriptions((prev) => {
        const next = new Map(prev);
        next.set(zoneTitle, threshold);
        return next;
      });
    }
  }, []);

  const handleUnsubscribe = useCallback(async (zoneTitle: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/zone-notifications?zone_title=${encodeURIComponent(zoneTitle)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setSubscriptions((prev) => {
        const next = new Map(prev);
        next.delete(zoneTitle);
        return next;
      });
    }
  }, []);

  const sortZones = useCallback(
    (zones: ZoneExplorerCardType[]) => {
      const sorted = [...zones];
      switch (sortBy) {
        case 'active':
          sorted.sort((a, b) => b.current_players - a.current_players);
          break;
        case 'popular':
          sorted.sort((a, b) => b.interest_count - a.interest_count || b.current_players - a.current_players);
          break;
        case 'az':
          sorted.sort((a, b) => a.zone_title.localeCompare(b.zone_title));
          break;
      }
      return sorted;
    },
    [sortBy]
  );

  const filteredData = useMemo(() => {
    if (!data) return null;
    const lowerQuery = searchQuery.toLowerCase();

    const filterZones = (zones: ZoneExplorerCardType[]) => {
      let filtered = zones;
      if (lowerQuery) {
        filtered = filtered.filter(
          (z) =>
            z.zone_title.toLowerCase().includes(lowerQuery) ||
            z.zone_key.toLowerCase().includes(lowerQuery)
        );
      }
      return sortZones(filtered);
    };

    let categories = data.categories;
    if (activeCategory) {
      categories = categories.filter((c) => c.id === activeCategory);
    }

    return {
      categories: categories
        .map((cat) => ({ ...cat, zones: filterZones(cat.zones) }))
        .filter((cat) => cat.zones.length > 0),
      uncategorized: filterZones(data.uncategorized),
    };
  }, [data, activeCategory, searchQuery, sortZones]);

  const allCategories = useMemo(() => {
    if (!data) return [];
    return data.categories.map((c) => ({
      id: c.id, name: c.name, icon: c.icon,
      accent_color: c.accent_color, description: c.description, sort_order: c.sort_order,
    }));
  }, [data]);

  const totalOnline = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    data.categories.forEach((cat) => cat.zones.forEach((z) => (total += z.current_players)));
    data.uncategorized.forEach((z) => (total += z.current_players));
    return total;
  }, [data]);

  return (
    <div className="min-h-screen relative">
      <SpaceBackground />
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-5">
        {/* Compact header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.3))' }}>
            🧭
          </span>
          <h1 className="text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
            Zone Explorer
          </h1>
          <div className="h-0.5 w-16 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full" />
          {totalOnline > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 ml-auto">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-green-400 font-bold text-xs">{totalOnline}</span>
              <span className="text-gray-500 text-xs">online</span>
            </div>
          )}
        </div>

        {/* Admin Panel */}
        {isAdmin && accessToken && (
          <ZoneCategoryAdmin
            accessToken={accessToken}
            onMappingsChanged={() => fetchData(true)}
          />
        )}

        {/* Content */}
        {loading ? (
          <ZoneExplorerSkeleton />
        ) : error ? (
          <div className="text-center py-12">
            <div className="inline-block p-6 rounded-xl bg-gray-900/60 border border-red-500/20">
              <p className="text-red-400 font-semibold mb-1">Failed to load zones</p>
              <p className="text-gray-500 text-sm mb-3">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-1.5 bg-red-600/20 border border-red-500/40 text-red-400 rounded-lg hover:border-red-400 transition-all text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredData ? (
          <div className="space-y-4">
            {/* Filters */}
            <ZoneExplorerFilters
              categories={allCategories}
              activeCategory={activeCategory}
              searchQuery={searchQuery}
              sortBy={sortBy}
              onCategoryChange={setActiveCategory}
              onSearchChange={setSearchQuery}
              onSortChange={setSortBy}
            />

            {/* Category sections */}
            {filteredData.categories.map((cat) => (
              <ZoneCategorySection
                key={cat.id}
                category={cat}
                defaultExpanded={true}
                isLoggedIn={isLoggedIn}
                subscriptions={subscriptions}
                onSubscribe={handleSubscribe}
                onUnsubscribe={handleUnsubscribe}
              />
            ))}

            {/* Uncategorized */}
            {filteredData.uncategorized.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-700/30 bg-gray-800/30 mb-2">
                  <span className="text-lg">📦</span>
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                    Uncategorized
                  </h2>
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full border border-gray-700/30">
                    {filteredData.uncategorized.length}
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Assign above
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredData.uncategorized.map((zone) => (
                    <ZoneExplorerCard
                      key={zone.zone_key}
                      zone={zone}
                      accentColor="cyan"
                      isLoggedIn={isLoggedIn}
                      isSubscribed={subscriptions.has(zone.zone_title)}
                      subscriptionThreshold={subscriptions.get(zone.zone_title)}
                      onSubscribe={handleSubscribe}
                      onUnsubscribe={handleUnsubscribe}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredData.categories.length === 0 &&
              filteredData.uncategorized.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-1">No zones match your filter</p>
                  <p className="text-gray-600 text-sm">
                    Try adjusting your search or category.
                  </p>
                </div>
              )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
