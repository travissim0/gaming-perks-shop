'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
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

interface ForumStats {
  total_threads: number;
  total_posts: number;
  user_posts: number;
  user_threads: number;
}

interface SquadStats {
  total_squads: number;
  user_squad: string | null;
  squad_members: number;
}

interface MatchStats {
  total_matches: number;
  user_matches: number;
  upcoming_matches: number;
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
  const [forumStats, setForumStats] = useState<ForumStats>({
    total_threads: 0,
    total_posts: 0,
    user_posts: 0,
    user_threads: 0
  });
  const [squadStats, setSquadStats] = useState<SquadStats>({
    total_squads: 0,
    user_squad: null,
    squad_members: 0
  });
  const [matchStats, setMatchStats] = useState<MatchStats>({
    total_matches: 0,
    user_matches: 0,
    upcoming_matches: 0
  });
  const [loadingData, setLoadingData] = useState(true);

  // Avatar editing states
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  // Email editing states
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

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
          } else {
            setProfile(profileData);
            setAvatarUrl(profileData?.avatar_url || null);
            setNewEmail(profileData?.email || user.email || '');
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

          // Fetch forum statistics
          await fetchForumStats();
          
          // Fetch squad statistics
          await fetchSquadStats();
          
          // Fetch match statistics
          await fetchMatchStats();

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

  const fetchForumStats = async () => {
    try {
      // Get total forum stats
      const [threadsResult, postsResult, userPostsResult, userThreadsResult] = await Promise.all([
        supabase.from('forum_threads').select('id', { count: 'exact' }).eq('is_deleted', false),
        supabase.from('forum_posts').select('id', { count: 'exact' }).eq('is_deleted', false),
        supabase.from('forum_posts').select('id', { count: 'exact' }).eq('author_id', user?.id).eq('is_deleted', false),
        supabase.from('forum_threads').select('id', { count: 'exact' }).eq('author_id', user?.id).eq('is_deleted', false)
      ]);

      setForumStats({
        total_threads: threadsResult.count || 0,
        total_posts: postsResult.count || 0,
        user_posts: userPostsResult.count || 0,
        user_threads: userThreadsResult.count || 0
      });
    } catch (error) {
      console.error('Failed to fetch forum stats:', error);
    }
  };

  const fetchSquadStats = async () => {
    try {
      // Get squad stats
      const [totalSquadsResult, userSquadResult] = await Promise.all([
        supabase.from('squads').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('squad_members').select('squad:squads(name), squad_id').eq('user_id', user?.id).eq('status', 'active').maybeSingle()
      ]);

      let squadMembersCount = 0;
      let squadName = null;
      
      if (userSquadResult.data?.squad_id) {
        const { count } = await supabase
          .from('squad_members')
          .select('id', { count: 'exact' })
          .eq('squad_id', userSquadResult.data.squad_id)
          .eq('status', 'active');
        squadMembersCount = count || 0;
        
        // Access the squad name properly
        const squad = userSquadResult.data.squad as any;
        squadName = squad?.name || null;
      }

      setSquadStats({
        total_squads: totalSquadsResult.count || 0,
        user_squad: squadName,
        squad_members: squadMembersCount
      });
    } catch (error) {
      console.error('Failed to fetch squad stats:', error);
    }
  };

  const fetchMatchStats = async () => {
    try {
      // Get match stats
      const [totalMatchesResult, userMatchesResult, upcomingMatchesResult] = await Promise.all([
        supabase.from('matches').select('id', { count: 'exact' }),
        supabase.from('match_participants').select('id', { count: 'exact' }).eq('player_id', user?.id),
        supabase.from('matches').select('id', { count: 'exact' }).gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')
      ]);

      setMatchStats({
        total_matches: totalMatchesResult.count || 0,
        user_matches: userMatchesResult.count || 0,
        upcoming_matches: upcomingMatchesResult.count || 0
      });
    } catch (error) {
      console.error('Failed to fetch match stats:', error);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const maxSize = 2 * 1024 * 1024; // 2MB
      
      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
        return;
      }
      
      if (file.size > maxSize) {
        toast.error('File is too large. Maximum size is 2MB.');
        return;
      }
      
      setAvatarFile(file);
      
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAvatar = async () => {
    if (!user || !avatarFile) return;
    
    try {
      let newAvatarUrl = avatarUrl;
      
      // Upload the file
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `user-uploads/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true });
        
      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
        
      newAvatarUrl = publicUrl;
      
      // Update the profile
      const { error } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
        
      if (error) throw error;
      
      setProfile((prev: any) => ({ ...prev, avatar_url: newAvatarUrl }));
      setEditingAvatar(false);
      setAvatarFile(null);
      toast.success('Avatar updated successfully!');
    } catch (error: any) {
      toast.error('Error updating avatar: ' + error.message);
    }
  };

  const handleSaveEmail = async () => {
    if (!user || newEmail === (profile?.email || user.email)) {
      setEditingEmail(false);
      return;
    }
    
    try {
      // Update email in auth
      const { error: emailError } = await supabase.auth.updateUser({
        email: newEmail
      });
      
      if (emailError) throw emailError;
      
      // Update email in profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          email: newEmail,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
        
      if (profileError) throw profileError;
      
      setProfile((prev: any) => ({ ...prev, email: newEmail }));
      setEditingEmail(false);
      toast.success('Email updated successfully! Please check your new email for a confirmation link.');
    } catch (error: any) {
      toast.error('Error updating email: ' + error.message);
    }
  };

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
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">📊 Dashboard</h1>
            <p className="text-xl text-gray-300">Your personal account overview</p>
          </div>

          <div className="space-y-8">
            {/* User Profile Section */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
              <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎖️ User Profile</h2>
              
              {loadingData ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-24 w-24 bg-gray-700 rounded-lg mx-auto mb-4"></div>
                  <div className="h-6 bg-gray-700 rounded"></div>
                  <div className="h-6 bg-gray-700 rounded w-3/4"></div>
                </div>
              ) : profile ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {/* User Avatar - Increased size and editable */}
                    <div className="flex justify-center">
                      <div className="relative">
                        <UserAvatar 
                          user={{
                            avatar_url: avatarUrl,
                            in_game_alias: profile.in_game_alias,
                            email: profile.email
                          }} 
                          size="3xl"
                          className="ring-4 ring-cyan-500/30 shadow-2xl"
                        />
                        {!editingAvatar && (
                          <button
                            onClick={() => setEditingAvatar(true)}
                            className="absolute -bottom-2 -right-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full p-2 shadow-lg transition-all duration-300"
                            title="Edit Avatar"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {editingAvatar && (
                      <div className="bg-gray-700/50 border border-cyan-500/30 rounded-lg p-4">
                        <label className="block text-cyan-400 font-bold mb-2">Upload New Avatar</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileChange}
                          className="hidden"
                          id="avatar-upload"
                        />
                        <div className="flex gap-2">
                          <label
                            htmlFor="avatar-upload"
                            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded cursor-pointer text-center transition-all duration-300"
                          >
                            Choose File
                          </label>
                          <button
                            onClick={handleSaveAvatar}
                            disabled={!avatarFile}
                            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-all duration-300"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingAvatar(false);
                              setAvatarFile(null);
                              setAvatarUrl(profile.avatar_url);
                            }}
                            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded transition-all duration-300"
                          >
                            Cancel
                          </button>
                        </div>
                        {avatarFile && (
                          <p className="mt-2 text-sm text-cyan-300">📁 {avatarFile.name}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-6">
                    {/* Email - Editable */}
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="font-bold text-cyan-400">Email:</span> 
                          {editingEmail ? (
                            <div className="mt-2">
                              <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="w-full bg-gray-800 border border-cyan-500/30 rounded px-3 py-2 text-white"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={handleSaveEmail}
                                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded text-sm transition-all duration-300"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingEmail(false);
                                    setNewEmail(profile.email || user.email || '');
                                  }}
                                  className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition-all duration-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="ml-2 text-white font-mono">{profile.email}</span>
                          )}
                        </div>
                        {!editingEmail && (
                          <button
                            onClick={() => setEditingEmail(true)}
                            className="text-cyan-400 hover:text-cyan-300 ml-2"
                            title="Edit Email"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* In-Game Alias - Read Only */}
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                      <p className="text-gray-300">
                        <span className="font-bold text-cyan-400">In-Game Alias:</span> 
                        <span className="ml-2 text-yellow-400 font-mono">{profile.in_game_alias || 'Not Set'}</span>
                        <span className="ml-2 text-xs text-gray-500">(Contact admin to change)</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-700/50 border border-red-500/50 rounded-lg p-6">
                  <p className="text-red-400 font-bold">⚠️ Profile data unavailable</p>
                  <p className="text-gray-300 mt-2">Please check your connection and try again.</p>
                </div>
              )}
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Forum Statistics */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-purple-400 mb-4">💬 Forum Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Your Posts:</span>
                    <span className="text-purple-400 font-bold">{forumStats.user_posts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Your Threads:</span>
                    <span className="text-purple-400 font-bold">{forumStats.user_threads}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Posts:</span>
                    <span className="text-gray-400">{forumStats.total_posts}</span>
                  </div>
                </div>
              </div>

              {/* Squad Statistics */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-blue-400 mb-4">⚔️ Squad Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Your Squad:</span>
                    <span className="text-blue-400 font-bold text-sm">{squadStats.user_squad || 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Squad Size:</span>
                    <span className="text-blue-400 font-bold">{squadStats.squad_members}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Squads:</span>
                    <span className="text-gray-400">{squadStats.total_squads}</span>
                  </div>
                </div>
              </div>

              {/* Match Statistics */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-orange-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-orange-400 mb-4">🏆 Match Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Your Matches:</span>
                    <span className="text-orange-400 font-bold">{matchStats.user_matches}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Upcoming:</span>
                    <span className="text-orange-400 font-bold">{matchStats.upcoming_matches}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Matches:</span>
                    <span className="text-gray-400">{matchStats.total_matches}</span>
                  </div>
                </div>
              </div>

              {/* Account Statistics */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-yellow-400 mb-4">📊 Account</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Active Perks:</span>
                    <span className="text-green-400 font-bold">{userProducts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Status:</span>
                    <span className="text-green-400 font-bold">ACTIVE</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Donated:</span>
                    <span className="text-yellow-400 font-bold text-xs">
                      {loadingData ? '...' : formatCurrency(donationData.totalAmount, donationData.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Perks Section - Reduced Detail */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
              <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎮 ACTIVE PERKS</h2>
              
              {loadingData ? (
                <div className="space-y-4">
                  <div className="animate-pulse h-16 bg-gray-700 rounded"></div>
                  <div className="animate-pulse h-16 bg-gray-700 rounded"></div>
                </div>
              ) : userProducts && userProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userProducts.map((item) => (
                    <div key={item.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300">
                      <h3 className="font-bold text-cyan-400 text-lg mb-2">{item.products?.name || 'CLASSIFIED PERK'}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-mono">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                        </span>
                        <span className="text-green-400 font-bold text-sm">✅ ACTIVE</span>
                      </div>
                      {item.phrase && item.products?.customizable && (
                        <div className="mt-2 p-2 bg-gray-900/50 border border-yellow-500/30 rounded text-center">
                          <span className="text-cyan-400 font-mono text-sm">"{item.phrase}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-700/30 border border-gray-600 rounded-lg">
                  <div className="text-gray-400 text-6xl mb-4">🎮</div>
                  <p className="mb-6 text-gray-400 text-lg font-bold italic">No perks found</p>
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

            {/* Recent Donations Section */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
              <div className="bg-gray-700/50 px-6 py-4 border-b border-yellow-500/30">
                <h3 className="text-yellow-400 font-bold text-xl tracking-wider flex items-center justify-between">
                  💰 YOUR RECENT DONATIONS
                  <Link 
                    href="/perks" 
                    className="text-yellow-400 hover:text-yellow-300 text-sm font-normal border border-yellow-500/50 hover:border-yellow-400 px-3 py-1 rounded transition-all duration-300"
                  >
                    DONATE
                  </Link>
                </h3>
                <p className="text-gray-400 text-sm mt-1 font-mono">
                  Total: {formatCurrency(donationData.totalAmount, donationData.currency)}
                </p>
              </div>
              
              <div className="p-4 bg-gray-900 max-h-60 overflow-y-auto">
                {loadingData ? (
                  <div className="text-center py-6">
                    <div className="text-gray-500 text-sm">Loading donations...</div>
                  </div>
                ) : donationData.recentDonations.length > 0 ? (
                  <div className="space-y-3">
                    {donationData.recentDonations.map((donation, index) => (
                      <div key={index} className="bg-gray-800/50 border border-yellow-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-yellow-400 font-bold">
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
        </div>
      </main>
    </div>
  );
} 