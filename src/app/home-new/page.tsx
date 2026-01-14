'use client';

import React, { useState, useEffect } from 'react';
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

        // Fetch recent donations
        const { data: donationsData } = await supabase
          .from('donation_transactions')
          .select('id, amount_cents, customer_name, kofi_from_name, payment_method, created_at, donation_message')
          .eq('status', 'completed')
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

        // Fetch recent orders with profile and product info
        const { data: ordersData } = await supabase
          .from('user_products')
          .select('id, user_id, product_id, created_at')
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
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Neutral Navbar */}
      <NeutralNavbar />

      {/* Dynamic Space Hero Carousel */}
      <DynamicHeroCarousel />

      {/* Server Status Bar */}
      <ServerStatusBar
        totalPlayers={serverData.stats.totalPlayers}
        zones={serverData.zones}
        serverStatus={serverData.stats.serverStatus}
      />

      {/* Main Content - News (left) + Donations (right) */}
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* News Section - Takes 3 columns */}
          <div className="lg:col-span-3">
            <HomeNewsSection />
          </div>

          {/* Right Sidebar - Donations/Orders (compact) + Top Supporters (prominent) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Donations & Orders - Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Recent Donations */}
              <div className="bg-gray-800/50 rounded-lg border border-yellow-500/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700/50">
                  <h3 className="text-sm font-bold text-yellow-400">Recent Donations</h3>
                </div>
                {isLoadingFinancials ? (
                  <div className="p-2 space-y-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse h-8 bg-gray-700/30 rounded"></div>
                    ))}
                  </div>
                ) : recentDonations.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {recentDonations.slice(0, 5).map((donation) => (
                      <div key={donation.id} className="bg-gray-700/30 rounded px-2 py-1.5 flex items-center gap-2">
                        <span className="text-white text-sm truncate flex-1 min-w-0">
                          {donation.customerName}
                        </span>
                        <span className="text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(donation.date)}
                        </span>
                        <span className="text-yellow-400 font-bold text-sm whitespace-nowrap">
                          ${donation.amount.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-gray-500 text-xs">None</div>
                )}
              </div>

              {/* Recent Orders */}
              <div className="bg-gray-800/50 rounded-lg border border-green-500/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700/50">
                  <h3 className="text-sm font-bold text-green-400">Recent Orders</h3>
                </div>
                {isLoadingFinancials ? (
                  <div className="p-2 space-y-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse h-8 bg-gray-700/30 rounded"></div>
                    ))}
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {recentOrders.slice(0, 5).map((order) => (
                      <div key={order.id} className="bg-gray-700/30 rounded px-2 py-1.5 flex items-center gap-2">
                        <span className="text-white text-sm truncate min-w-0" style={{ flex: '1 1 0' }}>
                          {order.customerName}
                        </span>
                        <span className="text-gray-400 text-xs truncate min-w-0" style={{ flex: '1.5 1 0' }}>
                          {order.productName}
                        </span>
                        <span className="text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(order.date)}
                        </span>
                        <span className="text-green-400 font-bold text-sm whitespace-nowrap">
                          ${order.amount.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-gray-500 text-xs">None</div>
                )}
              </div>
            </div>

            {/* Top Supporters - Full Width with tiered styling */}
            <TopSupportersWidget maxSupporters={10} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-800/50 py-6 bg-gray-950/50">
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
  );
}
