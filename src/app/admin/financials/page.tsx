'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  BarChart3, 
  Calendar,
  Plus,
  Server,
  Globe,
  Brain,
  Zap
} from 'lucide-react';
import type { Expense, ExpenseCategory, FinancialOverview } from '@/types/database';

const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  'website_hosting': <Globe className="w-4 h-4" />,
  'server_hosting': <Server className="w-4 h-4" />,
  'ai_development_subscription': <Brain className="w-4 h-4" />,
  'ai_development_usage': <Zap className="w-4 h-4" />,
  'other': <DollarSign className="w-4 h-4" />
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'website_hosting': 'text-blue-400 bg-blue-500/20',
  'server_hosting': 'text-green-400 bg-green-500/20',
  'ai_development_subscription': 'text-purple-400 bg-purple-500/20',
  'ai_development_usage': 'text-yellow-400 bg-yellow-500/20',
  'other': 'text-gray-400 bg-gray-500/20'
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  'website_hosting': 'Website Hosting',
  'server_hosting': 'Server Hosting',
  'ai_development_subscription': 'AI Development (Subscription)',
  'ai_development_usage': 'AI Development (Usage)',
  'other': 'Other'
};

export default function FinancialDashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<FinancialOverview[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentDonations, setRecentDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('12'); // months
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [chartRange, setChartRange] = useState(6); // Number of months to show
  const [chartSize, setChartSize] = useState('medium'); // Chart size option
  const [showDetails, setShowDetails] = useState(false); // Show donation/order breakdown

  // Add expense form state
  const [newExpense, setNewExpense] = useState({
    category: 'other' as ExpenseCategory,
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    provider: '',
    is_recurring: false,
    recurring_period: '',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      fetchFinancialData();
    }
  }, [user, dateRange]);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('No authentication token');
      }

      // Calculate date range
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(dateRange));
      const startDateStr = startDate.toISOString().split('T')[0];

      // Fetch financial overview
      const overviewResponse = await fetch(
        `/api/admin/financial-overview?start_date=${startDateStr}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!overviewResponse.ok) {
        throw new Error('Failed to fetch financial overview');
      }

      const overviewData = await overviewResponse.json();
      setOverview(overviewData.overview || []);
      setTotals(overviewData.totals || {});

      // Fetch expenses
      const expensesResponse = await fetch(
        `/api/admin/expenses?start_date=${startDateStr}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!expensesResponse.ok) {
        throw new Error('Failed to fetch expenses');
      }

      const expensesData = await expensesResponse.json();
      setExpenses(expensesData.expenses || []);

      // Fetch recent orders (similar to admin page)
      await fetchRecentOrdersAndDonations(token);

    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentOrdersAndDonations = async (token: string) => {
    try {
      // Fetch recent sales/orders
      const { data: salesData, error: salesError } = await supabase
        .from('user_products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (salesError) {
        console.error('Error fetching recent orders:', salesError);
      } else {
        // Enhanced recent sales processing with proper data fetching (same as admin page)
        let enhancedRecentSales: any[] = [];
        if (salesData && salesData.length > 0) {
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
        }
        setRecentOrders(enhancedRecentSales);
      }

      // Fetch recent donations
      const { data: donationsData, error: donationsError } = await supabase
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

      if (donationsError) {
        console.error('Error fetching recent donations:', donationsError);
      } else {
        // Format donations data
        const formattedDonations = (donationsData || []).map(donation => ({
          id: donation.id,
          amount: donation.amount_cents / 100,
          currency: donation.currency || 'usd',
          customerName: donation.kofi_from_name || donation.customer_name || 'Anonymous',
          message: donation.donation_message || '',
          date: donation.created_at,
          paymentMethod: donation.payment_method || 'kofi'
        }));
        setRecentDonations(formattedDonations);
      }

    } catch (err: any) {
      console.error('Error fetching recent orders and donations:', err);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newExpense,
          amount: parseFloat(newExpense.amount),
          recurring_period: newExpense.is_recurring ? newExpense.recurring_period : null
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add expense');
      }

      // Reset form and refresh data
      setNewExpense({
        category: 'other',
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        provider: '',
        is_recurring: false,
        recurring_period: '',
        notes: ''
      });
      setShowAddExpense(false);
      fetchFinancialData();

    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const filteredOverview = selectedPeriod === 'all' 
    ? overview 
    : overview.filter(item => item.period === selectedPeriod);

  const chartData = filteredOverview
    .slice(chartRange === 0 ? 0 : -chartRange) // Show selected range or all
    .map(item => ({
      period: item.period,
      revenue: item.total_revenue,
      expenses: item.total_expenses,
      profit: item.net_profit
    }));

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-400 mb-6">You need to be logged in to access the financial dashboard.</p>
          <Link href="/auth/login" className="text-cyan-400 hover:text-cyan-300">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-20 bg-gray-700 rounded mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-700 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-700 rounded mb-8"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-2">
                Financial Dashboard
              </h1>
              <p className="text-xl text-gray-300">
                Track revenue vs expenses with detailed insights
              </p>
            </div>
            
            <div className="flex items-center space-x-4 mt-4 lg:mt-0">
              {/* Date Range Filter */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="3">Last 3 months</option>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </select>
              
              {/* Add Expense Button */}
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Expense</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8">
            <div className="text-red-400">{error}</div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Revenue */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <span className="text-sm text-gray-400">Total Revenue</span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(totals.total_revenue || 0)}
            </div>
            <div className="text-sm text-gray-400">
              Donations: {formatCurrency(totals.total_donations || 0)}
            </div>
            <div className="text-sm text-gray-400">
              Orders: {formatCurrency(totals.total_orders || 0)}
            </div>
          </div>

          {/* Total Expenses */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <TrendingDown className="w-6 h-6 text-red-400" />
              </div>
              <span className="text-sm text-gray-400">Total Expenses</span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(totals.total_expenses || 0)}
            </div>
            <div className="text-sm text-gray-400">
              Across all categories
            </div>
          </div>

          {/* Fund Surplus */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${(totals.net_profit || 0) >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <DollarSign className={`w-6 h-6 ${(totals.net_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              </div>
              <span className="text-sm text-gray-400">Fund Surplus</span>
            </div>
            <div className={`text-2xl font-bold mb-1 ${(totals.net_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(totals.net_profit || 0)}
            </div>
            <div className="text-sm text-gray-400">
              {(totals.profit_margin || 0).toFixed(1)}% of donations
            </div>
          </div>

          {/* Avg Monthly */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-sm text-gray-400">Avg Monthly</span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency((totals.net_profit || 0) / Math.max(overview.length, 1))}
            </div>
            <div className="text-sm text-gray-400">
              Over {overview.length} months
            </div>
          </div>
        </div>

        {/* Monthly Overview Chart */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Monthly Overview</h3>
            
            {/* Chart Configuration Options */}
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-400">Range:</label>
                <select 
                  value={chartRange}
                  onChange={(e) => setChartRange(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-cyan-500 focus:outline-none"
                >
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                  <option value={0}>All Time</option>
                </select>
              </div>
              
              {/* Chart Size Selector */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-400">Size:</label>
                <select 
                  value={chartSize}
                  onChange={(e) => setChartSize(e.target.value)}
                  className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              
              {/* Show Details Toggle */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-400">Details:</label>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    showDetails 
                      ? 'bg-cyan-500 text-white' 
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {showDetails ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
          
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-4">📊</div>
              <div>No financial data available for the selected period</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-full">
                {/* Chart Container */}
                <div className="relative bg-gray-900/30 rounded-lg p-8">
                  {/* Y-Axis Labels */}
                  {(() => {
                    // Fixed scale from $0 to $1000
                    const maxValue = 1000;
                    // Dynamic chart height based on size setting
                    const chartHeights = { small: 200, medium: 320, large: 400 }; // Doubled from original
                    const chartHeight = chartHeights[chartSize as keyof typeof chartHeights];
                    const stepSize = 200; // $200 increments for clean scale
                    const steps = 5; // 5 steps: $0, $200, $400, $600, $800, $1000
                    
                    return (
                      <div className="flex">
                        {/* Y-Axis */}
                        <div className="flex flex-col justify-between w-20 mr-4" style={{ height: `${chartHeight}px` }}>
                          {Array.from({ length: steps + 1 }, (_, i) => {
                            const value = (steps - i) * stepSize;
                            return (
                              <div key={i} className="text-xs text-gray-400 text-right leading-none">
                                ${value.toLocaleString()}
                              </div>
                            );
                          })}
                        </div>

                        {/* Chart Area */}
                        <div className="flex-1 relative">
                          {/* Grid Lines */}
                          <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: steps + 1 }, (_, i) => (
                              <div key={i} className="border-t border-gray-700/30 w-full" />
                            ))}
                          </div>

                          {/* Bars */}
                          <div className={`relative flex items-end justify-center px-4 ${chartRange >= 12 ? 'space-x-4' : 'space-x-8'}`} style={{ height: `${chartHeight}px` }}>
                            {chartData.map((item, index) => {
                              // Get individual revenue components
                              const monthData = filteredOverview.find(m => m.period === item.period);
                              const donations = monthData?.total_donations || 0;
                              const orders = monthData?.total_orders || 0;
                              
                              // Calculate bar heights as actual pixels based on $1000 max scale
                              // No minimum height - if value is 0, height will be 0 (invisible)
                              const revenueHeight = Math.min((item.revenue / maxValue) * chartHeight, chartHeight);
                              const expenseHeight = Math.min((item.expenses / maxValue) * chartHeight, chartHeight);
                              
                              return (
                                <div key={index} className="flex flex-col items-center group">
                                  {/* Bars Group - Only bars, no surplus/deficit here */}
                                  <div className={`flex items-end space-x-1 ${chartRange >= 12 ? 'space-x-1' : 'space-x-2'}`} style={{ height: `${chartHeight}px` }}>
                                    {/* Revenue Bar - Only show if value > 0 */}
                                    {item.revenue > 0 && (
                                      <div className={`relative flex flex-col justify-end ${chartRange >= 12 ? 'w-12' : 'w-16'}`}>
                                        <div 
                                          className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t-lg shadow-lg transition-all duration-500 group-hover:shadow-green-500/20 flex flex-col justify-end items-center"
                                          style={{ height: `${revenueHeight}px` }}
                                        >
                                          <div className="text-white text-xs font-bold p-2 text-center">
                                            <div className="bg-black/20 rounded px-1">
                                              ${item.revenue.toLocaleString()}
                                            </div>
                                            {showDetails && (donations > 0 || orders > 0) && (
                                              <div className="text-xs opacity-75 mt-1">
                                                {donations > 0 && <div>D: ${donations.toLocaleString()}</div>}
                                                {orders > 0 && <div>O: ${orders.toLocaleString()}</div>}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Expenses Bar - Only show if value > 0 */}
                                    {item.expenses > 0 && (
                                      <div className={`relative flex flex-col justify-end ${chartRange >= 12 ? 'w-12' : 'w-16'}`}>
                                        <div 
                                          className="w-full bg-gradient-to-t from-red-600 to-red-400 rounded-t-lg shadow-lg transition-all duration-500 group-hover:shadow-red-500/20 flex flex-col justify-end items-center"
                                          style={{ height: `${expenseHeight}px` }}
                                        >
                                          <div className="text-white text-xs font-bold p-2 text-center">
                                            <div className="bg-black/20 rounded px-1">
                                              ${item.expenses.toLocaleString()}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Month Label - Just below the bars */}
                                  <div className="text-sm font-medium text-gray-300 text-center mt-2">
                                    {item.period.split('-')[1]}/{item.period.split('-')[0].slice(-2)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Surplus/Deficit Analysis - Completely separate from chart */}
                <div className="mt-8 bg-gray-800/30 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-white mb-4 text-center">Monthly Fund Analysis</h4>
                  <div className={`flex items-center justify-center flex-wrap gap-y-4 ${chartRange >= 12 ? 'space-x-3' : 'space-x-6'}`}>
                    {chartData.map((item, index) => (
                      <div key={index} className="flex flex-col items-center space-y-2">
                        {/* Surplus/Deficit Badge */}
                        <div className={`${chartRange >= 12 ? 'px-3 py-2' : 'px-4 py-3'} rounded-xl text-sm font-bold border-2 shadow-lg transition-all duration-300 hover:scale-105 ${
                          item.profit >= 0 
                            ? 'bg-blue-900/50 border-blue-400 text-blue-100 shadow-blue-500/30 hover:shadow-blue-500/50' 
                            : 'bg-orange-900/50 border-orange-400 text-orange-100 shadow-orange-500/30 hover:shadow-orange-500/50'
                        }`}>
                          <div className="text-center">
                            <div className="text-xs opacity-75 mb-1 uppercase tracking-wide">
                              {item.profit >= 0 ? 'Surplus' : 'Deficit'}
                            </div>
                            <div className="font-bold text-lg">
                              {item.profit >= 0 ? '+' : '-'}${Math.abs(item.profit).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        
                        {/* Month Label */}
                        <div className="text-sm font-medium text-gray-400 text-center">
                          {new Date(item.period + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Simplified Legend */}
                <div className="flex justify-center space-x-6 mt-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gradient-to-t from-green-600 to-green-400 rounded"></div>
                    <span className="text-gray-300">Donations</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gradient-to-t from-red-600 to-red-400 rounded"></div>
                    <span className="text-gray-300">Expenses</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-emerald-500 rounded-full"></div>
                    <span className="text-gray-300">Surplus</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-rose-500 rounded-full"></div>
                    <span className="text-gray-300">Deficit</span>
                  </div>
                </div>
                

              </div>
            </div>
          )}
        </div>

        {/* Recent Orders & Donations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Recent Donations */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <DollarSign className="w-6 h-6 text-yellow-400 mr-2" />
              Recent Donations
            </h3>
            {loading ? (
              <div className="space-y-3">
                <div className="animate-pulse">
                  <div className="h-16 bg-gray-700 rounded"></div>
                  <div className="h-16 bg-gray-700 rounded mt-3"></div>
                  <div className="h-16 bg-gray-700 rounded mt-3"></div>
                </div>
              </div>
            ) : recentDonations.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {recentDonations.map((donation: any, index: number) => (
                  <div key={donation.id || index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-600">
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
              <div className="text-center text-gray-400 py-8">
                No donations found.
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <BarChart3 className="w-6 h-6 text-green-400 mr-2" />
              Recent Orders
            </h3>
            {loading ? (
              <div className="space-y-3">
                <div className="animate-pulse">
                  <div className="h-16 bg-gray-700 rounded"></div>
                  <div className="h-16 bg-gray-700 rounded mt-3"></div>
                  <div className="h-16 bg-gray-700 rounded mt-3"></div>
                </div>
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {recentOrders.map((order: any) => (
                  <div key={order.id} className="bg-gray-900/50 rounded-lg p-3 border border-gray-600">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-white text-sm truncate pr-2">
                        {order.profiles?.in_game_alias || 'Unknown'}
                      </div>
                      <div className="text-green-400 font-bold text-sm flex-shrink-0">
                        ${(order.products?.price / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-gray-300 text-xs mb-2 truncate">
                      {order.products?.name}
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <span className="truncate pr-2">{order.profiles?.email}</span>
                      <span className="flex-shrink-0">{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                No orders found.
              </div>
            )}
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Expense Categories */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-6">Expense Categories</h3>
            <div className="space-y-4">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                const categoryExpenses = expenses.filter(e => e.category === category);
                const total = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
                const percentage = totals.total_expenses > 0 ? (total / totals.total_expenses) * 100 : 0;
                
                return (
                  <div key={category} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${CATEGORY_COLORS[category as ExpenseCategory]}`}>
                        {CATEGORY_ICONS[category as ExpenseCategory]}
                      </div>
                      <div>
                        <div className="font-medium text-white">{label}</div>
                        <div className="text-sm text-gray-400">{categoryExpenses.length} expenses</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">{formatCurrency(total)}</div>
                      <div className="text-sm text-gray-400">{percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-6">Recent Expenses</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {expenses.slice(0, 10).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${CATEGORY_COLORS[expense.category]}`}>
                      {CATEGORY_ICONS[expense.category]}
                    </div>
                    <div>
                      <div className="font-medium text-white">{expense.description}</div>
                      <div className="text-sm text-gray-400">
                        {new Date(expense.expense_date).toLocaleDateString()}
                        {expense.provider && ` • ${expense.provider}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{formatCurrency(expense.amount)}</div>
                    {expense.is_recurring && (
                      <div className="text-xs text-blue-400">Recurring</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Expense Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-white mb-6">Add New Expense</h3>
              
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value as ExpenseCategory})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <input
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={newExpense.expense_date}
                    onChange={(e) => setNewExpense({...newExpense, expense_date: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
                  <input
                    type="text"
                    value={newExpense.provider}
                    onChange={(e) => setNewExpense({...newExpense, provider: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    checked={newExpense.is_recurring}
                    onChange={(e) => setNewExpense({...newExpense, is_recurring: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="is_recurring" className="text-sm text-gray-300">Recurring expense</label>
                </div>

                {newExpense.is_recurring && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Recurring Period</label>
                    <select
                      value={newExpense.recurring_period}
                      onChange={(e) => setNewExpense({...newExpense, recurring_period: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select period</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                  <textarea
                    value={newExpense.notes}
                    onChange={(e) => setNewExpense({...newExpense, notes: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddExpense(false)}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-semibold transition-all duration-300"
                  >
                    Add Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
