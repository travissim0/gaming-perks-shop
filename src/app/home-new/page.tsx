'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import NeutralNavbar from '@/components/home/NeutralNavbar';
import DynamicHeroCarousel from '@/components/home/DynamicHeroCarousel';
import ServerStatusBar from '@/components/home/ServerStatusBar';
import HomeNewsSection from '@/components/home/HomeNewsSection';
import TopSupportersWidget from '@/components/TopSupportersWidget';

interface ServerStats {
  totalPlayers: number;
  activeGames: number;
  serverStatus: string;
}

interface ActiveZone {
  title: string;
  playerCount: number;
}

interface ServerData {
  zones: ActiveZone[];
  stats: ServerStats;
  lastUpdated: string;
}

interface RecentDonation {
  id: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  date: string;
  message?: string;
}

interface RecentOrder {
  id: string;
  customerName: string;
  productName: string;
  amount: number;
  date: string;
}

// Star color palette - weighted towards white with some colored variety
const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#cce0ff', '#ffe8d6', '#b4dcff', '#dcc8ff', '#c8ffff'];

// Enhanced star generation with color and glow properties
const generateEnhancedStars = (count: number, type: 'dust' | 'medium' | 'bright' | 'feature') => {
  return Array.from({ length: count }, (_, i) => {
    const color = type === 'dust' ? '#ffffff' : STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    let size: number, opacity: number;
    switch (type) {
      case 'dust':
        size = Math.random() * 1 + 0.3;
        opacity = Math.random() * 0.25 + 0.05;
        break;
      case 'medium':
        size = Math.random() * 1.5 + 0.5;
        opacity = Math.random() * 0.4 + 0.15;
        break;
      case 'bright':
        size = Math.random() * 2 + 1;
        opacity = Math.random() * 0.5 + 0.3;
        break;
      case 'feature':
        size = Math.random() * 2.5 + 2;
        opacity = Math.random() * 0.4 + 0.5;
        break;
    }
    return {
      id: `page-${type}-${i}`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size,
      opacity,
      color,
      animationDuration: `${Math.random() * 5 + 3}s`,
      animationDelay: `${Math.random() * 5}s`,
    };
  });
};

// Warp stars - radiate outward from center for traveling-through-space effect
const generateWarpStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 800;
    // Small random offset from center for natural spread
    const originX = (Math.random() - 0.5) * 80;
    const originY = (Math.random() - 0.5) * 80;
    return {
      id: `warp-${i}`,
      originX,
      originY,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: Math.random() * 1.5 + 0.5,
      duration: Math.random() * 6 + 4,
      delay: Math.random() * 10,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
};

export default function HomeNew() {
  const { user } = useAuth();
  const [serverData, setServerData] = useState<ServerData>({
    zones: [],
    stats: { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
    lastUpdated: ''
  });
  const [recentDonations, setRecentDonations] = useState<RecentDonation[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(true);

  // Enhanced page-wide starfield + warp stars
  const pageStars = useMemo(() => ({
    dust: generateEnhancedStars(150, 'dust'),
    medium: generateEnhancedStars(80, 'medium'),
    bright: generateEnhancedStars(40, 'bright'),
    feature: generateEnhancedStars(8, 'feature'),
    warp: generateWarpStars(70),
  }), []);

  // Fetch server status
  useEffect(() => {
    const fetchServerData = async () => {
      try {
        const response = await fetch('/api/server-status');
        const data = await response.json();
        if (data) {
          setServerData({
            zones: data.zones || [],
            stats: data.stats || { totalPlayers: 0, activeGames: 0, serverStatus: 'offline' },
            lastUpdated: data.lastUpdated || new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Failed to fetch server data:', error);
      }
    };

    fetchServerData();
    const interval = setInterval(fetchServerData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch donations, orders, and top supporters
  useEffect(() => {
    const fetchFinancialData = async () => {
      try {
        setIsLoadingFinancials(true);

        // 30-day rolling window
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        // Fetch recent donations (last 30 days)
        const { data: donationsData } = await supabase
          .from('donation_transactions')
          .select('id, amount_cents, customer_name, kofi_from_name, payment_method, created_at, donation_message')
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgoISO)
          .order('created_at', { ascending: false })
          .limit(5);

        if (donationsData) {
          setRecentDonations(donationsData.map((d: any) => ({
            id: d.id,
            customerName: d.kofi_from_name || d.customer_name || 'Anonymous',
            amount: d.amount_cents / 100,
            paymentMethod: d.payment_method || 'kofi',
            date: d.created_at,
            message: d.donation_message
          })));
        }

        // Fetch recent orders with profile and product info (last 30 days)
        const { data: ordersData } = await supabase
          .from('user_products')
          .select('id, user_id, product_id, created_at')
          .gte('created_at', thirtyDaysAgoISO)
          .order('created_at', { ascending: false })
          .limit(5);

        if (ordersData && ordersData.length > 0) {
          // Get unique user IDs and product IDs
          const userIds = [...new Set(ordersData.map((o: any) => o.user_id))];
          const productIds = [...new Set(ordersData.map((o: any) => o.product_id))];

          // Fetch profiles
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, in_game_alias')
            .in('id', userIds);

          // Fetch products
          const { data: products } = await supabase
            .from('products')
            .select('id, name, price')
            .in('id', productIds);

          const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]));
          const productsMap = new Map((products || []).map((p: any) => [p.id, p]));

          setRecentOrders(ordersData.map((o: any) => {
            const profile = profilesMap.get(o.user_id);
            const product = productsMap.get(o.product_id);
            return {
              id: o.id,
              customerName: profile?.in_game_alias || 'Unknown',
              productName: product?.name || 'Unknown Product',
              amount: (product?.price || 0) / 100,
              date: o.created_at
            };
          }));
        }

      } catch (error) {
        console.error('Failed to fetch financial data:', error);
      } finally {
        setIsLoadingFinancials(false);
      }
    };

    fetchFinancialData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    });
  };

  return (
    <div className="min-h-screen relative">
      {/* ─── Page-Wide Space Background ─── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Deep space gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)',
        }} />

        {/* Animated nebula layers */}
        <div className="absolute inset-0 nebula-drift-1" style={{
          background: 'radial-gradient(ellipse at 25% 15%, rgba(34, 211, 238, 0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(34, 211, 238, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-2" style={{
          background: 'radial-gradient(ellipse at 75% 25%, rgba(139, 92, 246, 0.06) 0%, transparent 45%), radial-gradient(ellipse at 15% 75%, rgba(139, 92, 246, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-3" style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(236, 72, 153, 0.04) 0%, transparent 35%), radial-gradient(ellipse at 30% 60%, rgba(59, 130, 246, 0.05) 0%, transparent 45%)',
        }} />

        {/* Star dust layer - tiny, static background texture */}
        {pageStars.dust.map((star) => (
          <div key={star.id} className="absolute rounded-full" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
          }} />
        ))}

        {/* Medium twinkling stars */}
        {pageStars.medium.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}

        {/* Bright stars with bloom glow */}
        {pageStars.bright.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
            boxShadow: `0 0 ${star.size * 3}px ${star.color}50, 0 0 ${star.size * 6}px ${star.color}25`,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}

        {/* Feature stars with diffraction cross-spikes */}
        {pageStars.feature.map((star) => (
          <div key={star.id} className="absolute" style={{ left: star.left, top: star.top }}>
            <div className="absolute rounded-full animate-pulse" style={{
              width: star.size, height: star.size,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 4}px ${star.color}60, 0 0 ${star.size * 10}px ${star.color}30, 0 0 ${star.size * 20}px ${star.color}10`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
            <div className="absolute animate-pulse" style={{
              width: star.size * 8, height: 1,
              top: star.size / 2, left: -(star.size * 3.5),
              background: `linear-gradient(90deg, transparent, ${star.color}30, ${star.color}60, ${star.color}30, transparent)`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
            <div className="absolute animate-pulse" style={{
              width: 1, height: star.size * 8,
              left: star.size / 2, top: -(star.size * 3.5),
              background: `linear-gradient(180deg, transparent, ${star.color}30, ${star.color}60, ${star.color}30, transparent)`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
          </div>
        ))}

        {/* Warp stars - traveling through space, radiating from center outward */}
        {pageStars.warp.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `calc(50% + ${star.originX}px)`,
              top: `calc(50% + ${star.originY}px)`,
              width: star.size,
              height: star.size,
              backgroundColor: star.color,
              ['--warp-x' as string]: `${star.dx}px`,
              ['--warp-y' as string]: `${star.dy}px`,
              animation: `warpTravel ${star.duration}s linear infinite ${star.delay}s`,
            }}
          />
        ))}

        {/* Shooting stars */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="shooting-star-1" />
          <div className="shooting-star-2" />
          <div className="shooting-star-3" />
          <div className="shooting-star-4" />
        </div>
      </div>

      {/* Space background CSS animations */}
      <style jsx>{`
        .nebula-drift-1 { animation: nebulaDrift1 30s ease-in-out infinite; }
        .nebula-drift-2 { animation: nebulaDrift2 25s ease-in-out infinite; }
        .nebula-drift-3 { animation: nebulaDrift3 35s ease-in-out infinite; }
        @keyframes nebulaDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.1); }
        }
        @keyframes nebulaDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-25px, 15px) scale(1.05); }
        }
        @keyframes nebulaDrift3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 25px); }
        }
        .shooting-star-1, .shooting-star-2, .shooting-star-3, .shooting-star-4 {
          position: absolute;
          height: 1px;
          border-radius: 999px;
          opacity: 0;
        }
        .shooting-star-1 {
          top: 12%; left: -100px; width: 80px;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(255,255,255,0.3);
          animation: shootStar1 8s ease-in-out infinite 2s;
        }
        .shooting-star-2 {
          top: 35%; left: -80px; width: 60px;
          background: linear-gradient(90deg, rgba(100,200,255,0) 0%, rgba(100,200,255,0.7) 50%, rgba(100,200,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(100,200,255,0.3);
          animation: shootStar2 12s ease-in-out infinite 6s;
        }
        .shooting-star-3 {
          top: 65%; left: -120px; width: 100px;
          background: linear-gradient(90deg, rgba(200,180,255,0) 0%, rgba(200,180,255,0.6) 50%, rgba(200,180,255,0) 100%);
          box-shadow: 0 0 8px 1px rgba(200,180,255,0.2);
          animation: shootStar1 15s ease-in-out infinite 10s;
        }
        .shooting-star-4 {
          top: 22%; left: -60px; width: 50px;
          background: linear-gradient(90deg, rgba(255,220,150,0) 0%, rgba(255,220,150,0.7) 50%, rgba(255,220,150,0) 100%);
          box-shadow: 0 0 4px 1px rgba(255,220,150,0.2);
          animation: shootStar2 10s ease-in-out infinite 15s;
        }
        @keyframes shootStar1 {
          0% { transform: translateX(0) translateY(0) rotate(-25deg); opacity: 0; }
          3% { opacity: 1; }
          12% { opacity: 0.8; }
          15% { transform: translateX(calc(100vw + 300px)) translateY(120px) rotate(-25deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes shootStar2 {
          0% { transform: translateX(0) translateY(0) rotate(-15deg); opacity: 0; }
          2% { opacity: 1; }
          8% { opacity: 0.8; }
          10% { transform: translateX(calc(100vw + 200px)) translateY(60px) rotate(-15deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes warpTravel {
          0% { transform: translate(0, 0) scale(0.1); opacity: 0; }
          5% { opacity: 0.3; }
          40% { opacity: 0.7; }
          80% { opacity: 0.9; }
          100% { transform: translate(var(--warp-x), var(--warp-y)) scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* ─── Page Content (above starfield) ─── */}
      <div className="relative z-10">
        {/* Navbar */}
        <NeutralNavbar />

        {/* Server Status Bar */}
        <ServerStatusBar
          totalPlayers={serverData.stats.totalPlayers}
          zones={serverData.zones}
          serverStatus={serverData.stats.serverStatus}
        />

        {/* Main Content Grid */}
        <div className="max-w-[1600px] mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Left Sidebar: Carousel + Donations + Supporters */}
            <div className="lg:col-span-1 space-y-4 order-2 lg:order-1">
              {/* Compact Carousel */}
              <DynamicHeroCarousel compact />

              {/* Recent Activity - Side by Side (hide orders if empty) */}
              <div className="grid grid-cols-1 gap-3">
                {/* Recent Donations */}
                <div className="bg-gray-900/60 backdrop-blur-sm rounded-lg border border-amber-500/15 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-800/80">
                    <div className="flex items-center gap-2">
                      <div className="w-0.5 h-3.5 bg-gradient-to-b from-amber-400 to-orange-500 rounded-full" />
                      <h3 className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 uppercase tracking-wider">
                        Donations
                      </h3>
                      <span className="text-[10px] text-gray-600 ml-auto">30d</span>
                    </div>
                  </div>
                  {isLoadingFinancials ? (
                    <div className="p-2 space-y-1">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse h-6 bg-gray-800/30 rounded"></div>
                      ))}
                    </div>
                  ) : recentDonations.length > 0 ? (
                    <div className="p-1.5 space-y-0.5">
                      {recentDonations.slice(0, 5).map((donation) => (
                        <div key={donation.id} className="group px-2 py-1 rounded hover:bg-gray-800/40 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <div className="w-0.5 h-3 bg-amber-500/30 rounded-full group-hover:bg-amber-400/50 transition-colors flex-shrink-0" />
                            <span className="text-gray-300 text-xs truncate flex-1 min-w-0">
                              {donation.customerName}
                            </span>
                            <span className="text-gray-600 text-[10px] whitespace-nowrap">
                              {formatDate(donation.date)}
                            </span>
                            <span className="text-amber-400/80 font-semibold text-xs whitespace-nowrap">
                              ${donation.amount.toFixed(0)}
                            </span>
                          </div>
                          {donation.message && (
                            <p
                              className={`ml-2.5 mt-0.5 text-gray-500 text-[10px] italic ${donation.amount < 100 ? 'truncate cursor-help' : ''}`}
                              title={donation.amount < 100 ? donation.message : undefined}
                            >
                              &ldquo;{donation.message}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-gray-600 text-[10px]">No donations this month</div>
                  )}
                </div>

                {/* Recent Orders - only shown when there are orders */}
                {!isLoadingFinancials && recentOrders.length === 0 ? null : (
                  <div className="bg-gray-900/60 backdrop-blur-sm rounded-lg border border-emerald-500/15 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-800/80">
                      <div className="flex items-center gap-2">
                        <div className="w-0.5 h-3.5 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full" />
                        <h3 className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 uppercase tracking-wider">
                          Orders
                        </h3>
                        <span className="text-[10px] text-gray-600 ml-auto">30d</span>
                      </div>
                    </div>
                    {isLoadingFinancials ? (
                      <div className="p-2 space-y-1">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="animate-pulse h-6 bg-gray-800/30 rounded"></div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-1.5 space-y-0.5">
                        {recentOrders.slice(0, 5).map((order) => (
                          <div key={order.id} className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-800/40 transition-colors">
                            <div className="w-0.5 h-3 bg-emerald-500/30 rounded-full group-hover:bg-emerald-400/50 transition-colors flex-shrink-0" />
                            <span className="text-gray-300 text-xs truncate min-w-0 flex-1">
                              {order.customerName}
                            </span>
                            <span className="text-gray-600 text-[10px] whitespace-nowrap">
                              {formatDate(order.date)}
                            </span>
                            <span className="text-emerald-400/80 font-semibold text-xs whitespace-nowrap">
                              ${order.amount.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Top Supporters */}
              <TopSupportersWidget maxSupporters={10} />
            </div>

            {/* Center: News Section - Takes 3 columns */}
            <div className="lg:col-span-3 order-1 lg:order-2">
              <HomeNewsSection />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-gray-800/50 py-6 bg-gray-950/30 backdrop-blur-sm">
          <div className="max-w-[1600px] mx-auto px-4 text-center">
            <div className="text-xl font-black tracking-wider mb-1">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
                FREE INFANTRY
              </span>
            </div>
            <p className="text-gray-500 text-xs">
              Community Gaming Hub
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
