'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import CTFAdminPanel from '@/components/CTFAdminPanel';
import AliasAssociationModal from '@/components/AliasAssociationModal';
import SeasonManagementModal from '@/components/admin/SeasonManagementModal';
import SquadMaintenanceModal from '@/components/admin/SquadMaintenanceModal';
import { toast } from 'react-hot-toast';

export type CTFRoleType = 
  | 'none'
  | 'ctf_admin'
  | 'ctf_head_referee'
  | 'ctf_referee'
  | 'ctf_recorder'
  | 'ctf_commentator';

interface UserProfile {
  id: string;
  email: string;
  in_game_alias: string;
  is_admin: boolean;
  is_media_manager: boolean;
  ctf_role: CTFRoleType;
  registration_status: string;
  created_at: string;
  updated_at: string;
  avatar_url?: string;
}

interface CTFStats {
  total_users: number;
  ctf_admins: number;
  head_referees: number;
  referees: number;
  recorders: number;
  commentators: number;
  recent_applications: number;
}

const CTF_ROLE_INFO = {
  none: { display_name: 'No CTF Role', level: 0, color: 'bg-gray-500 border-gray-600' },
  ctf_admin: { display_name: 'CTF Administrator', level: 90, color: 'bg-purple-500 border-purple-600' },
  ctf_head_referee: { display_name: 'CTF Head Referee', level: 80, color: 'bg-blue-500 border-blue-600' },
  ctf_referee: { display_name: 'CTF Referee', level: 70, color: 'bg-green-500 border-green-600' },
  ctf_recorder: { display_name: 'CTF Recorder', level: 60, color: 'bg-yellow-500 border-yellow-600' },
  ctf_commentator: { display_name: 'CTF Commentator', level: 50, color: 'bg-orange-500 border-orange-600' }
};

export default function CTFAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isCTFAdmin, setIsCTFAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ctfStats, setCTFStats] = useState<CTFStats>({
    total_users: 0,
    ctf_admins: 0,
    head_referees: 0,
    referees: 0,
    recorders: 0,
    commentators: 0,
    recent_applications: 0
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    const checkCTFAdmin = async () => {
      if (user && !isCTFAdmin) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            throw error;
          }

          setProfile(data);

          // Check if user is CTF admin or site admin (fixed null handling)
          const hasAccess = data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
          if (!hasAccess) {
            router.push('/dashboard');
            toast.error('Unauthorized: CTF Admin access required');
            return;
          }

          setIsCTFAdmin(true);
          await fetchCTFStats();
        } catch (error: any) {
          console.error('Error checking CTF admin status:', error);
          router.push('/dashboard');
          toast.error('Error checking permissions');
        }
      }
    };

    checkCTFAdmin();
  }, [user, loading, isCTFAdmin]);

  const fetchCTFStats = async () => {
    try {
      setLoadingData(true);

      // Get user counts by CTF role
      const { data: roleData, error: roleError } = await supabase
        .from('profiles')
        .select('ctf_role')
        .neq('ctf_role', 'none');

      if (roleError) throw roleError;

      // Calculate stats
      const stats: CTFStats = {
        total_users: roleData?.length || 0,
        ctf_admins: roleData?.filter(u => u.ctf_role === 'ctf_admin').length || 0,
        head_referees: roleData?.filter(u => u.ctf_role === 'ctf_head_referee').length || 0,
        referees: roleData?.filter(u => u.ctf_role === 'ctf_referee').length || 0,
        recorders: roleData?.filter(u => u.ctf_role === 'ctf_recorder').length || 0,
        commentators: roleData?.filter(u => u.ctf_role === 'ctf_commentator').length || 0,
        recent_applications: 0 // TODO: Add when application system is ready
      };

      setCTFStats(stats);
    } catch (error: any) {
      console.error('Error fetching CTF stats:', error);
      toast.error('Error loading CTF statistics');
    } finally {
      setLoadingData(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!user || !isCTFAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-400 font-mono">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-2 py-4 sm:px-4 sm:py-6">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-4 sm:space-y-6">
            {/* CTF Admin Header + Profile Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* CTF Admin Header - 1/3 width */}
              <div className="lg:col-span-1">
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-4 sm:p-6 shadow-2xl h-full">
                  <div className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-purple-400 mb-2 tracking-wider">🎮 CTF Admin</h1>
                    <p className="text-sm sm:text-base text-gray-300">Capture The Flag Administration</p>
                    <div className="mt-4 text-xs text-purple-300">
                      Role: {profile ? CTF_ROLE_INFO[profile.ctf_role || 'none'].display_name : 'Loading...'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Profile Section - 2/3 width */}
              <div className="lg:col-span-2">
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-4 sm:p-6 shadow-2xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-purple-400 mb-4 tracking-wider">👑 Admin Profile</h2>
                  
                  {loadingData ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-16 sm:h-24 w-16 sm:w-24 bg-gray-700 rounded-lg mx-auto mb-4"></div>
                      <div className="h-4 bg-gray-700 rounded"></div>
                      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    </div>
                  ) : profile ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-4">
                        {/* Admin Avatar */}
                        <div className="flex justify-center">
                          <UserAvatar 
                            user={{
                              avatar_url: profile.avatar_url,
                              in_game_alias: profile.in_game_alias,
                              email: profile.email
                            }} 
                            size="2xl"
                            className="ring-4 ring-purple-500/30 shadow-2xl"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {/* Email - Read Only */}
                        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                          <p className="text-gray-300 text-sm">
                            <span className="font-bold text-purple-400">Email:</span> 
                            <span className="ml-2 text-white font-mono">{profile.email}</span>
                          </p>
                        </div>
                        
                        {/* In-Game Alias - Read Only */}
                        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                          <p className="text-gray-300 text-sm">
                            <span className="font-bold text-purple-400">In-Game Alias:</span> 
                            <span className="ml-2 text-yellow-400 font-mono">{profile.in_game_alias || 'Not Set'}</span>
                          </p>
                        </div>

                        {/* CTF Role - Read Only */}
                        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                          <p className="text-gray-300 text-sm">
                            <span className="font-bold text-purple-400">CTF Role:</span> 
                            <span className={`ml-2 px-2 py-1 rounded text-xs font-bold text-white ${CTF_ROLE_INFO[profile.ctf_role || 'none'].color}`}>
                              {CTF_ROLE_INFO[profile.ctf_role || 'none'].display_name}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-700/50 border border-red-500/50 rounded-lg p-4">
                      <p className="text-red-400 font-bold text-sm">⚠️ Profile data unavailable</p>
                      <p className="text-gray-300 mt-2 text-sm">Please check your connection and try again.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTF Statistics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Total CTF Users */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
                <h3 className="text-sm sm:text-base font-bold text-purple-400 mb-2 sm:mb-3">👥 Total</h3>
                <div className="space-y-1 sm:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">CTF Users:</span>
                    <span className="text-purple-400 font-bold text-xs sm:text-sm">{ctfStats.total_users}</span>
                  </div>
                </div>
              </div>

              {/* Admins & Head Refs */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
                <h3 className="text-sm sm:text-base font-bold text-blue-400 mb-2 sm:mb-3">👑 Leadership</h3>
                <div className="space-y-1 sm:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Admins:</span>
                    <span className="text-blue-400 font-bold text-xs sm:text-sm">{ctfStats.ctf_admins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Head Refs:</span>
                    <span className="text-blue-400 font-bold text-xs sm:text-sm">{ctfStats.head_referees}</span>
                  </div>
                </div>
              </div>

              {/* Staff */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
                <h3 className="text-sm sm:text-base font-bold text-green-400 mb-2 sm:mb-3">⚖️ Staff</h3>
                <div className="space-y-1 sm:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Referees:</span>
                    <span className="text-green-400 font-bold text-xs sm:text-sm">{ctfStats.referees}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Recorders:</span>
                    <span className="text-green-400 font-bold text-xs sm:text-sm">{ctfStats.recorders}</span>
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-orange-500/30 rounded-lg p-3 sm:p-4 shadow-2xl">
                <h3 className="text-sm sm:text-base font-bold text-orange-400 mb-2 sm:mb-3">🎬 Media</h3>
                <div className="space-y-1 sm:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Commentators:</span>
                    <span className="text-orange-400 font-bold text-xs sm:text-sm">{ctfStats.commentators}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300 text-xs sm:text-sm">Applications:</span>
                    <span className="text-orange-400 font-bold text-xs sm:text-sm">{ctfStats.recent_applications}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions + CTF Admin Panel Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Quick Actions - 1/3 width */}
              <div className="lg:col-span-1">
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden h-full">
                  <div className="bg-gray-700/50 px-4 py-3 border-b border-yellow-500/30">
                    <h3 className="text-yellow-400 font-bold text-lg tracking-wider">⚡ Quick Actions</h3>
                  </div>
                  
                  <div className="p-4 space-y-3">
                    <button
                      onClick={fetchCTFStats}
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300"
                    >
                      🔄 Refresh Stats
                    </button>
                    
                    <button
                      onClick={() => router.push('/matches')}
                      className="w-full bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300"
                    >
                      🏆 View Matches
                    </button>

                    <AliasAssociationModal />

                    <SeasonManagementModal />

                    <SquadMaintenanceModal />

                    <div className="pt-2 border-t border-gray-600">
                      <div className="text-xs text-gray-400 text-center">
                        <p className="mb-1">Role Hierarchy</p>
                        {Object.entries(CTF_ROLE_INFO)
                          .filter(([key]) => key !== 'none')
                          .sort((a, b) => b[1].level - a[1].level)
                          .map(([key, info]) => (
                            <div key={key} className="flex items-center justify-between mb-1">
                              <span className={`px-1 py-0.5 rounded text-xs ${info.color} text-white`}>
                                {info.display_name}
                              </span>
                              <span className="text-xs text-gray-500">L{info.level}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CTF Admin Panel - 2/3 width */}
              <div className="lg:col-span-2">
                <div className="space-y-6">
                  {/* Quick Actions */}
                  <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-purple-400 mb-4">🚀 Quick Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <a
                        href="/admin/ctf-management"
                        className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg transition-all duration-200 hover:scale-105 group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">🛡️</div>
                          <div>
                            <div className="font-semibold">Squad Management</div>
                            <div className="text-sm text-purple-200">Manage squads & tournaments</div>
                          </div>
                        </div>
                      </a>
                      
                      <a
                        href="/admin/ctf-management?tab=free-agents"
                        className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg transition-all duration-200 hover:scale-105 group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">🎯</div>
                          <div>
                            <div className="font-semibold">Admin Free Agents</div>
                            <div className="text-sm text-blue-200">Manage available players</div>
                          </div>
                        </div>
                      </a>

                      <a
                        href="/free-agents"
                        className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg transition-all duration-200 hover:scale-105 group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">👀</div>
                          <div>
                            <div className="font-semibold">View Public Pool</div>
                            <div className="text-sm text-green-200">See what players see</div>
                          </div>
                        </div>
                      </a>

                      <a
                        href="/admin/ctf-management?tab=bans"
                        className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-lg transition-all duration-200 hover:scale-105 group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">🚫</div>
                          <div>
                            <div className="font-semibold">League Bans</div>
                            <div className="text-sm text-red-200">Manage banned players</div>
                          </div>
                        </div>
                      </a>
                    </div>
                  </div>

                  {/* CTF Admin Panel */}
                <CTFAdminPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 