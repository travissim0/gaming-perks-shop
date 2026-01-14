'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import NeutralNavbar from '@/components/home/NeutralNavbar';
import DynamicHeroCarousel from '@/components/home/DynamicHeroCarousel';
import ServerStatusBar from '@/components/home/ServerStatusBar';
import HomeNewsSection from '@/components/home/HomeNewsSection';

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
  email: string;
  amount: number;
  date: string;
}

interface TopSupporter {
  name: string;
  totalAmount: number;
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
  const [topSupporters, setTopSupporters] = useState<TopSupporter[]>([]);
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
              email: profile?.email || '',
              amount: (product?.price || 0) / 100,
              date: o.created_at
            };
          }));
        }

        // Fetch top supporters
        const response = await fetch('/api/supporters');
        const supportersData = await response.json();
        if (supportersData.topSupporters) {
          setTopSupporters(supportersData.topSupporters.slice(0, 5).map((s: any) => ({
            name: s.name,
            totalAmount: s.totalAmount
          })));
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* News Section - Takes 3 columns */}
          <div className="lg:col-span-3">
            <HomeNewsSection />
          </div>

          {/* Right Sidebar - Donations, Orders, Top Supporters */}
          <div className="lg:col-span-1 space-y-4">
            {/* Recent Donations */}
            <div className="bg-gray-800/50 rounded-lg border border-yellow-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/50">
                <h3 className="text-sm font-bold text-white">Recent Donations</h3>
              </div>
              {isLoadingFinancials ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-14 bg-gray-700/30 rounded"></div>
                  ))}
                </div>
              ) : recentDonations.length > 0 ? (
                <div className="p-3 space-y-2">
                  {recentDonations.map((donation) => (
                    <div key={donation.id} className="bg-gray-700/30 rounded-lg p-2.5 border border-gray-600/30">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-white text-sm font-medium truncate max-w-[100px]">
                          {donation.customerName}
                        </span>
                        <span className="text-yellow-400 font-bold text-sm">
                          ${donation.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span>{donation.paymentMethod}</span>
                        <span>{formatDate(donation.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">No recent donations</div>
              )}
            </div>

            {/* Recent Orders */}
            <div className="bg-gray-800/50 rounded-lg border border-green-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/50">
                <h3 className="text-sm font-bold text-white">Recent Orders</h3>
              </div>
              {isLoadingFinancials ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-16 bg-gray-700/30 rounded"></div>
                  ))}
                </div>
              ) : recentOrders.length > 0 ? (
                <div className="p-3 space-y-2">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="bg-gray-700/30 rounded-lg p-2.5 border border-gray-600/30">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-white text-sm font-medium truncate max-w-[100px]">
                          {order.customerName}
                        </span>
                        <span className="text-green-400 font-bold text-sm">
                          ${order.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-gray-300 text-xs mb-1 truncate">
                        {order.productName}
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span className="truncate max-w-[100px]">{order.email}</span>
                        <span>{formatDate(order.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">No recent orders</div>
              )}
            </div>

            {/* Top Supporters */}
            <div className="bg-gray-800/50 rounded-lg border border-purple-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/50">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🏆</span>
                  Top Supporters
                </h3>
              </div>
              {isLoadingFinancials ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-8 bg-gray-700/30 rounded"></div>
                  ))}
                </div>
              ) : topSupporters.length > 0 ? (
                <div className="p-3 space-y-1.5">
                  {topSupporters.map((supporter, index) => {
                    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];
                    const colors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-purple-400', 'text-purple-400'];
                    return (
                      <div key={index} className="flex items-center justify-between py-1.5 px-2 bg-gray-700/30 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{medals[index]}</span>
                          <span className="text-white text-sm truncate max-w-[90px]">
                            {supporter.name}
                          </span>
                        </div>
                        <span className={`font-bold text-sm ${colors[index]}`}>
                          ${supporter.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">No supporters yet</div>
              )}
              <div className="px-3 pb-3">
                <Link
                  href="/donate"
                  className="block w-full text-center py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-sm transition-colors"
                >
                  Support Us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-800/50 py-6 bg-gray-950/50">
        <div className="max-w-7xl mx-auto px-4 text-center">
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
