'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

interface Order {
  id: string;
  user_id: string;
  product_id: string;
  stripe_payment_intent_id: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  phrase: string | null;
  profiles: {
    email: string;
    in_game_alias: string;
  };
  products: {
    name: string;
    description: string;
    price: number;
    phrase: string;
  };
}

export default function AdminOrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [phraseFilter, setPhraseFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
        fetchOrders();
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  const fetchOrders = async () => {
    try {
      setLoadingOrders(true);
      setError(null);

      console.log('🔍 Fetching orders with enhanced queries...');

      // Step 1: Get user_products data
      const { data: userProductsData, error: userProductsError } = await supabase
        .from('user_products')
        .select('*, phrase')
        .order('created_at', { ascending: false })
        .limit(100);

      if (userProductsError) {
        console.error('❌ User products query error:', userProductsError);
        throw userProductsError;
      }

      console.log('✅ User products fetched:', userProductsData?.length || 0);

      if (!userProductsData || userProductsData.length === 0) {
        setOrders([]);
        return;
      }

      // Step 2: Get all unique user IDs and product IDs
      const userIds = [...new Set(userProductsData.map(order => order.user_id))];
      const productIds = [...new Set(userProductsData.map(order => order.product_id))];

      console.log('🔍 Fetching profiles for users:', userIds.length);
      console.log('🔍 Fetching products for:', productIds.length);

      // Step 3: Fetch profiles data
      let profilesData: any[] = [];
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, in_game_alias')
          .in('id', userIds);

        if (profilesError) {
          console.error('❌ Profiles query error:', profilesError);
        } else {
          profilesData = profiles || [];
          console.log('✅ Profiles fetched:', profilesData.length);
        }
      }

      // Step 4: Fetch products data
      let productsData: any[] = [];
      if (productIds.length > 0) {
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, description, price, phrase')
          .in('id', productIds);

        if (productsError) {
          console.error('❌ Products query error:', productsError);
        } else {
          productsData = products || [];
          console.log('✅ Products fetched:', productsData.length);
        }
      }

      // Step 5: Create lookup maps
      const profilesMap = new Map(profilesData.map(p => [p.id, p]));
      const productsMap = new Map(productsData.map(p => [p.id, p]));

      // Step 6: Combine the data
      const transformedOrders = userProductsData.map(order => {
        const profile = profilesMap.get(order.user_id);
        const product = productsMap.get(order.product_id);

        return {
          ...order,
          phrase: order.phrase,
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

      console.log('✅ Orders transformed successfully:', transformedOrders.length);
      setOrders(transformedOrders);

    } catch (error: any) {
      console.error('❌ Error loading orders:', error);
      setError('Failed to load orders: ' + (error.message || 'Unknown error'));
    } finally {
      setLoadingOrders(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('user_products')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) {
        throw error;
      }

      toast.success('Order status updated successfully');
      fetchOrders(); // Refresh the list
    } catch (error: any) {
      toast.error('Error updating order status: ' + error.message);
    }
  };

  const exportOrders = () => {
    const csvContent = [
      ['Order ID', 'Date', 'Customer Email', 'In-Game Alias', 'Product', 'Custom Phrase', 'Price', 'Status', 'Payment Intent', 'Expires'].join(','),
      ...filteredOrders.map(order => [
        order.id,
        new Date(order.created_at).toLocaleDateString(),
        order.profiles.email,
        order.profiles.in_game_alias || '',
        `"${order.products.name}"`,
        order.phrase || '',
        (order.products.price / 100).toFixed(2),
        order.status,
        order.stripe_payment_intent_id || '',
        order.expires_at ? new Date(order.expires_at).toLocaleDateString() : 'Never'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Get unique products for filter
  const uniqueProducts = Array.from(new Set(orders.map(order => order.products.name)));

  // Filter and sort orders
  const filteredOrders = orders
    .filter(order => {
      const matchesSearch = 
        order.profiles.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.profiles.in_game_alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.products.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phrase?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.stripe_payment_intent_id?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesProduct = productFilter === 'all' || order.products.name === productFilter;
      const matchesPhrase = phraseFilter === 'all' || 
        (phraseFilter === 'with_phrase' && order.phrase) ||
        (phraseFilter === 'without_phrase' && !order.phrase);
      
      return matchesSearch && matchesStatus && matchesProduct && matchesPhrase;
    })
    .sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'email':
          aValue = a.profiles.email;
          bValue = b.profiles.email;
          break;
        case 'product':
          aValue = a.products.name;
          bValue = b.products.name;
          break;
        case 'phrase':
          aValue = a.phrase || '';
          bValue = b.phrase || '';
          break;
        case 'price':
          aValue = a.products.price;
          bValue = b.products.price;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const totalOrders = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.products.price, 0);
  const activeOrders = filteredOrders.filter(order => order.status === 'active').length;
  const ordersWithPhrases = filteredOrders.filter(order => order.phrase).length;

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Admin: Manage Orders</h1>
          <div className="flex space-x-2">
            <button
              onClick={exportOrders}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => fetchOrders()}
              disabled={loadingOrders}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
            >
              {loadingOrders ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-6 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            <div className="flex items-start">
              <span className="text-red-400 mr-3 mt-1">⚠️</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-300 mb-2">Error Loading Orders</h3>
                <p>{error}</p>
                <button
                  onClick={() => fetchOrders()}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Orders</h2>
            <p className="text-3xl font-bold text-white">{totalOrders.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Total Revenue</h2>
            <p className="text-3xl font-bold text-green-400">${(totalRevenue / 100).toFixed(2)}</p>
          </div>
          
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Active Orders</h2>
            <p className="text-3xl font-bold text-blue-400">{activeOrders.toLocaleString()}</p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6">
            <h2 className="text-lg text-gray-300 mb-2">Custom Phrases</h2>
            <p className="text-3xl font-bold text-purple-400">{ordersWithPhrases.toLocaleString()}</p>
            <p className="text-sm text-gray-400 mt-1">Text Visual Kill Macros</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Email, alias, product, phrase..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Product</label>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Products</option>
                {uniqueProducts.map(productName => (
                  <option key={productName} value={productName}>
                    {productName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Custom Phrase</label>
              <select
                value={phraseFilter}
                onChange={(e) => setPhraseFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Orders</option>
                <option value="with_phrase">With Custom Phrase</option>
                <option value="without_phrase">No Custom Phrase</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="created_at">Order Date</option>
                <option value="email">Customer Email</option>
                <option value="product">Product Name</option>
                <option value="phrase">Custom Phrase</option>
                <option value="price">Price</option>
                <option value="status">Status</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Order Management</h2>
          </div>
          
          {loadingOrders ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
              </div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              No orders found. Try adjusting your search filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Custom Phrase
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Order Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800/30 divide-y divide-gray-700">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-700/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-white">{order.profiles.email}</div>
                          <div className="text-sm text-gray-400">
                            {order.profiles.in_game_alias ? (
                              <span className="font-mono bg-gray-700 px-2 py-1 rounded text-cyan-300">
                                {order.profiles.in_game_alias}
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">No alias</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-white">{order.products.name}</div>
                          {order.products.phrase && (
                            <div className="text-sm text-blue-400 font-mono bg-blue-900/30 px-2 py-1 rounded">
                              Default: {order.products.phrase}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          {order.phrase ? (
                            <div className="text-center">
                              <span className="inline-block font-mono bg-gradient-to-r from-purple-600 to-blue-600 text-white px-3 py-2 rounded-lg text-lg font-bold shadow-lg">
                                💥 {order.phrase} 💥
                              </span>
                              <div className="text-xs text-gray-400 mt-1">Text Visual Kill Macro</div>
                            </div>
                          ) : (
                            <span className="text-gray-500 italic text-sm">No custom phrase</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-lg font-bold text-green-400">
                          ${(order.products.price / 100).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-semibold rounded border ${
                            order.status === 'active'
                              ? 'bg-green-900/50 text-green-300 border-green-600'
                              : order.status === 'expired'
                              ? 'bg-yellow-900/50 text-yellow-300 border-yellow-600'
                              : 'bg-red-900/50 text-red-300 border-red-600'
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="revoked">Revoked</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {order.expires_at ? (
                          <span className={
                            new Date(order.expires_at) < new Date() 
                              ? 'text-red-400' 
                              : 'text-gray-400'
                          }>
                            {new Date(order.expires_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-green-400">Never</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => navigator.clipboard.writeText(order.id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors mr-4"
                          title="Copy Order ID"
                        >
                          Copy ID
                        </button>
                        {order.stripe_payment_intent_id && (
                          <button
                            onClick={() => window.open(`https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`, '_blank')}
                            className="text-purple-400 hover:text-purple-300 transition-colors"
                            title="View in Stripe"
                          >
                            Stripe
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 