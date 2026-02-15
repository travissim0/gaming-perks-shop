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
        // Check admin
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
      // Silently fail - subscriptions are non-critical
    }
  };

  // Fetch zone explorer data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/zone-explorer');
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

  // Subscribe handler (uses zone_title now)
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

  // Unsubscribe handler
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

  // Sort zones within a category
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

  // Filter + sort data
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
        .map((cat) => ({
          ...cat,
          zones: filterZones(cat.zones),
        }))
        .filter((cat) => cat.zones.length > 0),
      uncategorized: filterZones(data.uncategorized),
    };
  }, [data, activeCategory, searchQuery, sortZones]);

  // All categories for filter pills
  const allCategories = useMemo(() => {
    if (!data) return [];
    return data.categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      accent_color: c.accent_color,
      description: c.description,
      sort_order: c.sort_order,
    }));
  }, [data]);

  // Total online across all zones
  const totalOnline = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    data.categories.forEach((cat) =>
      cat.zones.forEach((z) => (total += z.current_players))
    );
    data.uncategorized.forEach((z) => (total += z.current_players));
    return total;
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🧭</span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
              Zone Explorer
            </h1>
          </div>
          <p className="text-gray-400 text-sm pl-12">
            Discover game zones, check live populations, and find your next match.
            {totalOnline > 0 && (
              <span className="ml-2 text-green-400 font-medium">
                {totalOnline} player{totalOnline !== 1 ? 's' : ''} online now
              </span>
            )}
          </p>
        </div>

        {/* Admin Panel — only visible to admins */}
        {isAdmin && accessToken && (
          <ZoneCategoryAdmin
            accessToken={accessToken}
            onMappingsChanged={fetchData}
          />
        )}

        {/* Content */}
        {loading ? (
          <ZoneExplorerSkeleton />
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-lg mb-2">Failed to load zones</p>
            <p className="text-gray-500 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        ) : filteredData ? (
          <>
            {/* Filters */}
            <div className="mb-6">
              <ZoneExplorerFilters
                categories={allCategories}
                activeCategory={activeCategory}
                searchQuery={searchQuery}
                sortBy={sortBy}
                onCategoryChange={setActiveCategory}
                onSearchChange={setSearchQuery}
                onSortChange={setSortBy}
              />
            </div>

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
              <div className="mb-6">
                <div className="flex items-center gap-3 py-3 px-1">
                  <span className="text-2xl">📦</span>
                  <h2 className="text-lg font-bold text-gray-100">
                    Uncategorized Zones
                  </h2>
                  <span className="text-xs text-gray-500 bg-gray-800/70 px-2 py-0.5 rounded-full">
                    {filteredData.uncategorized.length} zone
                    {filteredData.uncategorized.length !== 1 ? 's' : ''}
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Assign categories above
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <div className="text-center py-20">
                  <p className="text-gray-500 text-lg mb-1">No zones match your filter</p>
                  <p className="text-gray-600 text-sm">
                    Try adjusting your search or category filter.
                  </p>
                </div>
              )}
          </>
        ) : null}
      </div>
    </div>
  );
}
