'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProducts: 0,
    totalSales: 0,
    totalDonations: 0,
    recentSales: [] as any[],
    recentDonations: [] as any[],
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // Check if user is admin
    const checkAdmin = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (error || !data || !data.is_admin) {
          router.push('/dashboard');
          toast.error('Unauthorized: Admin access required');
          return;
        }

        setIsAdmin(true);
        fetchStats();
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      setError(null);
      console.log('🔍 Starting stats fetch...');

      // Use longer timeout and better error handling
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      );

      // Simple queries without complex joins
      console.log('📊 Fetching user count...');
      const userCountPromise = supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      console.log('📦 Fetching product count...');
      const productCountPromise = supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Simple user_products query without joins
      console.log('🛒 Fetching recent sales...');
      const salesDataPromise = supabase
        .from('user_products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('💰 Fetching all sales for revenue...');
      const allSalesPromise = supabase
        .from('user_products')
        .select('*')
        .limit(100);

      // Fetch donations data
      console.log('🎁 Fetching recent donations...');
      const donationsDataPromise = supabase
        .from('donation_transactions')
        .select(`
          id,
          amount_cents,
          currency,
          donation_message,
          customer_name,
          kofi_from_name,
          created_at,
          payment_method,
          status
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('💸 Fetching all donations for total...');
      const allDonationsPromise = supabase
        .from('donation_transactions')
        .select('amount_cents')
        .eq('status', 'completed')
        .limit(100);

      // Race all promises against timeout
      const results = await Promise.allSettled([
        Promise.race([userCountPromise, timeout]),
        Promise.race([productCountPromise, timeout]),
        Promise.race([salesDataPromise, timeout]),
        Promise.race([allSalesPromise, timeout]),
        Promise.race([donationsDataPromise, timeout]),
        Promise.race([allDonationsPromise, timeout])
      ]);

      console.log('✅ Query results:', results);

      // Handle results with detailed error checking
      const [userResult, productResult, salesResult, allSalesResult, donationsResult, allDonationsResult] = results;

      let userCount = 0;
      let productCount = 0;
      let salesData: any[] = [];
      let allSales: any[] = [];
      let donationsData: any[] = [];
      let allDonations: any[] = [];

      // Process user count
      if (userResult.status === 'fulfilled') {
        const { count, error } = userResult.value as any;
        if (error) {
          console.error('❌ User count error:', error);
          if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
            throw new Error('Database tables not found. Please run the database setup first.');
          }
        } else {
          userCount = count || 0;
        }
      } else {
        console.error('❌ User count promise rejected:', userResult.reason);
      }

      // Process product count
      if (productResult.status === 'fulfilled') {
        const { count, error } = productResult.value as any;
        if (error) {
          console.error('❌ Product count error:', error);
          if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
            throw new Error('Database tables not found. Please run the database setup first.');
          }
        } else {
          productCount = count || 0;
        }
      } else {
        console.error('❌ Product count promise rejected:', productResult.reason);
      }

      // Process sales data
      if (salesResult.status === 'fulfilled') {
        const { data, error } = salesResult.value as any;
        if (error) {
          console.error('❌ Sales data error:', error);
          if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
            throw new Error('Database tables not found. Please run the database setup first.');
          }
        } else {
          salesData = data || [];
        }
      } else {
        console.error('❌ Sales data promise rejected:', salesResult.reason);
      }

      // Process all sales for total calculation
      if (allSalesResult.status === 'fulfilled') {
        const { data, error } = allSalesResult.value as any;
        if (error) {
          console.error('❌ All sales error:', error);
        } else {
          allSales = data || [];
        }
      } else {
        console.error('❌ All sales promise rejected:', allSalesResult.reason);
      }

      // Process donations data
      if (donationsResult.status === 'fulfilled') {
        const { data, error } = donationsResult.value as any;
        if (error) {
          console.error('❌ Donations data error:', error);
        } else {
          donationsData = data || [];
        }
      } else {
        console.error('❌ Donations data promise rejected:', donationsResult.reason);
      }

      // Process all donations for total calculation
      if (allDonationsResult.status === 'fulfilled') {
        const { data, error } = allDonationsResult.value as any;
        if (error) {
          console.error('❌ All donations error:', error);
        } else {
          allDonations = data || [];
        }
      } else {
        console.error('❌ All donations promise rejected:', allDonationsResult.reason);
      }

      // Calculate total sales with product prices
      let totalSalesAmount = 0;
      if (allSales.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, price');
        
        if (products) {
          const productPriceMap = new Map(products.map(p => [p.id, p.price]));
          totalSalesAmount = allSales.reduce((sum: number, sale: any) => {
            const price = productPriceMap.get(sale.product_id) || 0;
            return sum + price;
          }, 0);
        }
      }

      // Calculate total donations
      const totalDonationsAmount = allDonations.reduce((sum: number, donation: any) => {
        return sum + (donation.amount_cents || 0);
      }, 0);

      // Enhanced recent sales processing with proper data fetching
      let enhancedRecentSales: any[] = [];
      if (salesData.length > 0) {
        console.log('🔍 Enhancing recent sales with customer and product data...');
        
        // Get unique user IDs and product IDs
        const userIds = [...new Set(salesData.map(sale => sale.user_id))];
        const productIds = [...new Set(salesData.map(sale => sale.product_id))];

        // Fetch profiles data
        let profilesData: any[] = [];
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, email, in_game_alias')
            .in('id', userIds);

          if (!profilesError) {
            profilesData = profiles || [];
          }
        }

        // Fetch products data
        let productsData: any[] = [];
        if (productIds.length > 0) {
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, description, price, phrase')
            .in('id', productIds);

          if (!productsError) {
            productsData = products || [];
          }
        }

        // Create lookup maps
        const profilesMap = new Map(profilesData.map(p => [p.id, p]));
        const productsMap = new Map(productsData.map(p => [p.id, p]));

        // Combine the data
        enhancedRecentSales = salesData.map(sale => {
          const profile = profilesMap.get(sale.user_id);
          const product = productsMap.get(sale.product_id);

          return {
            ...sale,
            profiles: {
              email: profile?.email || 'Unknown User',
              in_game_alias: profile?.in_game_alias || 'No Alias'
            },
            products: {
              name: product?.name || 'Unknown Product',
              description: product?.description || '',
              price: product?.price || 0,
              phrase: product?.phrase || ''
            }
          };
        });

        console.log('✅ Recent sales enhanced successfully:', enhancedRecentSales.length);
      }

      // Format donations data
      const formattedDonations = donationsData.map(donation => ({
        id: donation.id,
        amount: donation.amount_cents / 100,
        currency: donation.currency || 'usd',
        customerName: donation.kofi_from_name || donation.customer_name || 'Anonymous',
        message: donation.donation_message || '',
        date: donation.created_at,
        paymentMethod: donation.payment_method || 'kofi'
      }));

      console.log('📈 Calculated stats:', {
        userCount,
        productCount,
        totalSalesAmount,
        totalDonationsAmount,
        enhancedRecentSalesLength: enhancedRecentSales.length,
        formattedDonationsLength: formattedDonations.length
      });

      setStats({
        totalUsers: userCount,
        totalProducts: productCount,
        totalSales: totalSalesAmount / 100, // Convert from cents to dollars
        totalDonations: totalDonationsAmount / 100, // Convert from cents to dollars
        recentSales: enhancedRecentSales,
        recentDonations: formattedDonations,
      });

      console.log('✅ Stats loaded successfully');
    } catch (error: any) {
      console.error('❌ Stats fetch error:', error);
      const errorMessage = error.message || 'Unknown error';
      
      // Provide specific error messages for common issues
      if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        setError('Database tables not found. Please run the database setup first.');
      } else if (errorMessage.includes('relationship')) {
        setError('Database relationships not configured. Please run the database setup first.');
      } else if (errorMessage.includes('not-configured') || errorMessage.includes('your-project.supabase.co')) {
        setError('Environment variables not configured properly. Please check your .env.local file.');
      } else {
        setError(`Failed to load stats: ${errorMessage}`);
      }
      
      // Set default values to prevent UI issues
      setStats({
        totalUsers: 0,
        totalProducts: 0,
        totalSales: 0,
        totalDonations: 0,
        recentSales: [],
        recentDonations: [],
      });
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          <div className="text-sm text-gray-300">
            Welcome back, {user?.email || 'Admin'}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-6 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            <div className="flex items-start">
              <span className="text-red-400 mr-3 mt-1">⚠️</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-300 mb-2">Error Loading Dashboard Data</h3>
                <p className="mb-3">{error}</p>
                
                {error.includes('not-configured') || error.includes('your-project.supabase.co') ? (
                  <div className="bg-red-800/30 border border-red-600 rounded p-4 mt-4">
                    <h4 className="font-semibold text-red-200 mb-2">🔧 Environment Setup Required</h4>
                    <p className="text-sm text-red-200 mb-3">
                      It looks like your environment variables aren't configured yet. Here's how to fix this:
                    </p>
                    
                    <div className="space-y-2 text-sm">
                      <p className="text-red-200">
                        <strong>For Local Development:</strong>
                      </p>
                      <ol className="list-decimal list-inside text-red-200 space-y-1 ml-2">
                        <li>Run <code className="bg-red-700 px-1 rounded">./setup-env.ps1</code> to create environment template</li>
                        <li>Edit <code className="bg-red-700 px-1 rounded">.env.local</code> with your Supabase credentials</li>
                        <li>Get credentials from <a href="https://app.supabase.com" target="_blank" className="underline">app.supabase.com</a></li>
                        <li>Restart the development server</li>
                      </ol>
                      
                      <p className="text-red-200 mt-3">
                        <strong>For Production:</strong>
                      </p>
                      <p className="text-red-200 ml-2">
                        Set environment variables in your hosting platform (Vercel, Netlify, etc.)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-800/30 border border-red-600 rounded p-4 mt-4">
                    <h4 className="font-semibold text-red-200 mb-2">🔍 Troubleshooting</h4>
                    <div className="space-y-2 text-sm text-red-200">
                      <p>• Check your Supabase connection and database setup</p>
                      <p>• Verify your Row Level Security (RLS) policies</p>
                      <p>• Ensure admin access is granted to your account</p>
                      <p>• Check the browser console for detailed error logs</p>
                    </div>
                  </div>
                )}
                
                <div className="flex space-x-2 mt-4">
                  <button
                    onClick={() => fetchStats()}
                    disabled={loadingStats}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors disabled:opacity-50"
                  >
                    {loadingStats ? 'Retrying...' : 'Retry Loading'}
                  </button>
                  
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Users</h2>
            <p className="text-3xl font-bold text-white">
              {loadingStats ? (
                <span className="animate-pulse">...</span>
              ) : (
                stats.totalUsers.toLocaleString()
              )}
            </p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Donations</h2>
            <p className="text-3xl font-bold text-yellow-400">
              {loadingStats ? (
                <span className="animate-pulse">...</span>
              ) : (
                `$${stats.totalDonations.toFixed(2)}`
              )}
            </p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Orders</h2>
            <p className="text-3xl font-bold text-green-400">
              {loadingStats ? (
                <span className="animate-pulse">...</span>
              ) : (
                `$${stats.totalSales.toFixed(2)}`
              )}
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Combined Total</h2>
            <p className="text-3xl font-bold text-blue-400">
              {loadingStats ? (
                <span className="animate-pulse">...</span>
              ) : (
                `$${(stats.totalDonations + stats.totalSales).toFixed(2)}`
              )}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Donations - Left Side */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-semibold text-white">Recent Donations</h2>
                </div>
                
                {loadingStats ? (
                  <div className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-10 bg-gray-700 rounded"></div>
                      <div className="h-10 bg-gray-700 rounded"></div>
                      <div className="h-10 bg-gray-700 rounded"></div>
                    </div>
                  </div>
                ) : stats.recentDonations.length > 0 ? (
                  <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                    {stats.recentDonations.map((donation: any, index: number) => (
                      <div key={donation.id || index} className="bg-gray-700/30 rounded-lg p-3 border border-gray-600">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-white text-sm truncate pr-2">
                            {donation.customerName}
                          </div>
                          <div className="text-yellow-400 font-bold text-sm flex-shrink-0">
                            ${donation.amount.toFixed(2)}
                          </div>
                        </div>
                        {donation.message && (
                          <div className="text-gray-300 text-xs mb-2 italic line-clamp-2">
                            "{donation.message}"
                          </div>
                        )}
                        <div className="flex justify-between items-center text-xs text-gray-400">
                          <span className="truncate pr-2">{donation.paymentMethod}</span>
                          <span className="flex-shrink-0">{new Date(donation.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-400">
                    No donations found.
                  </div>
                )}
              </div>

              {/* Recent Orders - Right Side */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-semibold text-white">Recent Orders</h2>
                </div>
                
                {loadingStats ? (
                  <div className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-10 bg-gray-700 rounded"></div>
                      <div className="h-10 bg-gray-700 rounded"></div>
                      <div className="h-10 bg-gray-700 rounded"></div>
                    </div>
                  </div>
                ) : stats.recentSales.length > 0 ? (
                  <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                    {stats.recentSales.map((sale: any) => (
                      <div key={sale.id} className="bg-gray-700/30 rounded-lg p-3 border border-gray-600">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-white text-sm truncate pr-2">
                            {sale.profiles?.in_game_alias || 'Unknown'}
                          </div>
                          <div className="text-green-400 font-bold text-sm flex-shrink-0">
                            ${(sale.products?.price / 100).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-gray-300 text-xs mb-2 truncate">
                          {sale.products?.name}
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-400">
                          <span className="truncate pr-2">{sale.profiles?.email}</span>
                          <span className="flex-shrink-0">{new Date(sale.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-400">
                    No orders found.
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-2xl">🛠️</span>
              Admin Tools
            </h2>
            
            <div className="grid grid-cols-1 gap-3">
              <Link
                href="/admin/perks"
                className="flex items-center gap-4 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
              >
                <span className="text-3xl">🛍️</span>
                <div>
                  <div className="font-semibold">Manage Perks</div>
                  <div className="text-xs text-blue-400">Products & pricing</div>
                </div>
              </Link>
              
              <Link
                href="/admin/users"
                className="flex items-center gap-4 px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
              >
                <span className="text-3xl">👥</span>
                <div>
                  <div className="font-semibold">Manage Users</div>
                  <div className="text-xs text-purple-400">User accounts & roles</div>
                </div>
              </Link>
              
              <Link
                href="/admin/orders"
                className="flex items-center gap-4 px-4 py-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
              >
                <span className="text-3xl">📦</span>
                <div>
                  <div className="font-semibold">View Orders</div>
                  <div className="text-xs text-green-400">Purchase history</div>
                </div>
              </Link>

              <Link
                href="/admin/donations"
                className="flex items-center gap-4 px-4 py-3 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-yellow-500/20"
              >
                <span className="text-3xl">💰</span>
                <div>
                  <div className="font-semibold">View Donations</div>
                  <div className="text-xs text-yellow-400">Community support</div>
                </div>
              </Link>

              <Link
                href="/admin/financials"
                className="flex items-center gap-4 px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20"
              >
                <span className="text-3xl">📈</span>
                <div>
                  <div className="font-semibold">Financial Dashboard</div>
                  <div className="text-xs text-emerald-400">Revenue vs expenses tracking</div>
                </div>
              </Link>

              <Link
                href="/admin/videos"
                className="flex items-center gap-4 px-4 py-3 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <span className="text-3xl">🎬</span>
                <div>
                  <div className="font-semibold">Manage Videos</div>
                  <div className="text-xs text-cyan-400">Featured content</div>
                </div>
              </Link>

              <Link
                href="/admin/squads"
                className="flex items-center gap-4 px-4 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/20"
              >
                <span className="text-3xl">⚔️</span>
                <div>
                  <div className="font-semibold">Manage Squads</div>
                  <div className="text-xs text-indigo-400">Squad status & settings</div>
                </div>
              </Link>

              <Link
                href="/admin/news"
                className="flex items-center gap-4 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-red-500/20"
              >
                <span className="text-3xl">📰</span>
                <div>
                  <div className="font-semibold">Manage News</div>
                  <div className="text-xs text-red-400">Posts & announcements</div>
                </div>
              </Link>

              <Link
                href="/admin/zones"
                className="flex items-center gap-4 px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-orange-500/20"
              >
                <span className="text-3xl">🖥️</span>
                <div>
                  <div className="font-semibold">Zone Control</div>
                  <div className="text-xs text-orange-400">Start/stop Infantry zones</div>
                </div>
              </Link>

              <Link
                href="/admin/ratings"
                className="flex items-center gap-4 px-4 py-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 text-pink-300 rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-pink-500/20"
              >
                <span className="text-3xl">📊</span>
                <div>
                  <div className="font-semibold">Squad Ratings</div>
                  <div className="text-xs text-pink-400">Manage squad analysis</div>
                </div>
              </Link>
            </div>
            
            <div className="mt-6">
              <h3 className="text-md font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span>
                Quick Actions
              </h3>
              
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => router.push('/admin/perks?new=true')}
                  className="flex items-center gap-3 w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all text-left"
                >
                  <span className="text-xl">➕</span>
                  Add New Perk
                </button>

                <button
                  onClick={() => fetchStats()}
                  disabled={loadingStats}
                  className="flex items-center gap-3 w-full px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-lg transition-colors text-left disabled:opacity-50"
                >
                  <span className="text-xl">🔄</span>
                  {loadingStats ? 'Refreshing...' : 'Refresh Stats'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 