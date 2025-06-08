'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface DonationTransaction {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  customer_email: string;
  customer_name: string;
  donation_message: string;
  created_at: string;
  completed_at: string;
  payment_method?: string;
  kofi_transaction_id?: string;
  kofi_message?: string;
  kofi_from_name?: string;
  kofi_email?: string;
  kofi_url?: string;
  user_profiles?: {
    in_game_alias: string;
  };
  square_payment_id?: string;
}

export default function AdminDonations() {
  const { user, loading } = useAuth();
  const [donations, setDonations] = useState<DonationTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      return;
    }

    const fetchDonations = async () => {
      try {
        // Get the current session to get the access token
        const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
        
        if (!session?.access_token) {
          throw new Error('No valid session');
        }

        const response = await fetch('/api/admin/donations', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 403) {
            setError('Admin access required');
          } else {
            throw new Error('Failed to fetch donations');
          }
          return;
        }

        const data = await response.json();
        setDonations(data);
        setIsAdmin(true);
      } catch (err) {
        console.error('Error fetching donations:', err);
        setError('Failed to load donations');
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchDonations();
    }
  }, [user, loading]);

  const formatCurrency = (cents: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const exportDonations = () => {
    const csvContent = [
      ['Date', 'Amount', 'Status', 'Payment Method', 'Email', 'Name', 'In-Game Alias', 'Message', 'Transaction ID', 'Ko-fi ID'].join(','),
      ...filteredDonations.map(donation => [
        formatDate(donation.completed_at || donation.created_at),
        formatCurrency(donation.amount_cents, donation.currency),
        donation.status,
        donation.payment_method || 'kofi',
        donation.customer_email,
        donation.customer_name || '',
        donation.user_profiles?.in_game_alias || '',
        `"${donation.donation_message || ''}"`,
        donation.id,
        donation.kofi_transaction_id || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donations_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Filter and sort donations
  const filteredDonations = donations
    .filter(donation => {
      const matchesSearch = 
        (donation.customer_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (donation.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (donation.user_profiles?.in_game_alias || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (donation.donation_message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (donation.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (donation.kofi_transaction_id || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || donation.status === statusFilter;
      const matchesPaymentMethod = paymentMethodFilter === 'all' || 
        (donation.payment_method || 'kofi') === paymentMethodFilter;
      
      return matchesSearch && matchesStatus && matchesPaymentMethod;
    })
    .sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'amount':
          aValue = a.amount_cents || 0;
          bValue = b.amount_cents || 0;
          break;
        case 'email':
          aValue = a.customer_email || '';
          bValue = b.customer_email || '';
          break;
        case 'alias':
          aValue = a.user_profiles?.in_game_alias || '';
          bValue = b.user_profiles?.in_game_alias || '';
          break;
        default:
          aValue = a.created_at || '';
          bValue = b.created_at || '';
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const totalAmount = filteredDonations.reduce((sum, donation) => sum + donation.amount_cents, 0);
  const totalCount = filteredDonations.length;
  
  // Calculate stats by payment method
  const kofiDonations = filteredDonations.filter(d => d.payment_method === 'kofi');
  const stripeDonations = filteredDonations.filter(d => d.payment_method === 'stripe');
  const squareDonations = filteredDonations.filter(d => d.payment_method === 'square');
  const kofiAmount = kofiDonations.reduce((sum, donation) => sum + donation.amount_cents, 0);
  const stripeAmount = stripeDonations.reduce((sum, donation) => sum + donation.amount_cents, 0);
  const squareAmount = squareDonations.reduce((sum, donation) => sum + donation.amount_cents, 0);

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-2xl mx-auto bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
            <p className="text-gray-300 mb-6">You need admin privileges to access this page.</p>
            <Link 
              href="/" 
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Return Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-2xl mx-auto bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">Error</h1>
            <p className="text-gray-300 mb-6">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-[95vw] mx-auto">
          {/* Header */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-cyan-400 tracking-wider">💰 DONATION MANAGEMENT</h1>
              <button
                onClick={exportDonations}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{totalCount}</div>
                <div className="text-gray-400 text-sm">Total Donations</div>
              </div>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{formatCurrency(totalAmount)}</div>
                <div className="text-gray-400 text-sm">Total Amount</div>
              </div>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{formatCurrency(totalAmount / Math.max(totalCount, 1))}</div>
                <div className="text-gray-400 text-sm">Average Donation</div>
              </div>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-400">{formatCurrency(kofiAmount)} ({kofiDonations.length})</div>
                <div className="text-gray-400 text-sm">☕ Ko-fi</div>
              </div>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{formatCurrency(squareAmount)} ({squareDonations.length})</div>
                <div className="text-gray-400 text-sm">🟦 Square</div>
              </div>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-indigo-400">{formatCurrency(stripeAmount)} ({stripeDonations.length})</div>
                <div className="text-gray-400 text-sm">💳 Stripe (Legacy)</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Email, name, alias, message..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Payment Method</label>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="all">All Methods</option>
                  <option value="kofi">☕ Ko-fi</option>
                  <option value="square">🟦 Square</option>
                  <option value="stripe">💳 Stripe (Legacy)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="created_at">Date</option>
                  <option value="amount">Amount</option>
                  <option value="email">Email</option>
                  <option value="alias">In-Game Alias</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
          </div>

          {/* Donations Table */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-gray-700/50 border-b border-cyan-500/30">
                  <tr>
                    <th className="w-48 px-4 py-3 text-left text-cyan-400 font-medium">Date</th>
                    <th className="w-20 px-4 py-3 text-left text-cyan-400 font-medium">Amount</th>
                    <th className="w-24 px-4 py-3 text-center text-cyan-400 font-medium">Method</th>
                    <th className="w-28 px-4 py-3 text-center text-cyan-400 font-medium">Status</th>
                    <th className="w-56 px-4 py-3 text-left text-cyan-400 font-medium">Email</th>
                    <th className="w-32 px-4 py-3 text-left text-cyan-400 font-medium">Alias</th>
                    <th className="flex-1 px-4 py-3 text-left text-cyan-400 font-medium">Message</th>
                    <th className="w-96 px-4 py-3 text-left text-cyan-400 font-medium">Transaction ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDonations.map((donation, index) => (
                    <tr key={donation.id} className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${index % 2 === 0 ? 'bg-gray-800/30' : 'bg-gray-900/30'}`}>
                      <td className="w-48 px-4 py-3 text-gray-300 text-sm truncate">
                        {formatDate(donation.completed_at || donation.created_at)}
                      </td>
                      <td className="w-20 px-4 py-3 text-green-400 font-bold text-sm">
                        {formatCurrency(donation.amount_cents, donation.currency)}
                      </td>
                      <td className="w-24 px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          (donation.payment_method || 'kofi') === 'kofi' 
                            ? 'bg-red-900/50 text-red-400 border border-red-500/30' 
                            : (donation.payment_method || 'kofi') === 'square'
                            ? 'bg-blue-900/50 text-blue-400 border border-blue-500/30'
                            : 'bg-indigo-900/50 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {(donation.payment_method || 'kofi') === 'kofi' ? '☕ KO-FI' : 
                           '💳 STRIPE'}
                        </span>
                      </td>
                      <td className="w-28 px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          donation.status === 'completed' ? 'bg-green-900/50 text-green-400 border border-green-500/30' :
                          donation.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-500/30' :
                          'bg-red-900/50 text-red-400 border border-red-500/30'
                        }`}>
                          {(donation.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td className="w-56 px-4 py-3 text-gray-300 text-sm truncate">
                        {donation.customer_email}
                      </td>
                      <td className="w-32 px-4 py-3 text-cyan-400 font-mono text-sm truncate">
                        {donation.user_profiles?.in_game_alias || 'N/A'}
                      </td>
                      <td className="flex-1 px-4 py-3 text-gray-300 text-sm">
                        {donation.donation_message ? (
                          <div className="truncate" title={donation.donation_message}>
                            "{donation.donation_message}"
                          </div>
                        ) : (
                          <span className="text-gray-500 italic">No message</span>
                        )}
                      </td>
                      <td className="w-96 px-4 py-3 text-gray-400 font-mono text-xs">
                        <div className="space-y-1">
                          <div className="truncate" title={donation.id}>
                            {donation.id}
                          </div>
                          {donation.kofi_transaction_id && (
                            <div className="truncate text-red-400" title={`Ko-fi: ${donation.kofi_transaction_id}`}>
                              Ko-fi: {donation.kofi_transaction_id}
                            </div>
                          )}
                          {donation.kofi_url && (
                            <a 
                              href={donation.kofi_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-red-400 hover:text-red-300 text-xs underline"
                            >
                              View Ko-fi
                            </a>
                          )}
                          {donation.square_payment_id && (
                            <div className="truncate text-blue-400" title={`Square: ${donation.square_payment_id}`}>
                              Square: {donation.square_payment_id}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredDonations.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-500 text-lg">No donations found</div>
                  <div className="text-gray-600 text-sm mt-2">Try adjusting your search filters</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 