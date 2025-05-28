'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { UserProduct } from '@/types';

interface DonationData {
  totalAmount: number;
  totalCents: number;
  totalCount: number;
  recentDonations: any[];
  currency: string;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [donationData, setDonationData] = useState<DonationData>({
    totalAmount: 0,
    totalCents: 0,
    totalCount: 0,
    recentDonations: [],
    currency: 'usd'
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          // Fetch user profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('Profile fetch error:', profileError);
            // Don't throw error for missing profile, just log it
          } else {
            setProfile(profileData);
          }

          // Fetch user products
          const { data: productData, error: productError } = await supabase
            .from('user_products')
            .select('*, products(*)')
            .eq('user_id', user.id);

          if (productError) {
            throw productError;
          }

          setUserProducts(productData as unknown as UserProduct[]);

          // Fetch user donation data
          const donationResponse = await fetch(`/api/user-donations?userId=${user.id}`);
          if (donationResponse.ok) {
            const donationData = await donationResponse.json();
            setDonationData(donationData);
          }

        } catch (error: any) {
          toast.error('Error fetching data: ' + error.message);
        } finally {
          setLoadingData(false);
        }
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  // Show loading spinner only while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  // If not loading and no user, redirect will happen via useEffect
  // But we shouldn't render anything while redirect is happening
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-cyan-400 font-mono">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      {/* Hidden audio element for sound testing */}
      <audio 
        ref={audioRef} 
        preload="auto"
        onError={() => console.log('Audio failed to load')}
      >
        <source src="/sounds/promotion.wav" type="audio/wav" />
        Your browser does not support the audio element.
      </audio>
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">📊 Dashboard</h1>
            <p className="text-xl text-gray-300">Your personal account overview</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              {/* Welcome Back Section */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-cyan-400 mb-2 tracking-wider">WELCOME BACK</h2>
                  <p className="text-gray-300 font-mono text-lg">{user.email?.split('@')[0]}</p>
                  <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mt-3"></div>
                </div>
                
                <nav className="space-y-3">
                  <Link 
                    href="/perks" 
                    className="flex items-center space-x-3 p-4 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 border border-gray-600 hover:border-cyan-500 transition-all duration-300 group"
                  >
                    <span className="text-2xl">🛍️</span>
                    <span className="text-gray-300 group-hover:text-cyan-400 font-medium tracking-wide">DONATION PERKS</span>
                  </Link>
                  
                  <Link 
                    href="/dashboard" 
                    className="flex items-center space-x-3 p-4 rounded-lg bg-cyan-600/20 border border-cyan-500 transition-all duration-300"
                  >
                    <span className="text-2xl">📊</span>
                    <span className="text-cyan-400 font-medium tracking-wide">DASHBOARD</span>
                  </Link>
                  
                  <Link 
                    href="/profile" 
                    className="flex items-center space-x-3 p-4 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 border border-gray-600 hover:border-cyan-500 transition-all duration-300 group"
                  >
                    <span className="text-2xl">👤</span>
                    <span className="text-gray-300 group-hover:text-cyan-400 font-medium tracking-wide">EDIT PROFILE</span>
                  </Link>
                  
                  <Link 
                    href="/patch-notes" 
                    className="flex items-center space-x-3 p-4 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 border border-gray-600 hover:border-cyan-500 transition-all duration-300 group"
                  >
                    <span className="text-2xl">📋</span>
                    <span className="text-gray-300 group-hover:text-cyan-400 font-medium tracking-wide">PATCH NOTES</span>
                  </Link>
                </nav>
              </div>

              {/* Recent Donations Section */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                  <h3 className="text-yellow-400 font-bold text-sm tracking-wider flex items-center justify-between">
                    💰 YOUR RECENT DONATIONS
                    <Link 
                      href="/perks" 
                      className="text-yellow-400 hover:text-yellow-300 text-xs font-normal border border-yellow-500/50 hover:border-yellow-400 px-2 py-1 rounded transition-all duration-300"
                    >
                      DONATE
                    </Link>
                  </h3>
                  <p className="text-gray-400 text-xs mt-1 font-mono">
                    Total: {formatCurrency(donationData.totalAmount, donationData.currency)}
                  </p>
                </div>
                
                <div className="p-3 bg-gray-900 max-h-60 overflow-y-auto">
                  {loadingData ? (
                    <div className="text-center py-6">
                      <div className="text-gray-500 text-sm">Loading donations...</div>
                    </div>
                  ) : donationData.recentDonations.length > 0 ? (
                    <div className="space-y-2">
                      {donationData.recentDonations.map((donation, index) => (
                        <div key={index} className="bg-gray-800/50 border border-yellow-500/20 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-yellow-400 font-bold text-sm">
                              {formatCurrency(donation.amount, donation.currency)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {new Date(donation.date).toLocaleDateString()}
                            </span>
                          </div>
                          {donation.message && (
                            <div className="text-gray-300 text-xs italic truncate" title={donation.message}>
                              "{donation.message}"
                            </div>
                          )}
                          <div className="text-gray-500 text-xs mt-1">
                            by {donation.customerName}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="text-gray-500 text-sm">No donations yet</div>
                      <div className="text-gray-600 text-xs mt-1">Support the mission!</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Profile Section */}
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
                  <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎖️ User Profile</h2>
                  
                  {loadingData ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 bg-gray-700 rounded"></div>
                      <div className="h-6 bg-gray-700 rounded w-3/4"></div>
                    </div>
                  ) : profile ? (
                    <div className="space-y-4">
                      <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                        <p className="text-gray-300">
                          <span className="font-bold text-cyan-400">Email:</span> 
                          <span className="ml-2 text-white font-mono">{profile.email}</span>
                        </p>
                      </div>
                      <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                        <p className="text-gray-300">
                          <span className="font-bold text-cyan-400">In-Game Alias:</span> 
                          <span className="ml-2 text-yellow-400 font-mono">{profile.in_game_alias || 'Not Set'}</span>
                        </p>
                      </div>
                      <Link 
                        href="/profile" 
                        className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-6 py-3 rounded-lg font-bold tracking-wide border border-purple-500 hover:border-purple-400 transition-all duration-300 shadow-lg hover:shadow-purple-500/25"
                      >
                        👤 Edit Profile
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-gray-700/50 border border-red-500/50 rounded-lg p-6">
                      <p className="text-red-400 font-bold">⚠️ Profile data unavailable</p>
                      <p className="text-gray-300 mt-2">Please check your connection and try again.</p>
                    </div>
                  )}
                </div>

                {/* Perks Section */}
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
                  <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎮 ACTIVE PERKS</h2>
                  
                  {loadingData ? (
                    <div className="space-y-4">
                      <div className="animate-pulse h-24 bg-gray-700 rounded"></div>
                      <div className="animate-pulse h-24 bg-gray-700 rounded"></div>
                    </div>
                  ) : userProducts && userProducts.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {userProducts.map((item) => (
                        <div key={item.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300">
                          <h3 className="font-bold text-cyan-400 text-lg">{item.products?.name || 'CLASSIFIED PERK'}</h3>
                          <p className="text-gray-300 text-sm mt-2">{item.products?.description || 'No intel available'}</p>
                          
                          {item.phrase && item.products?.customizable && (
                            <div className="mt-3 p-3 bg-gray-900/50 border border-yellow-500/30 rounded">
                              <p className="text-yellow-400 font-bold text-sm mb-1">🎮 KILL TEXT:</p>
                              <p className="text-cyan-400 font-mono text-lg">{item.phrase}</p>
                              <p className="text-gray-400 text-xs mt-1">
                                "{item.phrase}"
                              </p>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-gray-500 font-mono">
                              DEPLOYED: {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                            </span>
                            <span className="text-green-400 font-bold text-sm">✅ ACTIVE</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-700/30 border border-gray-600 rounded-lg">
                      <div className="text-gray-400 text-6xl mb-4">🎮</div>
                      <p className="mb-6 text-gray-400 text-lg font-bold italic">None found</p>
                      <p className="mb-6 text-gray-400">Support the game server and unlock exclusive perks.</p>
                      <Link 
                        href="/perks" 
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wide border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
                      >
                        🛍️ BROWSE DONATION PERKS
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Section */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
                {/* <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">📈 MISSION STATISTICS</h2> */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="text-center bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <div className="text-3xl font-bold text-green-400">{userProducts.length}</div>
                    <div className="text-gray-300 mt-2">Active Perks</div>
                  </div>
                  <div className="text-center bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <div className="text-3xl font-bold text-blue-400">
                      {profile?.in_game_alias ? 'SET' : 'UNSET'}
                    </div>
                    <div className="text-gray-300 mt-2">Alias Status</div>
                  </div>
                  <div className="text-center bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <div className="text-3xl font-bold text-purple-400">ONLINE</div>
                    <div className="text-gray-300 mt-2">Combat Status</div>
                  </div>
                  <div className="text-center bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <div className="text-3xl font-bold text-yellow-400">ACTIVE</div>
                    <div className="text-gray-300 mt-2">Account Status</div>
                  </div>
                  <div className="text-center bg-gray-700/50 border border-yellow-500/50 rounded-lg p-6">
                    <div className="text-3xl font-bold text-yellow-400">
                      {loadingData ? '...' : formatCurrency(donationData.totalAmount, donationData.currency)}
                    </div>
                    <div className="text-gray-300 mt-2">Total Donated</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 