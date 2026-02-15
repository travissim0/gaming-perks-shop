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
    <div className="min-h-screen relative overflow-hidden" style={{
      background: 'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)',
    }}>
      {/* Nebula background effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[800px] h-[800px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(34, 211, 238, 0.06) 0%, transparent 60%)',
            top: '-10%', left: '-10%',
            animation: 'nebulaDrift1 30s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.05) 0%, transparent 55%)',
            top: '30%', right: '-5%',
            animation: 'nebulaDrift2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-40"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(236, 72, 153, 0.04) 0%, transparent 50%)',
            bottom: '5%', left: '20%',
            animation: 'nebulaDrift3 35s ease-in-out infinite',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Hero Header */}
        <div className="mb-10 animate-fadeIn">
          <div className="relative">
            {/* Decorative accent line */}
            <div className="absolute -left-4 top-0 w-1 h-full bg-gradient-to-b from-cyan-400 via-blue-500 to-purple-500 rounded-full opacity-60" />

            <div className="pl-4">
              <div className="flex items-center gap-4 mb-3">
                <div className="relative">
                  <span className="text-4xl" style={{ filter: 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.4))' }}>
                    🧭
                  </span>
                </div>
                <div>
                  <h1
                    className="text-4xl md:text-5xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400"
                    style={{ textShadow: '0 0 40px rgba(34, 211, 238, 0.15)' }}
                  >
                    Zone Explorer
                  </h1>
                  <div className="mt-2 h-0.5 w-32 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full" />
                </div>
              </div>

              <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-xl">
                Discover game zones, check live populations, and find your next match.
              </p>

              {/* Live stats bar */}
              {totalOnline > 0 && (
                <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-gray-900/60 backdrop-blur-sm border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                    </span>
                    <span className="text-green-400 font-bold text-sm">
                      {totalOnline}
                    </span>
                    <span className="text-gray-500 text-sm">
                      player{totalOnline !== 1 ? 's' : ''} online now
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Admin Panel */}
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
            <div className="inline-block p-8 rounded-2xl bg-gray-900/60 backdrop-blur-sm border border-red-500/20">
              <p className="text-red-400 text-lg font-semibold mb-2">Failed to load zones</p>
              <p className="text-gray-500 text-sm mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-gradient-to-r from-red-600/30 to-red-500/20 border border-red-500/40 text-red-400 rounded-lg hover:border-red-400 transition-all text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredData ? (
          <>
            {/* Filters */}
            <div className="mb-8 animate-slideUp" style={{ animationDelay: '0.1s' }}>
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
            {filteredData.categories.map((cat, i) => (
              <div key={cat.id} className="animate-slideUp" style={{ animationDelay: `${0.15 + i * 0.05}s` }}>
                <ZoneCategorySection
                  category={cat}
                  defaultExpanded={true}
                  isLoggedIn={isLoggedIn}
                  subscriptions={subscriptions}
                  onSubscribe={handleSubscribe}
                  onUnsubscribe={handleUnsubscribe}
                />
              </div>
            ))}

            {/* Uncategorized */}
            {filteredData.uncategorized.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 py-3 px-1 mb-2">
                  <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.3))' }}>📦</span>
                  <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-300 to-gray-400 uppercase tracking-wider">
                    Uncategorized Zones
                  </h2>
                  <span className="text-[11px] font-mono text-gray-500 bg-gray-800/60 px-2.5 py-0.5 rounded-full border border-gray-700/40">
                    {filteredData.uncategorized.length}
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Assign categories above
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                  <div className="inline-block p-8 rounded-2xl bg-gray-900/40 backdrop-blur-sm border border-gray-700/30">
                    <p className="text-gray-400 text-lg mb-1">No zones match your filter</p>
                    <p className="text-gray-600 text-sm">
                      Try adjusting your search or category filter.
                    </p>
                  </div>
                </div>
              )}
          </>
        ) : null}
      </div>
    </div>
  );
}
