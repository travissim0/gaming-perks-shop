'use client';

import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Search, Bell, Settings, Users, Gamepad2, BarChart3, Menu, X } from 'lucide-react';

export default function Navbar({ user }: { user: any }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCtfAdmin, setIsCtfAdmin] = useState(false);
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [isZoneAdmin, setIsZoneAdmin] = useState(false);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingSquadRequests, setPendingSquadRequests] = useState(0);
  const [squadRequests, setSquadRequests] = useState<any[]>([]);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [isAxidus, setIsAxidus] = useState(false);
  const [orderNotifications, setOrderNotifications] = useState<any[]>([]);
  const [donationNotifications, setDonationNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  
  // Mobile dropdown states
  const [showMobileSquadsDropdown, setShowMobileSquadsDropdown] = useState(false);
  const [showMobileStatsDropdown, setShowMobileStatsDropdown] = useState(false);
  const [showMobileCommunityDropdown, setShowMobileCommunityDropdown] = useState(false);
  const [showMobileMiscDropdown, setShowMobileMiscDropdown] = useState(false);
  
  // Refs for mobile dropdowns
  const mobileSquadsRef = useRef<HTMLDivElement>(null);
  const mobileStatsRef = useRef<HTMLDivElement>(null);
  const mobileCommunityRef = useRef<HTMLDivElement>(null);
  const mobileMiscRef = useRef<HTMLDivElement>(null);

  // Function to check pending squad requests for captain/co-captain
  const checkPendingSquadRequests = async () => {
    if (!user) return;

    try {
      // First, get squads where user is captain or co-captain
      const { data: userSquads, error: squadsError } = await supabase
        .from('squad_members')
        .select(`
          squad_id,
          role,
          squads!inner(id, name)
        `)
        .eq('player_id', user.id)
        .in('role', ['captain', 'co_captain'])
        .eq('status', 'active');

      if (squadsError || !userSquads || userSquads.length === 0) {
        setPendingSquadRequests(0);
        return;
      }

      const squadIds = userSquads.map(sq => sq.squad_id);

      // Get ALL pending requests TO these squads (both join requests and invitations)
      const { data: allRequests, error: requestsError } = await supabase
        .from('squad_invites')
        .select('id, invited_by, invited_player_id, squad_id, profiles!squad_invites_invited_player_id_fkey(in_game_alias)')
        .in('squad_id', squadIds)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (requestsError) throw requestsError;

      // Include ALL requests - both self-requests (join requests) and captain invitations
      const requests = allRequests || [];

      console.log('🔔 Navbar notification check:', {
        userSquads: userSquads.length,
        totalRequests: requests.length,
        requestDetails: requests.map((r: any) => ({
          id: r.id,
          invited_by: r.invited_by,
          invited_player_id: r.invited_player_id,
          is_self_request: r.invited_by === r.invited_player_id,
          player_alias: r.profiles?.in_game_alias
        }))
      });

      if (!requestsError && requests) {
        setPendingSquadRequests(requests.length);
        setSquadRequests(requests);
      }
    } catch (error) {
      console.error('Error checking pending squad requests:', error);
    }
  };

  // Function to load recent orders and donations for Axidus
  const loadAdminNotifications = async () => {
    if (!isAxidus) return;

    try {
      // Get recent donations (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: donations, error: donationsError } = await supabase
        .from('donations')
        .select('id, amount, donor_name, created_at')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      // Get recent orders/purchases
      const { data: orders, error: ordersError } = await supabase
        .from('product_purchases')
        .select('id, amount, user_id, created_at, profiles(in_game_alias)')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!donationsError && donations) {
        setDonationNotifications(donations);
      }

      if (!ordersError && orders) {
        setOrderNotifications(orders);
      }
    } catch (error) {
      console.error('Error loading admin notifications:', error);
    }
  };

  useEffect(() => {
    const checkUserData = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin, ctf_role, is_media_manager, is_zone_admin, site_admin, avatar_url, in_game_alias')
          .eq('id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
        setIsCtfAdmin(profile?.is_admin || profile?.ctf_role === 'ctf_admin');
        setIsMediaManager(profile?.is_media_manager || false);
        setIsZoneAdmin(profile?.is_admin || profile?.is_zone_admin || profile?.ctf_role === 'ctf_admin' || profile?.ctf_role === 'ctf_head_referee');
        setIsSiteAdmin(profile?.site_admin || false);
        setUserAvatar(profile?.avatar_url || null);
        
        // Check if user is Axidus
        const userIsAxidus = profile?.in_game_alias === 'Axidus';
        setIsAxidus(userIsAxidus);

        // Also check for pending squad requests
        await checkPendingSquadRequests();
        
        // Load admin notifications if user is Axidus
        if (userIsAxidus) {
          await loadAdminNotifications();
        }
      } catch (error) {
        console.error('Error checking user data:', error);
      }
    };

    checkUserData();

    // Set up interval to check for new squad requests every 30 seconds
    const interval = setInterval(checkPendingSquadRequests, 30000);
    
    // Set up interval to check for admin notifications every 60 seconds (only for Axidus)
    const adminInterval = setInterval(() => {
      if (isAxidus) {
        loadAdminNotifications();
      }
    }, 60000);
    
    return () => {
      clearInterval(interval);
      clearInterval(adminInterval);
    };
  }, [user, isAxidus]);

  // Set up real-time subscriptions for Axidus
  useEffect(() => {
    if (!isAxidus) return;

    // Subscribe to new donations
    const donationsSubscription = supabase
      .channel('admin-donations')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'donations' 
        }, 
        (payload) => {
          const newDonation = payload.new as any;
          setDonationNotifications(prev => [newDonation, ...prev.slice(0, 4)]);
          
          // Show browser notification if permission granted and supported
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('New Donation!', {
                body: `$${newDonation.amount} from ${newDonation.donor_name || 'Anonymous'}`,
                icon: '/favicon.ico'
              });
            } catch (error) {
              console.warn('Notification not supported on this platform:', error);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to new orders
    const ordersSubscription = supabase
      .channel('admin-orders')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'product_purchases' 
        }, 
        async (payload) => {
          const newOrder = payload.new as any;
          
          // Get user profile for the order
          const { data: profile } = await supabase
            .from('profiles')
            .select('in_game_alias')
            .eq('id', newOrder.user_id)
            .single();
          
          const orderWithProfile = {
            ...newOrder,
            profiles: profile
          };
          
          setOrderNotifications(prev => [orderWithProfile, ...prev.slice(0, 4)]);
          
          // Show browser notification if permission granted and supported
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('New Order!', {
                body: `$${newOrder.amount} from ${profile?.in_game_alias || 'User'}`,
                icon: '/favicon.ico'
              });
            } catch (error) {
              console.warn('Notification not supported on this platform:', error);
            }
          }
        }
      )
      .subscribe();

    // Request notification permission if supported
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (error) {
        console.warn('Notification permission request not supported on this platform:', error);
      }
    }

    return () => {
      donationsSubscription.unsubscribe();
      ordersSubscription.unsubscribe();
    };
  }, [isAxidus]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setShowAdminDropdown(false);
      }
      // Mobile dropdowns
      if (mobileSquadsRef.current && !mobileSquadsRef.current.contains(event.target as Node)) {
        setShowMobileSquadsDropdown(false);
      }
      if (mobileStatsRef.current && !mobileStatsRef.current.contains(event.target as Node)) {
        setShowMobileStatsDropdown(false);
      }
      if (mobileCommunityRef.current && !mobileCommunityRef.current.contains(event.target as Node)) {
        setShowMobileCommunityDropdown(false);
      }
      if (mobileMiscRef.current && !mobileMiscRef.current.contains(event.target as Node)) {
        setShowMobileMiscDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleRequestAction = async (requestId: string, action: 'approve' | 'deny') => {
    setProcessingRequest(requestId);
    
    try {
      if (action === 'approve') {
        // Get the request details first
        const { data: request, error: fetchError } = await supabase
          .from('squad_invites')
          .select('invited_player_id, squad_id')
          .eq('id', requestId)
          .single();

        if (fetchError) throw fetchError;

        // Add member to squad
        const { error: memberError } = await supabase
          .from('squad_members')
          .insert({
            squad_id: request.squad_id,
            player_id: request.invited_player_id,
            role: 'player'
          });

        if (memberError) throw memberError;
      }

      // Update invite status
      const { error: updateError } = await supabase
        .from('squad_invites')
        .update({ status: action === 'approve' ? 'accepted' : 'declined' })
        .eq('id', requestId);

      if (updateError) throw updateError;
      
      // Refresh the squad requests
      await checkPendingSquadRequests();
      
    } catch (error) {
      console.error(`Error ${action}ing request:`, error);
    } finally {
      setProcessingRequest(null);
    }
  };

  // Navigation groups
  const squadsNavItems = [
    { href: '/squads', label: 'Squads', icon: '🛡️' },
    { href: '/free-agents', label: 'Players', icon: '🎯' },
    { href: '/matches', label: 'Match Log', icon: '⚔️' },
    { href: '/dueling', label: 'Dueling Log', icon: '🗡️' },
  ];

  const statsNavItems = [
    { href: '/stats', label: 'Player Stats', icon: '📊' },
    { href: '/stats/elo', label: 'ELO Leaderboard', icon: '🏆' },
    { href: '/event-log', label: 'Player Event Log', icon: '📋' },
  ];

  const communityNavItems = [
    { href: '/forum', label: 'Forum', icon: '💬' },
    { href: '/guides', label: 'Guides', icon: '📚' },
  ];

  const miscNavItems = [
    { href: '/champions', label: 'Hall of Champions', icon: '👑' },
    { href: '/affiliate-sites', label: 'Community Sites', icon: '🌐' },
    { href: '/logs', label: 'Chat Log Viewer', icon: '📜' },
  ];

  if (!user) {
    return (
      <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl relative z-[99998]">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/images/ctfpl1.png" alt="CTFPL" className="h-10 w-auto" />
            </Link>
            
            <div className="flex items-center space-x-4">
              <Link 
                href="/auth/login" 
                className="px-4 py-2 text-sm text-gray-400 hover:text-cyan-400 transition-colors rounded-lg border border-gray-600/40 hover:border-cyan-500/50"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl relative z-[99998]">
      {/* Top Utility Bar */}
      <div className="border-b border-gray-700/50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Left - Logo */}
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/images/ctfpl1.png" alt="CTFPL" className="h-16 w-auto" />
            </Link>

            {/* Right - Utilities */}
            <div className="flex items-center space-x-3">
              {/* Notifications */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className="relative p-2 text-gray-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-gray-800/50"
                >
                  <Bell className="w-5 h-5" />
                  {(unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0)) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {(unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0)) > 9 ? '9+' : (unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0))}
                    </span>
                  )}
                </button>

                {showNotificationDropdown && (
                  <div 
                    className="absolute left-0 sm:right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[99999] max-w-[calc(100vw-2rem)] sm:max-w-none"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="py-2">
                      <div className="px-4 py-2 border-b border-gray-600/50">
                        <h3 className="text-sm font-medium text-white">Notifications</h3>
                      </div>
                      {/* Squad Requests */}
                      {squadRequests.length > 0 && (
                        <div className="border-b border-gray-600/30">
                          <div className="px-4 py-2 bg-gray-700/50">
                            <p className="text-sm font-medium text-yellow-400">🛡️ Squad Invitations & Requests</p>
                          </div>
                          {squadRequests.map((request: any) => {
                            const isJoinRequest = request.invited_by === request.invited_player_id;
                            const isInvitation = request.invited_by !== request.invited_player_id;
                            
                            return (
                              <div key={request.id} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="text-sm font-medium text-white">
                                        {request.profiles?.in_game_alias || 'Unknown Player'}
                                      </p>
                                      {isJoinRequest && (
                                        <span className="bg-green-600/20 text-green-300 px-2 py-0.5 rounded text-xs font-medium border border-green-500/30">
                                          📥 JOIN REQUEST
                                        </span>
                                      )}
                                      {isInvitation && (
                                        <span className="bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded text-xs font-medium border border-blue-500/30">
                                          📤 INVITATION SENT
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400">
                                      {isJoinRequest ? 'Wants to join squad' : 'Pending your invitation response'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {isJoinRequest && (
                                    <>
                                      <button
                                        onClick={() => handleRequestAction(request.id, 'approve')}
                                        disabled={processingRequest === request.id}
                                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs transition-colors disabled:cursor-not-allowed"
                                      >
                                        {processingRequest === request.id ? '⏳' : '✅'} Approve
                                      </button>
                                      <button
                                        onClick={() => handleRequestAction(request.id, 'deny')}
                                        disabled={processingRequest === request.id}
                                        className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs transition-colors disabled:cursor-not-allowed"
                                      >
                                        {processingRequest === request.id ? '⏳' : '❌'} Deny
                                      </button>
                                    </>
                                  )}
                                  {isInvitation && (
                                    <button
                                      onClick={() => handleRequestAction(request.id, 'deny')}
                                      disabled={processingRequest === request.id}
                                      className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs transition-colors disabled:cursor-not-allowed"
                                      title="Cancel this invitation"
                                    >
                                      {processingRequest === request.id ? '⏳' : '🚫'} Cancel Invite
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Admin Notifications - Only for Axidus */}
                      {isAxidus && (donationNotifications.length > 0 || orderNotifications.length > 0) && (
                        <div className="border-b border-gray-600/30">
                          <div className="px-4 py-2 bg-gray-700/50">
                            <p className="text-sm font-medium text-green-400">💰 Admin Notifications</p>
                          </div>
                          
                          {/* Donation Notifications */}
                          {donationNotifications.map((donation) => (
                            <div key={`donation-${donation.id}`} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-green-400 font-bold">💰</span>
                                    <p className="text-sm font-medium text-white">
                                      New Donation: ${donation.amount}
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-400">
                                    From: {donation.donor_name || 'Anonymous'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(donation.created_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Order Notifications */}
                          {orderNotifications.map((order) => (
                            <div key={`order-${order.id}`} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-blue-400 font-bold">🛒</span>
                                    <p className="text-sm font-medium text-white">
                                      New Order: ${order.amount}
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-400">
                                    From: {order.profiles?.in_game_alias || 'User'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(order.created_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Messages */}
                      <Link 
                        href="/messages"
                        className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                        onClick={() => setShowNotificationDropdown(false)}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center">
                            <span className="text-lg mr-3">💬</span>
                            <div>
                              <p className="text-sm font-medium">Messages</p>
                              <p className="text-xs text-gray-400">
                                {unreadMessageCount > 0 
                                  ? `${unreadMessageCount} unread message${unreadMessageCount !== 1 ? 's' : ''}`
                                  : 'No new messages'
                                }
                              </p>
                            </div>
                          </div>
                          {unreadMessageCount > 0 && (
                            <span className="bg-cyan-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                              {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* Empty State */}
                      {(unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0)) === 0 && (
                        <div className="px-4 py-6 text-center text-gray-400">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No new notifications</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Donate Button */}
              <Link 
                href="/donate"
                className="px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-sm font-medium rounded-lg transition-all hover:scale-105"
              >
                💰 Donate
              </Link>

              {/* Admin Functions Dropdown */}
              {(isAdmin || isCtfAdmin || isMediaManager || isZoneAdmin) && (
                <div className="group relative" ref={adminDropdownRef}>
                  <button 
                    onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                    className="flex items-center space-x-1 px-2 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold rounded-lg transition-all duration-300 border border-red-500/30 group-hover:shadow-lg group-hover:shadow-red-500/20"
                  >
                    <span>⚙️</span>
                    <span className="hidden sm:inline">Admin</span>
                    <svg className={`w-3 h-3 transition-transform duration-300 ${showAdminDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showAdminDropdown && (
                    <div className="absolute right-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[99999] backdrop-blur-sm">
                      <div className="py-2">
                        {isAdmin && (
                          <Link 
                            href="/admin"
                            className="flex items-center px-2 py-1.5 text-gray-300 hover:text-red-400 hover:bg-gradient-to-r hover:from-red-600/10 hover:to-red-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-red-400 text-xs font-medium"
                            title="Site Administration"
                            onClick={() => setShowAdminDropdown(false)}
                          >
                            <span className="mr-2 text-red-400">🛡️</span>
                            <span>Site</span>
                          </Link>
                        )}
                        {isSiteAdmin && !isAdmin && (
                          <Link 
                            href="/site-admin"
                            className="flex items-center px-2 py-1.5 text-gray-300 hover:text-blue-400 hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-blue-400 text-xs font-medium"
                            title="Site Administration"
                            onClick={() => setShowAdminDropdown(false)}
                          >
                            <span className="mr-2 text-blue-400">👤</span>
                            <span>Site</span>
                          </Link>
                        )}
                        {(isAdmin || isZoneAdmin) && (
                          <Link 
                            href="/admin/zones"
                            className="flex items-center px-2 py-1.5 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-orange-400 text-xs font-medium"
                            title="Zone Management"
                            onClick={() => setShowAdminDropdown(false)}
                          >
                            <span className="mr-2 text-orange-400">🖥️</span>
                            <span>Zones</span>
                          </Link>
                        )}
                        {isCtfAdmin && (
                          <Link 
                            href="/admin/ctf"
                            className="flex items-center px-2 py-1.5 text-gray-300 hover:text-indigo-400 hover:bg-gradient-to-r hover:from-indigo-600/10 hover:to-indigo-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-indigo-400 text-xs font-medium"
                            title="CTF Administration"
                            onClick={() => setShowAdminDropdown(false)}
                          >
                            <span className="mr-2 text-indigo-400">⚔️</span>
                            <span>CTF</span>
                          </Link>
                        )}
                        {(isAdmin || isMediaManager || isSiteAdmin) && (
                          <Link 
                            href="/admin/videos"
                            className="flex items-center px-2 py-1.5 text-gray-300 hover:text-pink-400 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-pink-400 text-xs font-medium"
                            title="Media Management"
                            onClick={() => setShowAdminDropdown(false)}
                          >
                            <span className="mr-2 text-pink-400">🎬</span>
                            <span>Media</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Menu */}
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center space-x-2 p-1.5 hover:bg-gray-800/50 rounded-lg transition-colors"
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt="Avatar" className="w-12 h-12 sm:w-14 sm:h-14 rounded-full" />
                  ) : (
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {user.email?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[99999] max-w-[calc(100vw-2rem)] sm:max-w-none">
                    <div className="py-2">
                      <Link 
                        href="/dashboard" 
                        className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <BarChart3 className="w-4 h-4 mr-3" />
                        Dashboard
                      </Link>
                      <Link 
                        href="/profile" 
                        className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <Settings className="w-4 h-4 mr-3" />
                        Profile
                      </Link>
                      <Link 
                        href="/perks" 
                        className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <span className="text-lg mr-3">🛍️</span>
                        <span className="font-medium">Perks</span>
                      </Link>
                      <div className="border-t border-gray-600/50 mt-2"></div>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center px-4 py-2 text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="w-4 h-4 mr-3">🚪</span>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Compact Navigation Bar */}
      <div className="lg:hidden border-t border-gray-700/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-2 overflow-x-auto">
            {/* Squads */}
            <div className="group relative" ref={mobileSquadsRef}>
              <button 
                onClick={() => setShowMobileSquadsDropdown(!showMobileSquadsDropdown)}
                className="flex items-center space-x-1 px-2 py-1.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-green-600/20 hover:to-emerald-600/20 transition-all duration-300 rounded text-xs whitespace-nowrap"
              >
                <Gamepad2 className="w-3 h-3" />
                <span className="font-medium">Squads</span>
                <svg className={`w-2 h-2 transition-transform duration-300 ${showMobileSquadsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showMobileSquadsDropdown && (
                <div className="absolute left-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[99999] backdrop-blur-sm">
                  <div className="py-2">
                    {squadsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 text-xs"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setShowMobileSquadsDropdown(false);
                        }}
                      >
                        <span className="mr-2 text-sm">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="group relative" ref={mobileStatsRef}>
              <button 
                onClick={() => setShowMobileStatsDropdown(!showMobileStatsDropdown)}
                className="flex items-center space-x-1 px-2 py-1.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-blue-600/20 hover:to-indigo-600/20 transition-all duration-300 rounded text-xs whitespace-nowrap"
              >
                <BarChart3 className="w-3 h-3" />
                <span className="font-medium">Stats</span>
                <svg className={`w-2 h-2 transition-transform duration-300 ${showMobileStatsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showMobileStatsDropdown && (
                <div className="absolute left-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[99999] backdrop-blur-sm">
                  <div className="py-2">
                    {statsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 text-xs"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setShowMobileStatsDropdown(false);
                        }}
                      >
                        <span className="mr-2 text-sm">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Community */}
            <div className="group relative" ref={mobileCommunityRef}>
              <button 
                onClick={() => setShowMobileCommunityDropdown(!showMobileCommunityDropdown)}
                className="flex items-center space-x-1 px-2 py-1.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20 transition-all duration-300 rounded text-xs whitespace-nowrap"
              >
                <Users className="w-3 h-3" />
                <span className="font-medium">Community</span>
                <svg className={`w-2 h-2 transition-transform duration-300 ${showMobileCommunityDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showMobileCommunityDropdown && (
                <div className="absolute left-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[99999] backdrop-blur-sm">
                  <div className="py-2">
                    {communityNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 text-xs"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setShowMobileCommunityDropdown(false);
                        }}
                      >
                        <span className="mr-2 text-sm">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Misc */}
            <div className="group relative" ref={mobileMiscRef}>
              <button 
                onClick={() => setShowMobileMiscDropdown(!showMobileMiscDropdown)}
                className="flex items-center space-x-1 px-2 py-1.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-orange-600/20 hover:to-red-600/20 transition-all duration-300 rounded text-xs whitespace-nowrap"
              >
                <span className="text-sm">🔧</span>
                <span className="font-medium">Misc</span>
                <svg className={`w-2 h-2 transition-transform duration-300 ${showMobileMiscDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showMobileMiscDropdown && (
                <div className="absolute left-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[99999] backdrop-blur-sm">
                  <div className="py-2">
                    {miscNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-red-600/10 transition-all duration-200 text-xs"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setShowMobileMiscDropdown(false);
                        }}
                      >
                        <span className="mr-2 text-sm">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="hidden lg:block">
        <div className="container mx-auto px-4">
          <div className="flex items-center space-x-8 py-3">
            {/* Squads Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-green-600/20 hover:to-emerald-600/20 transition-all duration-300 rounded-lg border border-transparent hover:border-green-500/30 group-hover:shadow-lg group-hover:shadow-green-500/20">
                <Gamepad2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="font-semibold">Squads</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[99999] backdrop-blur-sm">
                <div className="py-3">
                  {squadsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400"
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-blue-600/20 hover:to-indigo-600/20 transition-all duration-300 rounded-lg border border-transparent hover:border-blue-500/30 group-hover:shadow-lg group-hover:shadow-blue-500/20">
                <BarChart3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="font-semibold">Stats</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[99999] backdrop-blur-sm">
                <div className="py-3">
                  {statsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400"
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Community Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20 transition-all duration-300 rounded-lg border border-transparent hover:border-purple-500/30 group-hover:shadow-lg group-hover:shadow-purple-500/20">
                <Users className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="font-semibold">Community</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[99999] backdrop-blur-sm">
                <div className="py-3">
                  {communityNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400"
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Misc Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 text-gray-300 hover:text-white bg-gradient-to-r hover:from-orange-600/20 hover:to-red-600/20 transition-all duration-300 rounded-lg border border-transparent hover:border-orange-500/30 group-hover:shadow-lg group-hover:shadow-orange-500/20">
                <span className="text-lg">🔧</span>
                <span className="font-semibold">Misc</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[99999] backdrop-blur-sm">
                <div className="py-3">
                  {miscNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400"
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-gray-800 border-t border-gray-700">
          <div className="container mx-auto px-4 py-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Navigation Sections */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Squads</h4>
                  <div className="space-y-1">
                    {squadsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Stats</h4>
                  <div className="space-y-1">
                    {statsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Community</h4>
                  <div className="space-y-1">
                    {communityNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Misc</h4>
                  <div className="space-y-1">
                    {miscNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-3 py-2 text-gray-300 hover:text-orange-400 hover:bg-gray-700 rounded transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Account</h4>
                  <div className="space-y-1">
                    <Link 
                      href="/perks" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center px-3 py-2 text-gray-300 hover:text-purple-400 hover:bg-gray-700 rounded transition-colors"
                    >
                      <span className="mr-3">🛍️</span>
                      Perks
                    </Link>
                    <Link 
                      href="/dashboard" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                    >
                      <BarChart3 className="w-4 h-4 mr-3" />
                      Dashboard
                    </Link>
                  </div>
                </div>

                {/* Admin Section - Mobile */}
                {(isAdmin || isCtfAdmin || isMediaManager || isZoneAdmin) && (
                  <div>
                    <h4 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-2">⚙️ Admin Functions</h4>
                    <div className="space-y-1">
                      {isAdmin && (
                        <Link 
                          href="/admin" 
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-3 py-2 text-gray-300 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                        >
                          <span className="mr-3 text-red-400">🛡️</span>
                          Site Admin
                        </Link>
                      )}
                      {isCtfAdmin && (
                        <Link 
                          href="/admin/ctf" 
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-3 py-2 text-gray-300 hover:text-indigo-400 hover:bg-gray-700 rounded transition-colors"
                        >
                          <span className="mr-3 text-indigo-400">⚔️</span>
                          CTF Admin
                        </Link>
                      )}
                      {(isAdmin || isMediaManager) && (
                        <Link 
                          href="/admin/videos" 
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-3 py-2 text-gray-300 hover:text-pink-400 hover:bg-gray-700 rounded transition-colors"
                        >
                          <span className="mr-3 text-pink-400">🎬</span>
                          Media
                        </Link>
                      )}
                      {(isAdmin || isZoneAdmin) && (
                        <Link 
                          href="/admin/zones" 
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-3 py-2 text-gray-300 hover:text-orange-400 hover:bg-gray-700 rounded transition-colors"
                        >
                          <span className="mr-3 text-orange-400">🖥️</span>
                          Zone Management
                        </Link>
                      )}
                      {isAdmin && (
                        <>
                          <Link 
                            href="/admin/users" 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-3 py-2 text-gray-300 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
                          >
                            <span className="mr-3 text-blue-400">👥</span>
                            Users
                          </Link>
                          <Link 
                            href="/admin/squads" 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-3 py-2 text-gray-300 hover:text-green-400 hover:bg-gray-700 rounded transition-colors"
                          >
                            <span className="mr-3 text-green-400">🛡️</span>
                            Squads
                          </Link>
                          <Link 
                            href="/admin/news" 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-3 py-2 text-gray-300 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors"
                          >
                            <span className="mr-3 text-yellow-400">📰</span>
                            News
                          </Link>
                          <Link 
                            href="/admin/donations" 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-3 py-2 text-gray-300 hover:text-emerald-400 hover:bg-gray-700 rounded transition-colors"
                          >
                            <span className="mr-3 text-emerald-400">💰</span>
                            Donations
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
} 