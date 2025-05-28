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
    recentSales: [],
  });
  const [loadingStats, setLoadingStats] = useState(true);

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

      // Get total users
      const { count: userCount, error: userError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get total products
      const { count: productCount, error: productError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Get sales data
      const { data: salesData, error: salesError } = await supabase
        .from('user_products')
        .select('*, profiles(email, in_game_alias), products(name, price)')
        .order('created_at', { ascending: false })
        .limit(5);

      // Calculate total sales
      const { data: allSales, error: allSalesError } = await supabase
        .from('user_products')
        .select('products(price)');

      if (userError || productError || salesError || allSalesError) {
        throw new Error('Error fetching stats');
      }

      // Calculate total sales amount
      const totalSalesAmount = allSales?.reduce((sum, sale) => {
        return sum + (sale.products?.price || 0);
      }, 0) || 0;

      setStats({
        totalUsers: userCount || 0,
        totalProducts: productCount || 0,
        totalSales: totalSalesAmount / 100, // Convert from cents to dollars
        recentSales: salesData || [],
      });
    } catch (error: any) {
      toast.error('Error loading stats: ' + error.message);
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
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg text-gray-500 mb-2">Total Users</h2>
            <p className="text-3xl font-bold">{loadingStats ? '...' : stats.totalUsers}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg text-gray-500 mb-2">Total Products</h2>
            <p className="text-3xl font-bold">{loadingStats ? '...' : stats.totalProducts}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg text-gray-500 mb-2">Total Sales</h2>
            <p className="text-3xl font-bold">
              {loadingStats ? '...' : `$${stats.totalSales.toFixed(2)}`}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Recent Purchases</h2>
              </div>
              
              {loadingStats ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ) : stats.recentSales.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stats.recentSales.map((sale: any) => (
                        <tr key={sale.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">
                              {sale.profiles?.in_game_alias || 'Unknown'}
                            </div>
                            <div className="text-sm text-gray-500">{sale.profiles?.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{sale.products?.name}</div>
                            {sale.products?.price && (
                              <div className="text-sm text-gray-500">
                                ${(sale.products.price / 100).toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(sale.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  No sales data found.
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Admin Tools</h2>
            
            <nav className="space-y-2">
              <Link
                href="/admin/perks"
                className="block px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
              >
                Manage Perks
              </Link>
              
              <Link
                href="/admin/users"
                className="block px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
              >
                Manage Users
              </Link>
              
              <Link
                href="/admin/orders"
                className="block px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
              >
                View Orders
              </Link>
            </nav>
            
            <div className="mt-6">
              <h3 className="text-md font-medium mb-2">Quick Actions</h3>
              
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/admin/perks?new=true')}
                  className="w-full px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-left"
                >
                  Add New Perk
                </button>
                
                <button
                  onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-left"
                >
                  Open Stripe Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 