'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface Supporter {
  id: string;
  type: 'donation' | 'purchase';
  amount: number;
  currency: string;
  customer_name: string;
  message?: string;
  created_at: string;
  payment_method: string;
  product_name?: string;
}

interface Stats {
  totalAmount: number;
  totalSupporters: number;
  thisMonthAmount: number;
  largestContribution: {
    amount: number;
    supporterName: string;
    type: 'donation' | 'purchase';
    productName?: string;
  } | null;
}

export default function SupportersPage() {
  const { user } = useAuth();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [topSupporters, setTopSupporters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalAmount: 0,
    totalSupporters: 0,
    thisMonthAmount: 0,
    largestContribution: null
  });

  useEffect(() => {
    const fetchSupporters = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/supporters');
        
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.supporters && data.stats && data.topSupporters) {
          setSupporters(data.supporters);
          setTopSupporters(data.topSupporters);
          
          // Stats are already in dollars from the API
          setStats({
            totalAmount: data.stats.totalAmount,
            totalSupporters: data.stats.totalSupporters,
            thisMonthAmount: data.stats.thisMonthAmount,
            largestContribution: data.stats.largestContribution ? {
              amount: data.stats.largestContribution.amount,
              supporterName: data.stats.largestContribution.supporterName,
              type: data.stats.largestContribution.type,
              productName: data.stats.largestContribution.productName
            } : null
          });
        } else {
          throw new Error('Invalid API response structure');
        }
      } catch (error) {
        console.error('Error fetching supporters:', error);
        setError(`Unable to load live supporter data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // Fallback to static data if API fails
        const staticSupporters = [
          { id: "1", type: "donation" as const, amount: 121, currency: "usd", customer_name: "Zmn", message: "ez dila", created_at: "2025-06-12T04:25:29.442+00:00", payment_method: "kofi" },
          { id: "2", type: "donation" as const, amount: 120, currency: "usd", customer_name: "Kurrupter", message: "", created_at: "2025-06-12T01:25:29.442+00:00", payment_method: "kofi" },
          { id: "3", type: "donation" as const, amount: 110, currency: "usd", customer_name: "Worth", message: "Thanks for all your hard work.", created_at: "2025-06-10T00:07:06.896+00:00", payment_method: "kofi" },
          { id: "4", type: "donation" as const, amount: 100, currency: "usd", customer_name: "Fausto", message: "Thank you Axidus", created_at: "2025-06-09T04:25:54.693+00:00", payment_method: "kofi" },
          { id: "5", type: "donation" as const, amount: 50, currency: "usd", customer_name: "mbx", message: "thanks for all that you are doing", created_at: "2025-06-08T18:41:05.698+00:00", payment_method: "kofi" }
        ];
        
        const totalAmount = staticSupporters.reduce((sum, supporter) => sum + supporter.amount, 0);
        
        const supporterTotals = staticSupporters.reduce((acc, supporter) => {
          if (!acc[supporter.customer_name]) {
            acc[supporter.customer_name] = { totalAmount: 0, contributionCount: 0, name: supporter.customer_name };
          }
          acc[supporter.customer_name].totalAmount += supporter.amount;
          acc[supporter.customer_name].contributionCount += 1;
          return acc;
        }, {} as Record<string, { totalAmount: number; contributionCount: number; name: string }>);

        const topSupportersArray = Object.values(supporterTotals)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 3);

        setSupporters(staticSupporters);
        setTopSupporters(topSupportersArray);
        setStats({
          totalAmount: totalAmount,
          totalSupporters: staticSupporters.length,
          thisMonthAmount: totalAmount,
          largestContribution: staticSupporters.length > 0 ? {
            amount: Math.max(...staticSupporters.map(s => s.amount)),
            supporterName: staticSupporters.find(s => s.amount === Math.max(...staticSupporters.map(sup => sup.amount)))?.customer_name || "Unknown",
            type: "donation" as const
          } : null
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSupporters();
    
    // Auto-refresh every 30 seconds to pick up new donations from webhook
    const interval = setInterval(fetchSupporters, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (dollars: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(dollars);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDisplayName = (supporter: Supporter) => {
    return supporter.customer_name || 'Anonymous Supporter';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-cyan-500'
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const getTypeIcon = (supporter: Supporter) => {
    if (supporter.type === 'purchase') {
      return '🎁';
    }
    return '☕';
  };

  const getTypeLabel = (supporter: Supporter) => {
    if (supporter.type === 'purchase') {
      return supporter.product_name ? `Perk: ${supporter.product_name}` : 'Perk Purchase';
    }
    return 'Donation';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
          <span className="ml-3 text-cyan-400 font-mono">Loading supporters...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
            <main className="container mx-auto py-4 px-4">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Content - Recent Supporters List */}
          <div className="lg:col-span-3">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-white">Recent Supporters</h2>
            <div className="flex gap-3">
              <Link 
                href="/perks"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300 hover:scale-105"
              >
                🎁 Browse Perks
              </Link>
              <Link 
                href="/donate"
                className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300 hover:scale-105"
              >
                ☕ Donate
              </Link>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-orange-900/20 border border-orange-500/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-orange-400">⚠️</span>
                <span className="text-orange-300 text-sm">{error}</span>
                <span className="text-orange-400 text-xs ml-auto">Showing cached data</span>
              </div>
            </div>
          )}

          {supporters.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🤗</div>
              <h3 className="text-2xl font-bold text-gray-400 mb-2">Be Our First Supporter!</h3>
              <p className="text-gray-500 mb-6">Help us get started by making the first donation or purchasing a perk.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link 
                  href="/donate"
                  className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105"
                >
                  ☕ Make First Donation
                </Link>
                <Link 
                  href="/perks"
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105"
                >
                  🎁 Browse Perks
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              {supporters.map((supporter, index) => {
                const displayName = getDisplayName(supporter);
                const initials = getInitials(displayName);
                const avatarColor = getAvatarColor(displayName);
                
                return (
                  <div 
                    key={supporter.id} 
                    className={`flex items-center gap-6 p-6 rounded-xl transition-all duration-300 hover:scale-[1.02] ${
                      index % 2 === 0 ? 'bg-gray-700/30' : 'bg-gray-600/20'
                    } hover:bg-gray-600/40 border border-gray-600/30`}
                  >
                    {/* Avatar */}
                    <div className={`w-16 h-16 ${avatarColor} rounded-full flex items-center justify-center text-white font-bold text-lg relative`}>
                      {initials}
                      <div className="absolute -bottom-1 -right-1 text-2xl">
                        {getTypeIcon(supporter)}
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-white">{displayName}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          supporter.payment_method === 'kofi' 
                            ? 'bg-red-900/50 text-red-400 border border-red-500/30' 
                            : supporter.payment_method === 'square'
                            ? 'bg-blue-900/50 text-blue-400 border border-blue-500/30'
                            : 'bg-indigo-900/50 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {supporter.payment_method === 'kofi' ? '☕ Ko-fi' : 
                           supporter.payment_method === 'square' ? '🟦 Square' : '💳 Stripe'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          supporter.type === 'donation'
                            ? 'bg-orange-900/50 text-orange-400 border border-orange-500/30'
                            : 'bg-purple-900/50 text-purple-400 border border-purple-500/30'
                        }`}>
                          {getTypeLabel(supporter)}
                        </span>
                      </div>
                      
                      {supporter.message && (
                        <p className="text-gray-300 italic mb-2">"{supporter.message}"</p>
                      )}
                      
                      <p className="text-gray-400 text-sm">{formatDate(supporter.created_at)}</p>
                    </div>
                    
                    {/* Amount */}
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(supporter.amount)}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {supporter.currency.toUpperCase()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar Panel */}
      <div className="lg:col-span-1 space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 shadow-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-pink-400 to-orange-400 bg-clip-text text-transparent mb-2">
              Our Supporters
            </h1>
            <p className="text-sm text-gray-300 leading-relaxed">
              Community members keeping Infantry Online running strong!
            </p>
          </div>
        </div>

        {/* Top 3 Supporters - Compact Layout */}
        {topSupporters.length > 0 && (
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center justify-center gap-2">
              <span className="text-xl">🏆</span>
              Top 3 Supporters
            </h2>
            
            <div className="space-y-3">
              {topSupporters.slice(0, 3).map((supporter, index) => {
                const initials = getInitials(supporter.name);
                const avatarColor = getAvatarColor(supporter.name);
                const rankEmojis = ['🥇', '🥈', '🥉'];
                const rankColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];
                
                return (
                  <div 
                    key={supporter.name}
                    className="flex items-center gap-3 p-3 bg-gray-700/40 rounded-lg"
                  >
                    <div className={`text-lg ${rankColors[index]}`}>
                      {rankEmojis[index]}
                    </div>
                    <div className={`w-10 h-10 ${avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{supporter.name}</h3>
                      <div className="text-sm font-bold text-green-400">
                        {formatCurrency(supporter.totalAmount)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {supporter.contributionCount} contribution{supporter.contributionCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats Dashboard */}
        <div className="space-y-3">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-lg font-bold text-green-400">{formatCurrency(stats.totalAmount)}</div>
            <div className="text-gray-400 text-xs">Total Raised</div>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🙏</div>
            <div className="text-lg font-bold text-blue-400">{stats.totalSupporters}</div>
            <div className="text-gray-400 text-xs">Total Supporters</div>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">📅</div>
            <div className="text-lg font-bold text-purple-400">{formatCurrency(stats.thisMonthAmount)}</div>
            <div className="text-gray-400 text-xs">This Month</div>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-lg font-bold text-yellow-400">
              {stats.largestContribution ? formatCurrency(stats.largestContribution.amount) : '$0.00'}
            </div>
            <div className="text-gray-400 text-xs">Largest Contribution</div>
            {stats.largestContribution && (
              <div className="text-xs text-yellow-300 mt-1 font-medium truncate">
                by {stats.largestContribution.supporterName}
              </div>
            )}
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-red-900/20 to-pink-900/20 border border-red-500/30 rounded-xl p-4">
          <h3 className="text-lg font-bold text-white mb-2 text-center">Join the Community!</h3>
          <p className="text-sm text-gray-300 mb-4 text-center">
            Help keep Infantry Online running strong
          </p>
          <div className="flex flex-col gap-2">
            <Link 
              href="/donate"
              className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-4 py-2 rounded-lg font-bold text-sm text-center transition-all duration-300 hover:scale-105"
            >
              ☕ Donate
            </Link>
            <Link 
              href="/perks"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-sm text-center transition-all duration-300 hover:scale-105"
            >
              🎁 Browse Perks
            </Link>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
);
} 