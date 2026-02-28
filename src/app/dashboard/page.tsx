'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import PlayerProfileHero from '@/components/PlayerProfileHero';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { UserProduct } from '@/types';
import PhraseEditModal from '@/components/PhraseEditModal';
import type { EloTier } from '@/utils/eloTiers';

// ---------- Types ----------

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

interface ProfileApiResponse {
  profile: {
    id: string;
    in_game_alias: string | null;
    avatar_url: string | null;
    created_at: string;
    is_league_banned: boolean;
    ctf_role: string | null;
  } | null;
  aliases: string[];
  squad: {
    id: string;
    name: string;
    tag: string;
    banner_url: string | null;
    role: string;
  } | null;
  freeAgent: {
    preferred_roles: string[];
    skill_level: string;
    availability: string | null;
  } | null;
  elo: {
    weighted_elo: number;
    elo_rating: number;
    elo_peak: number;
    elo_confidence: number;
    total_games: number;
    win_rate: number;
    kill_death_ratio: number;
    tier: EloTier;
  } | null;
  isRegistered: boolean;
}

// ---------- Component ----------

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Data state
  const [profile, setProfile] = useState<any>(null);
  const [heroData, setHeroData] = useState<ProfileApiResponse | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [donationData, setDonationData] = useState<DonationData>({
    totalAmount: 0, totalCents: 0, totalCount: 0,
    recentDonations: [], currency: 'usd'
  });
  const [forumStats, setForumStats] = useState<ForumStats>({
    total_threads: 0, total_posts: 0, user_posts: 0, user_threads: 0
  });
  const [squadStats, setSquadStats] = useState<SquadStats>({
    total_squads: 0, user_squad: null, squad_members: 0
  });
  const [matchStats, setMatchStats] = useState<MatchStats>({
    total_matches: 0, user_matches: 0, upcoming_matches: 0
  });
  const [loadingData, setLoadingData] = useState(true);

  // Phrase editing states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserProduct, setEditingUserProduct] = useState<UserProduct | null>(null);

  // ---------- Auth guard ----------

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  // ---------- Data fetching ----------

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
        } else {
          setProfile(profileData);
        }

        // Fetch user products
        const { data: productData, error: productError } = await supabase
          .from('user_products')
          .select('*, products(*)')
          .eq('user_id', user.id);

        if (productError) throw productError;
        setUserProducts(productData as unknown as UserProduct[]);

        // Fetch donation data
        const donationResponse = await fetch(`/api/user-donations?userId=${user.id}`);
        if (donationResponse.ok) {
          const dData = await donationResponse.json();
          setDonationData(dData);
        }

        // Fetch stats in parallel
        await Promise.all([
          fetchForumStats(),
          fetchSquadStats(),
          fetchMatchStats(),
        ]);
      } catch (error: any) {
        toast.error('Error fetching data: ' + error.message);
      } finally {
        setLoadingData(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  // Fetch hero data once profile is loaded
  useEffect(() => {
    const fetchHeroData = async () => {
      if (!profile?.in_game_alias) return;
      try {
        setHeroLoading(true);
        const response = await fetch(
          `/api/player-stats/player/${encodeURIComponent(profile.in_game_alias)}/profile`
        );
        if (response.ok) {
          const data: ProfileApiResponse = await response.json();
          setHeroData(data);
        }
      } catch (err) {
        console.error('Failed to fetch hero data:', err);
      } finally {
        setHeroLoading(false);
      }
    };
    fetchHeroData();
  }, [profile?.in_game_alias]);

  // ---------- Stats fetchers ----------

  const fetchForumStats = async () => {
    try {
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
      const totalSquadsResult = await supabase
        .from('squads')
        .select('id', { count: 'exact' })
        .eq('is_active', true);

      const userSquadResult = await supabase
        .from('squad_members')
        .select('squad:squads(name), squad_id')
        .eq('player_id', user?.id)
        .eq('status', 'active')
        .maybeSingle();

      let squadMembersCount = 0;
      let squadName = null;

      if (userSquadResult.data?.squad_id) {
        const { count } = await supabase
          .from('squad_members')
          .select('id', { count: 'exact' })
          .eq('squad_id', userSquadResult.data.squad_id)
          .eq('status', 'active');
        squadMembersCount = count || 0;

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

  // ---------- Helpers ----------

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const handleEditPhrase = (userProduct: UserProduct) => {
    setEditingUserProduct(userProduct);
    setShowEditModal(true);
  };

  const handlePhraseUpdate = async (newPhrase: string) => {
    if (editingUserProduct) {
      setUserProducts(prev =>
        prev.map(up =>
          up.id === editingUserProduct.id
            ? { ...up, phrase: newPhrase }
            : up
        )
      );
    }
    setShowEditModal(false);
    setEditingUserProduct(null);
  };

  // ---------- Loading / auth states ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4" />
          <p className="text-cyan-400 font-mono">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto px-2 py-4 sm:px-4 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

          {/* ===== Profile Hero ===== */}
          <PlayerProfileHero
            playerName={profile?.in_game_alias || 'Player'}
            profile={heroData?.profile ?? null}
            aliases={heroData?.aliases ?? []}
            squad={heroData?.squad ?? null}
            freeAgent={heroData?.freeAgent ?? null}
            elo={heroData?.elo ?? null}
            isRegistered={heroData?.isRegistered ?? true}
            loading={heroLoading || loadingData}
          />

          {/* ===== Quick Actions ===== */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/20 rounded-lg p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-cyan-400 mb-4 tracking-wide">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {profile?.in_game_alias && (
                <Link
                  href={`/stats/player/${encodeURIComponent(profile.in_game_alias)}`}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25 text-center text-sm"
                >
                  View My Stats
                </Link>
              )}
              <Link
                href="/profile"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-blue-500/25 text-center text-sm"
              >
                Edit Profile
              </Link>
              <Link
                href="/free-agents/update"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-purple-500/25 text-center text-sm"
              >
                Update Free Agent
              </Link>
              <Link
                href="/perks"
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-green-500/25 text-center text-sm"
              >
                Browse Perks
              </Link>
            </div>
          </div>

          {/* ===== Statistics Grid ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Forum */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
              <h3 className="text-sm sm:text-base font-bold text-purple-400 mb-2 sm:mb-3">Forum</h3>
              <div className="space-y-1 sm:space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Posts:</span>
                  <span className="text-purple-400 font-bold text-xs sm:text-sm">{forumStats.user_posts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Threads:</span>
                  <span className="text-purple-400 font-bold text-xs sm:text-sm">{forumStats.user_threads}</span>
                </div>
              </div>
            </div>

            {/* Squad */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
              <h3 className="text-sm sm:text-base font-bold text-blue-400 mb-2 sm:mb-3">Squad</h3>
              <div className="space-y-1 sm:space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Squad:</span>
                  <span className="text-blue-400 font-bold text-xs sm:text-sm truncate ml-1">{squadStats.user_squad || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Size:</span>
                  <span className="text-blue-400 font-bold text-xs sm:text-sm">{squadStats.squad_members}</span>
                </div>
              </div>
            </div>

            {/* Matches */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-orange-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
              <h3 className="text-sm sm:text-base font-bold text-orange-400 mb-2 sm:mb-3">Matches</h3>
              <div className="space-y-1 sm:space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Played:</span>
                  <span className="text-orange-400 font-bold text-xs sm:text-sm">{matchStats.user_matches}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Upcoming:</span>
                  <span className="text-orange-400 font-bold text-xs sm:text-sm">{matchStats.upcoming_matches}</span>
                </div>
              </div>
            </div>

            {/* Account */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
              <h3 className="text-sm sm:text-base font-bold text-yellow-400 mb-2 sm:mb-3">Account</h3>
              <div className="space-y-1 sm:space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Perks:</span>
                  <span className="text-green-400 font-bold text-xs sm:text-sm">{userProducts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 text-xs sm:text-sm">Donated:</span>
                  <span className="text-yellow-400 font-bold text-xs sm:text-sm">
                    {loadingData ? '...' : formatCurrency(donationData.totalCents, donationData.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Donations + Active Perks ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Recent Donations - 1/3 */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden h-full">
                <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                  <h3 className="text-yellow-400 font-bold text-lg tracking-wide flex items-center justify-between">
                    Donations
                    <Link
                      href="/perks"
                      className="text-yellow-400 hover:text-yellow-300 text-xs font-normal border border-yellow-500/50 hover:border-yellow-400 px-2 py-1 rounded transition-all duration-300"
                    >
                      Donate
                    </Link>
                  </h3>
                  <p className="text-gray-400 text-xs mt-1 font-mono">
                    Total: {formatCurrency(donationData.totalCents, donationData.currency)}
                  </p>
                </div>

                <div className="p-3 bg-gray-900 max-h-48 overflow-y-auto">
                  {loadingData ? (
                    <div className="text-center py-4">
                      <div className="text-gray-500 text-sm">Loading donations...</div>
                    </div>
                  ) : donationData.recentDonations.length > 0 ? (
                    <div className="space-y-2">
                      {donationData.recentDonations.slice(0, 3).map((donation, index) => (
                        <div key={index} className="bg-gray-800/50 border border-yellow-500/20 rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-yellow-400 font-bold text-sm">
                              {formatCurrency(donation.amount * 100, donation.currency)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {new Date(donation.date).toLocaleDateString()}
                            </span>
                          </div>
                          {donation.message && (
                            <div className="text-gray-300 text-xs italic truncate" title={donation.message}>
                              &ldquo;{donation.message}&rdquo;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-gray-500 text-sm">No donations yet</div>
                      <div className="text-gray-600 text-xs mt-1">Support the mission!</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Active Perks - 2/3 */}
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/20 rounded-lg p-4 sm:p-6 shadow-2xl">
                <h2 className="text-xl sm:text-2xl font-bold text-cyan-400 mb-4 tracking-wide">Active Perks</h2>

                {loadingData ? (
                  <div className="space-y-3">
                    <div className="animate-pulse h-12 bg-gray-700 rounded" />
                    <div className="animate-pulse h-12 bg-gray-700 rounded" />
                  </div>
                ) : userProducts && userProducts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {userProducts.map((item) => (
                      <div key={item.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 hover:border-cyan-500/50 transition-all duration-300">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-cyan-400 text-sm sm:text-base">{item.products?.name || 'Classified Perk'}</h3>
                          <span className="text-green-400 font-bold text-xs">Active</span>
                        </div>

                        <div className="text-xs text-gray-500 font-mono mb-2">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                        </div>

                        {item.products?.customizable && (
                          <div className="mt-2 p-2 bg-gray-900/50 border border-purple-500/30 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-purple-400 font-bold text-xs">Kill Macro</span>
                              <button
                                onClick={() => handleEditPhrase(item)}
                                className="text-cyan-400 hover:text-cyan-300 text-xs font-bold transition-colors"
                                title="Edit Custom Phrase"
                              >
                                Edit
                              </button>
                            </div>
                            {item.phrase ? (
                              <div className="text-center">
                                <div className="font-mono bg-gradient-to-r from-purple-600 to-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-lg">
                                  {item.phrase}
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-gray-400 italic text-xs">
                                No phrase set
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-gray-700/30 border border-gray-600 rounded-lg">
                    <p className="mb-4 text-gray-400 text-base font-bold">No perks found</p>
                    <p className="mb-4 text-gray-400 text-sm">Support the game server and unlock exclusive perks.</p>
                    <Link
                      href="/perks"
                      className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
                    >
                      Browse Perks
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Phrase Edit Modal */}
      <PhraseEditModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingUserProduct(null); }}
        onUpdate={handlePhraseUpdate}
        userProductId={editingUserProduct?.id || ''}
        currentPhrase={editingUserProduct?.phrase || null}
        productName={editingUserProduct?.products?.name || ''}
      />
    </div>
  );
}
