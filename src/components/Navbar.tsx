'use client';

import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Search, Bell, Settings, Users, Gamepad2, BarChart3, Menu, X } from 'lucide-react';

export default function Navbar({ user, onMobileMenuChange }: { user: any; onMobileMenuChange?: (isOpen: boolean) => void }) {
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
  
  // Top navigation sidebar state
  const [activeTopNavSidebar, setActiveTopNavSidebar] = useState<'notifications' | 'admin' | 'profile' | null>(null);
  
  // Navigation dropdown states
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const [showSquadsDropdown, setShowSquadsDropdown] = useState(false);
  const [showStatsDropdown, setShowStatsDropdown] = useState(false);
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [showMiscDropdown, setShowMiscDropdown] = useState(false);
  
  // Refs for navigation dropdowns
  const leagueDropdownRef = useRef<HTMLDivElement>(null);
  const squadsDropdownRef = useRef<HTMLDivElement>(null);
  const statsDropdownRef = useRef<HTMLDivElement>(null);
  const communityDropdownRef = useRef<HTMLDivElement>(null);
  const miscDropdownRef = useRef<HTMLDivElement>(null);
  
  // Mobile dropdown states - simplified to one active dropdown at a time
  const [activeMobileDropdown, setActiveMobileDropdown] = useState<string | null>(null);
  
  // Fix hydration mismatch by tracking when component has mounted
  const [hasMounted, setHasMounted] = useState(false);
  
  // Device detection for better tablet/mobile handling
  const [isTablet, setIsTablet] = useState(false);

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
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setShowNotificationDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(target)) {
        setShowUserDropdown(false);
      }
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(target)) {
        setShowAdminDropdown(false);
      }
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(target)) {
        setShowLeagueDropdown(false);
      }
      if (squadsDropdownRef.current && !squadsDropdownRef.current.contains(target)) {
        setShowSquadsDropdown(false);
      }
      if (statsDropdownRef.current && !statsDropdownRef.current.contains(target)) {
        setShowStatsDropdown(false);
      }
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(target)) {
        setShowCommunityDropdown(false);
      }
      if (miscDropdownRef.current && !miscDropdownRef.current.contains(target)) {
        setShowMiscDropdown(false);
      }
      // Close mobile dropdown when clicking outside
      setActiveMobileDropdown(null);
    };

    const handleMouseDown = (event: MouseEvent) => handleClickOutside(event);
    const handleTouchStart = (event: TouchEvent) => handleClickOutside(event);

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchstart', handleTouchStart);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  // Handle body scroll lock when mobile menu is open
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isMobileMenuOpen) {
        // Store current scroll position
        const scrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
      } else {
        // Restore scroll position
        const scrollY = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      }
      
      // Cleanup function to restore scroll when component unmounts
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
      };
    }
  }, [isMobileMenuOpen]);

  // Notify parent component when mobile menu state changes
  useEffect(() => {
    if (onMobileMenuChange) {
      onMobileMenuChange(isMobileMenuOpen);
    }
  }, [isMobileMenuOpen, onMobileMenuChange]);

  // Set mounted state and detect device type to prevent hydration mismatch
  useEffect(() => {
    setHasMounted(true);
    
    // Detect tablet/iPad more reliably
    const detectTablet = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isIPad = /ipad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroidTablet = /android/.test(userAgent) && !/mobile/.test(userAgent);
      
      // iPad Pro and tablets should use tablet navigation layout
      // Desktop navigation (1024px+) is too complex for touch devices
      return isIPad || isAndroidTablet;
    };
    
    setIsTablet(detectTablet());
    
    // Listen for resize events to update tablet detection
    const handleResize = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isIPad = /ipad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroidTablet = /android/.test(userAgent) && !/mobile/.test(userAgent);
      
      // iPad Pro and tablets should use tablet navigation layout
      // Desktop navigation is too complex for touch devices
      setIsTablet(isIPad || isAndroidTablet);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    { href: '/community/zone-interest', label: 'Zone Interest', icon: '🎯' },
  ];

  const miscNavItems = [
    { href: '/champions', label: 'Hall of Champions', icon: '👑' },
    { href: '/affiliate-sites', label: 'Community Sites', icon: '🌐' },
    { href: '/logs', label: 'Chat Log Viewer', icon: '📜' },
  ];


  return (
    <>
      {/* Mobile slide-out panel overlay */}
      {activeMobileDropdown && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm"
          onClick={() => setActiveMobileDropdown(null)}
        >
          <div 
            className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-gray-800 border-l border-gray-600/50 shadow-2xl transform transition-transform duration-300 ease-out ${
              activeMobileDropdown ? 'translate-x-0' : 'translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-600/50">
                <h3 className="text-lg font-medium text-white capitalize">{activeMobileDropdown}</h3>
                <button
                  onClick={() => setActiveMobileDropdown(null)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {activeMobileDropdown === 'league' && (
                  <div className="py-2">
                    <Link
                      href="/league/ctfpl"
                      className="flex items-center px-6 py-4 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-cyan-600/20 border-l-2 border-transparent hover:border-cyan-400"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveMobileDropdown(null);
                        setIsMobileMenuOpen(false);
                        // Use Next.js router to navigate
                        window.location.href = '/league/ctfpl';
                      }}
                    >
                      <span className="mr-4 text-xl">⚔️</span>
                      <span className="font-medium text-base">CTFPL</span>
                    </Link>
                    <Link
                      href="/"
                      className="flex items-center px-6 py-4 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-cyan-600/20 border-l-2 border-transparent hover:border-cyan-400"
                      onClick={() => {
                        setActiveMobileDropdown(null);
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      <span className="mr-4 text-xl">🛡️</span>
                      <span className="font-medium text-base">CTFDL</span>
                    </Link>
                  </div>
                )}
                {activeMobileDropdown === 'squads' && (
                  <div className="py-2">
                    {squadsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-cyan-600/20 border-l-2 border-transparent hover:border-cyan-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl">{item.icon}</span>
                        <span className="font-medium text-base">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {activeMobileDropdown === 'stats' && (
                  <div className="py-2">
                    {statsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-cyan-600/20 border-l-2 border-transparent hover:border-cyan-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl">{item.icon}</span>
                        <span className="font-medium text-base">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {activeMobileDropdown === 'community' && (
                  <div className="py-2">
                    {communityNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-cyan-600/20 border-l-2 border-transparent hover:border-cyan-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl">{item.icon}</span>
                        <span className="font-medium text-base">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {activeMobileDropdown === 'misc' && (
                  <div className="py-2">
                    {miscNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-red-600/10 transition-all duration-200 active:bg-orange-600/20 border-l-2 border-transparent hover:border-orange-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl">{item.icon}</span>
                        <span className="font-medium text-base">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {activeMobileDropdown === 'admin' && (
                  <div className="py-2">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-red-400 hover:bg-gradient-to-r hover:from-red-600/10 hover:to-red-600/10 transition-all duration-200 active:bg-red-600/20 border-l-2 border-transparent hover:border-red-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl text-red-400">🛡️</span>
                        <span className="font-medium text-base">Site</span>
                      </Link>
                    )}
                    {isSiteAdmin && !isAdmin && (
                      <Link
                        href="/site-admin"
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-blue-400 hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-blue-600/10 transition-all duration-200 active:bg-blue-600/20 border-l-2 border-transparent hover:border-blue-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl text-blue-400">👤</span>
                        <span className="font-medium text-base">Site</span>
                      </Link>
                    )}
                    {(isAdmin || isZoneAdmin) && (
                      <Link
                        href="/admin/zones"
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 active:bg-orange-600/20 border-l-2 border-transparent hover:border-orange-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl text-orange-400">🖥️</span>
                        <span className="font-medium text-base">Zones</span>
                      </Link>
                    )}
                    {isCtfAdmin && (
                      <Link
                        href="/admin/ctf"
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-indigo-400 hover:bg-gradient-to-r hover:from-indigo-600/10 hover:to-indigo-600/10 transition-all duration-200 active:bg-indigo-600/20 border-l-2 border-transparent hover:border-indigo-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl text-indigo-400">⚔️</span>
                        <span className="font-medium text-base">CTF</span>
                      </Link>
                    )}
                    {(isAdmin || isMediaManager || isSiteAdmin) && (
                      <Link
                        href="/admin/videos"
                        className="flex items-center px-6 py-4 text-gray-300 hover:text-pink-400 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 transition-all duration-200 active:bg-pink-600/20 border-l-2 border-transparent hover:border-pink-400"
                        onClick={() => {
                          setActiveMobileDropdown(null);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <span className="mr-4 text-xl text-pink-400">🎬</span>
                        <span className="font-medium text-base">Media</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation Sidebar */}
      {activeTopNavSidebar && (
        <div 
          className="fixed inset-0 z-[100000] bg-black/20 backdrop-blur-sm"
          onClick={() => setActiveTopNavSidebar(null)}
        >
          <div 
            className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-gray-800 border-l border-gray-600/50 shadow-2xl transform transition-transform duration-300 ease-out ${
              activeTopNavSidebar ? 'translate-x-0' : 'translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-600/50">
                <h3 className="text-lg font-medium text-white capitalize">
                  {activeTopNavSidebar === 'notifications' && 'Notifications'}
                  {activeTopNavSidebar === 'admin' && 'Admin Functions'}
                  {activeTopNavSidebar === 'profile' && 'Profile Menu'}
                </h3>
                <button
                  onClick={() => setActiveTopNavSidebar(null)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTopNavSidebar === 'notifications' && (
                  <div className="py-2">
                    {/* Squad Requests */}
                    {squadRequests.length > 0 && (
                      <div className="border-b border-gray-600/30">
                        <div className="px-4 py-2 bg-gray-700/50">
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Squad Requests</h4>
                        </div>
                        {squadRequests.map((request) => (
                          <div key={request.id} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-medium text-white">
                                    {request.profiles?.in_game_alias || 'Unknown Player'}
                                  </p>
                                  <span className="text-xs text-gray-400">wants to join</span>
                                  <span className="text-xs font-medium text-cyan-400">
                                    {request.squads?.name || 'Squad'}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400">
                                  {request.message || 'No message provided'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(request.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRequestAction(request.id, 'approve')}
                                disabled={processingRequest === request.id}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                              >
                                {processingRequest === request.id ? 'Processing...' : 'Accept'}
                              </button>
                              <button
                                onClick={() => handleRequestAction(request.id, 'deny')}
                                disabled={processingRequest === request.id}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Messages */}
                    {unreadMessageCount > 0 && (
                      <div className="border-b border-gray-600/30">
                        <div className="px-4 py-2 bg-gray-700/50">
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Messages</h4>
                        </div>
                        <Link 
                          href="/messages"
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
                          onClick={() => setActiveTopNavSidebar(null)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600/20 rounded-lg">
                              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{unreadMessageCount} Unread Messages</p>
                              <p className="text-xs text-gray-400">Click to view all messages</p>
                            </div>
                          </div>
                          <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {unreadMessageCount}
                          </span>
                        </Link>
                      </div>
                    )}

                    {/* Admin Notifications */}
                    {isAxidus && (orderNotifications.length > 0 || donationNotifications.length > 0) && (
                      <div>
                        <div className="px-4 py-2 bg-gray-700/50">
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</h4>
                        </div>
                        {orderNotifications.slice(0, 3).map((order) => (
                          <Link 
                            key={order.id}
                            href="/admin/orders"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-600/20 last:border-b-0"
                            onClick={() => setActiveTopNavSidebar(null)}
                          >
                            <div className="p-2 bg-green-600/20 rounded-lg">
                              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">New Order</p>
                              <p className="text-xs text-gray-400">${order.total_amount}</p>
                            </div>
                          </Link>
                        ))}
                        {donationNotifications.slice(0, 3).map((donation) => (
                          <Link 
                            key={donation.id}
                            href="/admin/donations"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-600/20 last:border-b-0"
                            onClick={() => setActiveTopNavSidebar(null)}
                          >
                            <div className="p-2 bg-yellow-600/20 rounded-lg">
                              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">New Donation</p>
                              <p className="text-xs text-gray-400">${donation.amount}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* No Notifications */}
                    {squadRequests.length === 0 && unreadMessageCount === 0 && (!isAxidus || (orderNotifications.length === 0 && donationNotifications.length === 0)) && (
                      <div className="px-4 py-8 text-center">
                        <svg className="w-12 h-12 text-gray-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-5 5v-5zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-gray-400 text-sm">No notifications</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTopNavSidebar === 'admin' && (
                  <div className="py-2">
                    {isAdmin && (
                      <Link 
                        href="/admin"
                        className="flex items-center px-4 py-3 text-gray-300 hover:text-red-400 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setActiveTopNavSidebar(null)}
                      >
                        <span className="mr-3 text-red-400">🛡️</span>
                        <span>Site Administration</span>
                      </Link>
                    )}
                    {(isAdmin || isZoneAdmin) && (
                      <Link 
                        href="/admin/zones"
                        className="flex items-center px-4 py-3 text-gray-300 hover:text-orange-400 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setActiveTopNavSidebar(null)}
                      >
                        <span className="mr-3 text-orange-400">🖥️</span>
                        <span>Zone Management</span>
                      </Link>
                    )}
                    {isCtfAdmin && (
                      <Link 
                        href="/admin/ctf"
                        className="flex items-center px-4 py-3 text-gray-300 hover:text-indigo-400 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setActiveTopNavSidebar(null)}
                      >
                        <span className="mr-3 text-indigo-400">⚔️</span>
                        <span>CTF Administration</span>
                      </Link>
                    )}
                    {(isAdmin || isMediaManager) && (
                      <Link 
                        href="/admin/videos"
                        className="flex items-center px-4 py-3 text-gray-300 hover:text-pink-400 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setActiveTopNavSidebar(null)}
                      >
                        <span className="mr-3 text-pink-400">📽️</span>
                        <span>Video Management</span>
                      </Link>
                    )}
                  </div>
                )}

                {activeTopNavSidebar === 'profile' && (
                  <div className="py-2">
                    <Link 
                      href="/dashboard" 
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700/50 transition-colors"
                      onClick={() => setActiveTopNavSidebar(null)}
                    >
                      <span className="mr-3">📊</span>
                      Dashboard
                    </Link>
                    <Link 
                      href="/profile" 
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700/50 transition-colors"
                      onClick={() => setActiveTopNavSidebar(null)}
                    >
                      <span className="mr-3">⚙️</span>
                      Profile
                    </Link>
                    <Link 
                      href="/perks" 
                      className="flex items-center px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700/50 transition-colors"
                      onClick={() => setActiveTopNavSidebar(null)}
                    >
                      <span className="mr-3">🛍️</span>
                      Perks
                    </Link>
                    <button 
                      onClick={handleSignOut}
                      className="w-full flex items-center px-4 py-3 text-gray-300 hover:text-red-400 hover:bg-gray-700/50 transition-colors text-left"
                    >
                      <span className="mr-3">🚪</span>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="sticky top-0 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl z-[50000]">
        {/* Top Utility Bar */}
        <div className="border-b border-gray-700/50">
          <div className="container mx-auto px-4 py-2">
            {/* Mobile Layout - Logo on its own line */}
            <div className="block lg:hidden">
              <div className="flex justify-center mb-3">
                <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                  <img src="https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/logos/CTFPLLogo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJsb2dvcy9DVEZQTExvZ28ucG5nIiwiaWF0IjoxNzUzMDczNjQ4LCJleHAiOjIzODM3OTM2NDh9.MujhBviIAsu6A4U274jkP-IgUhtD0uZxaBpCUQBnPCI" alt="CTFPL" className="h-14 w-auto" />
                </Link>
              </div>
              {/* Mobile - Utilities below logo */}
              <div className="flex items-center justify-center space-x-3">
                {/* Notifications - Only show for authenticated users */}
                {user && (
                  <div className="relative" ref={notificationRef}>
                    <button
                      onClick={() => setActiveTopNavSidebar('notifications')}
                      className="relative p-2 text-gray-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-gray-800/50"
                    >
                      <Bell className="w-4 h-4" />
                      {(unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0)) > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                          {(unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0)) > 9 ? '9+' : (unreadMessageCount + pendingSquadRequests + (isAxidus ? orderNotifications.length + donationNotifications.length : 0))}
                        </span>
                      )}
                    </button>

                    {showNotificationDropdown && (
                      <div 
                        className="fixed xl:absolute top-4 xl:top-full xl:mt-1 left-1/2 xl:left-0 transform -translate-x-1/2 xl:translate-x-0 w-80 xl:w-72 max-w-[calc(100vw-2rem)] xl:max-w-none bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[999999]"
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
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Squad Requests</h4>
                              </div>
                              {squadRequests.map((request) => (
                                <div key={request.id} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-medium text-white">
                                          {request.profiles?.in_game_alias || 'Unknown Player'}
                                        </p>
                                        <span className="text-xs text-gray-400">
                                          wants to join
                                        </span>
                                        <span className="text-xs font-medium text-cyan-400">
                                          {request.squads?.name || 'Squad'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-400">
                                        {request.message || 'No message provided'}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {new Date(request.created_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleRequestAction(request.id, 'approve')}
                                      disabled={processingRequest === request.id}
                                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                                    >
                                      {processingRequest === request.id ? 'Processing...' : 'Accept'}
                                    </button>
                                    <button
                                      onClick={() => handleRequestAction(request.id, 'deny')}
                                      disabled={processingRequest === request.id}
                                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Messages */}
                          {unreadMessageCount > 0 && (
                            <div className="border-b border-gray-600/30">
                              <div className="px-4 py-2 bg-gray-700/50">
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Messages</h4>
                              </div>
                              <Link 
                                href="/messages"
                                className="flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
                                onClick={() => setShowNotificationDropdown(false)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-blue-600/20 rounded-lg">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-white">{unreadMessageCount} Unread Messages</p>
                                    <p className="text-xs text-gray-400">Click to view all messages</p>
                                  </div>
                                </div>
                                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                  {unreadMessageCount}
                                </span>
                              </Link>
                            </div>
                          )}
                          {/* Admin Notifications */}
                          {isAxidus && (orderNotifications.length > 0 || donationNotifications.length > 0) && (
                            <div>
                              <div className="px-4 py-2 bg-gray-700/50">
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</h4>
                              </div>
                              {orderNotifications.slice(0, 3).map((order) => (
                                <Link 
                                  key={order.id}
                                  href="/admin/orders"
                                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-600/20 last:border-b-0"
                                  onClick={() => setShowNotificationDropdown(false)}
                                >
                                  <div className="p-2 bg-green-600/20 rounded-lg">
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-white">New Order</p>
                                    <p className="text-xs text-gray-400">${order.total_amount}</p>
                                  </div>
                                </Link>
                              ))}
                              {donationNotifications.slice(0, 3).map((donation) => (
                                <Link 
                                  key={donation.id}
                                  href="/admin/donations"
                                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-600/20 last:border-b-0"
                                  onClick={() => setShowNotificationDropdown(false)}
                                >
                                  <div className="p-2 bg-yellow-600/20 rounded-lg">
                                    <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-white">New Donation</p>
                                    <p className="text-xs text-gray-400">${donation.amount}</p>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                          {/* No Notifications */}
                          {squadRequests.length === 0 && unreadMessageCount === 0 && (!isAxidus || (orderNotifications.length === 0 && donationNotifications.length === 0)) && (
                            <div className="px-4 py-8 text-center">
                              <svg className="w-12 h-12 text-gray-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-5 5v-5zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-gray-400 text-sm">No notifications</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Donate Button */}
                <Link 
                  href="/donate"
                  className="px-2 py-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-medium rounded-lg transition-all hover:scale-105"
                >
                  💰
                </Link>

                {/* Admin Functions - Mobile */}
                {(isAdmin || isCtfAdmin || isMediaManager || isZoneAdmin) && (
                  <div className="relative" ref={adminDropdownRef}>
                    <button 
                      onClick={() => setActiveTopNavSidebar('admin')}
                      className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold rounded-lg transition-all duration-300 border border-red-500/30"
                    >
                      <span>⚙️</span>
                    </button>

                    {showAdminDropdown && (
                      <div className="fixed xl:absolute top-4 xl:top-full xl:mt-1 left-1/2 xl:left-0 transform -translate-x-1/2 xl:translate-x-0 w-80 xl:w-64 max-w-[calc(100vw-2rem)] xl:max-w-none bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-[999999] backdrop-blur-sm">
                        <div className="py-2">
                          {isAdmin && (
                            <Link 
                              href="/admin"
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-red-400 hover:bg-gradient-to-r hover:from-red-600/10 hover:to-red-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-red-400 text-sm font-medium"
                              title="Site Administration"
                              onClick={() => setShowAdminDropdown(false)}
                            >
                              <span className="mr-3 text-red-400">🛡️</span>
                              <span>Site</span>
                            </Link>
                          )}
                          {(isAdmin || isZoneAdmin) && (
                            <Link 
                              href="/admin/zones"
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-orange-400 text-sm font-medium"
                              title="Zone Management"
                              onClick={() => setShowAdminDropdown(false)}
                            >
                              <span className="mr-3 text-orange-400">🖥️</span>
                              <span>Zones</span>
                            </Link>
                          )}
                          {isCtfAdmin && (
                            <Link 
                              href="/admin/ctf"
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-indigo-400 hover:bg-gradient-to-r hover:from-indigo-600/10 hover:to-indigo-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-indigo-400 text-sm font-medium"
                              title="CTF Administration"
                              onClick={() => setShowAdminDropdown(false)}
                            >
                              <span className="mr-3 text-indigo-400">⚔️</span>
                              <span>CTF</span>
                            </Link>
                          )}
                          {(isAdmin || isMediaManager) && (
                            <Link 
                              href="/admin/videos"
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-pink-400 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-pink-400 text-sm font-medium"
                              title="Video Management"
                              onClick={() => setShowAdminDropdown(false)}
                            >
                              <span className="mr-3 text-pink-400">📽️</span>
                              <span>Videos</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* User Menu - Mobile */}
                {hasMounted ? (
                  user ? (
                    <div className="relative" ref={userDropdownRef}>
                      <button
                        onClick={() => setActiveTopNavSidebar('profile')}
                        className="flex items-center space-x-2 p-1 hover:bg-gray-800/50 rounded-lg transition-colors"
                      >
                        {userAvatar ? (
                          <img src={userAvatar} alt="Avatar" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">
                              {user.email?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                      </button>

                      {showUserDropdown && (
                        <div className="fixed xl:absolute top-4 xl:top-full xl:mt-1 right-1/2 xl:right-0 transform translate-x-1/2 xl:translate-x-0 w-80 xl:w-48 max-w-[calc(100vw-2rem)] xl:max-w-none bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[999999]">
                          <div className="py-2">
                            <Link 
                              href="/dashboard" 
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                              onClick={() => setShowUserDropdown(false)}
                            >
                              <span className="mr-3">📊</span>
                              Dashboard
                            </Link>
                            <Link 
                              href="/profile" 
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                              onClick={() => setShowUserDropdown(false)}
                            >
                              <span className="mr-3">⚙️</span>
                              Profile
                            </Link>
                            <Link 
                              href="/perks" 
                              className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                              onClick={() => setShowUserDropdown(false)}
                            >
                              <span className="mr-3">🛍️</span>
                              Perks
                            </Link>
                            <button 
                              onClick={handleSignOut}
                              className="w-full flex items-center px-4 py-2 text-gray-300 hover:text-red-400 hover:bg-gray-700 transition-colors text-left"
                            >
                              <span className="mr-3">🚪</span>
                              Sign Out
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      href="/auth/login"
                      className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium rounded-lg transition-all"
                    >
                      Sign In
                    </Link>
                  )
                ) : (
                  <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse"></div>
                )}
              </div>
            </div>
            
            {/* Desktop Layout - Logo on left, utilities on right */}
            <div className="hidden lg:flex items-center justify-between">
              {/* Left - Logo */}
              <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                <img src="https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/sign/logos/CTFPLLogo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kNTg4NTc2Ny1kZGJlLTQ1ODQtYjIwZS05YmJkYTMzMTMzMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJsb2dvcy9DVEZQTExvZ28ucG5nIiwiaWF0IjoxNzUzMDczNjQ4LCJleHAiOjIzODM3OTM2NDh9.MujhBviIAsu6A4U274jkP-IgUhtD0uZxaBpCUQBnPCI" alt="CTFPL" className="h-16 w-auto" />
              </Link>

              {/* Right - Utilities */}
              <div className="flex items-center space-x-3">
              {/* Notifications - Only show for authenticated users */}
              {user && (
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
                    className="fixed lg:absolute left-0 top-20 lg:top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[999999] max-w-[calc(100vw-2rem)] sm:max-w-none"
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
              )}

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
                    <div className="fixed lg:absolute right-0 top-20 lg:top-full mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl z-[999999] backdrop-blur-sm">
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
              {hasMounted ? (
                user ? (
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
                          {user.email?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </button>

                {showUserDropdown && (
                  <div className="fixed lg:absolute right-0 top-20 lg:top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[999999] max-w-[calc(100vw-2rem)] sm:max-w-none">
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
                ) : (
                  /* Login/Register Button for non-authenticated users */
                  <Link
                    href="/auth/login"
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium rounded-lg transition-all"
                  >
                    Sign In
                  </Link>
                )
              ) : (
                /* Placeholder during hydration to prevent layout shift */
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-700 rounded-full animate-pulse"></div>
              )}

              {/* Mobile Menu Button - Only show on small screens */}
              {hasMounted && !isTablet && (
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              )}
              </div>
            </div>
          </div>
        </div>

      {/* Tablet Navigation - Show on tablets only */}
      {hasMounted && isTablet && (
      <div className="border-t border-gray-700/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center py-3 space-x-4 overflow-x-auto">
            {/* News */}
            <Link 
              href="/"
              className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-yellow-600/10 text-yellow-400 hover:text-yellow-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-yellow-500 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/20 whitespace-nowrap"
            >
              <span className="text-base">📰</span>
              <span className="font-medium">News</span>
            </Link>

            {/* League */}
            <div className="relative" ref={leagueDropdownRef}>
              <button 
                onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
                className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-cyan-600/10 text-cyan-400 hover:text-cyan-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-cyan-500 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20 whitespace-nowrap"
              >
                <span className="text-base">🏆</span>
                <span className="font-medium">League</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showLeagueDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showLeagueDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <div className="py-2">
                  <Link
                    href="/league/ctfpl"
                    className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                  >
                    <span className="mr-2 text-cyan-400">⚔️</span>
                    <span>CTFPL</span>
                  </Link>
                  <Link
                    href="/"
                    className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                  >
                    <span className="mr-2 text-cyan-400">🛡️</span>
                    <span>CTFDL</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Squads */}
            <div className="relative" ref={squadsDropdownRef}>
              <button 
                onClick={() => setShowSquadsDropdown(!showSquadsDropdown)}
                className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-green-600/10 text-green-400 hover:text-green-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-green-500 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20 whitespace-nowrap"
              >
                <span className="text-base">🛡️</span>
                <span className="font-medium">Squads</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showSquadsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showSquadsDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <div className="py-2">
                  {squadsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-green-400 hover:bg-gradient-to-r hover:from-green-600/10 hover:to-green-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-green-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-green-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="relative" ref={statsDropdownRef}>
              <button 
                onClick={() => setShowStatsDropdown(!showStatsDropdown)}
                className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-blue-600/10 text-blue-400 hover:text-blue-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-blue-500 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20 whitespace-nowrap"
              >
                <span className="text-base">📊</span>
                <span className="font-medium">Stats</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showStatsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showStatsDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <div className="py-2">
                  {statsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-blue-400 hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-blue-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-blue-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Community */}
            <div className="relative" ref={communityDropdownRef}>
              <button 
                onClick={() => setShowCommunityDropdown(!showCommunityDropdown)}
                className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-purple-600/10 text-purple-400 hover:text-purple-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-purple-500 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20 whitespace-nowrap"
              >
                <span className="text-base">👥</span>
                <span className="font-medium">Community</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showCommunityDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showCommunityDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <div className="py-2">
                  {communityNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-purple-400 hover:bg-gradient-to-r hover:from-purple-600/10 hover:to-purple-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-purple-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-purple-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Misc */}
            <div className="relative" ref={miscDropdownRef}>
              <button 
                onClick={() => setShowMiscDropdown(!showMiscDropdown)}
                className="flex items-center space-x-2 px-3 py-2 bg-transparent hover:bg-orange-600/10 text-orange-400 hover:text-orange-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-orange-500 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/20 whitespace-nowrap"
              >
                <span className="text-base">🔧</span>
                <span className="font-medium">Misc</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showMiscDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showMiscDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <div className="py-2">
                  {miscNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-orange-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-orange-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      )}

      {/* Mobile Navigation Bar - Show on small screens only (not tablets, not desktop) */}
      {hasMounted && !isTablet && (
        <div className="border-t border-gray-700/50 lg:hidden">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between py-2 overflow-x-auto">
              {/* News */}
              <Link 
                href="/"
                className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-yellow-600/10 text-yellow-400 hover:text-yellow-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-yellow-500 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/20"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-sm">📰</span>
                <span className="font-medium">News</span>
              </Link>

              {/* League */}
              <div className="relative" ref={leagueDropdownRef}>
                <button 
                  onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
                  className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-cyan-600/10 text-cyan-400 hover:text-cyan-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-cyan-500 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
                >
                  <span className="text-sm">🏆</span>
                  <span className="font-medium">League</span>
                  <svg className={`w-3 h-3 transition-transform duration-300 ${showLeagueDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showLeagueDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <div className="py-2">
                    <Link
                      href="/league/ctfpl"
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-cyan-400">⚔️</span>
                      <span>CTFPL</span>
                    </Link>
                    <Link
                      href="/"
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-cyan-400">🛡️</span>
                      <span>CTFDL</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Squads */}
              <div className="relative" ref={squadsDropdownRef}>
                <button 
                  onClick={() => setShowSquadsDropdown(!showSquadsDropdown)}
                  className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-green-600/10 text-green-400 hover:text-green-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-green-500 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20"
                >
                  <Gamepad2 className="w-3 h-3" />
                  <span className="font-medium">Squads</span>
                  <svg className={`w-3 h-3 transition-transform duration-300 ${showSquadsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showSquadsDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <div className="py-2">
                    {squadsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-2 py-1.5 text-gray-300 hover:text-green-400 hover:bg-gradient-to-r hover:from-green-600/10 hover:to-green-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-green-400 text-xs font-medium"
                      >
                        <span className="mr-2 text-green-400">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="relative" ref={statsDropdownRef}>
                <button 
                  onClick={() => setShowStatsDropdown(!showStatsDropdown)}
                  className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-blue-600/10 text-blue-400 hover:text-blue-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-blue-500 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <BarChart3 className="w-3 h-3" />
                  <span className="font-medium">Stats</span>
                  <svg className={`w-3 h-3 transition-transform duration-300 ${showStatsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showStatsDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <div className="py-2">
                    {statsNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-2 py-1.5 text-gray-300 hover:text-blue-400 hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-blue-400 text-xs font-medium"
                      >
                        <span className="mr-2 text-blue-400">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Community */}
              <div className="relative" ref={communityDropdownRef}>
                <button 
                  onClick={() => setShowCommunityDropdown(!showCommunityDropdown)}
                  className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-purple-600/10 text-purple-400 hover:text-purple-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-purple-500 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20"
                >
                  <Users className="w-3 h-3" />
                  <span className="font-medium">Community</span>
                  <svg className={`w-3 h-3 transition-transform duration-300 ${showCommunityDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showCommunityDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <div className="py-2">
                    {communityNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-2 py-1.5 text-gray-300 hover:text-purple-400 hover:bg-gradient-to-r hover:from-purple-600/10 hover:to-purple-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-purple-400 text-xs font-medium"
                      >
                        <span className="mr-2 text-purple-400">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Misc */}
              <div className="relative" ref={miscDropdownRef}>
                <button 
                  onClick={() => setShowMiscDropdown(!showMiscDropdown)}
                  className="flex items-center space-x-1 px-2 py-1.5 bg-transparent hover:bg-orange-600/10 text-orange-400 hover:text-orange-300 text-xs font-bold rounded-lg transition-all duration-300 border-2 border-orange-500 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/20"
                >
                  <span className="text-sm">🔧</span>
                  <span className="font-medium">Misc</span>
                  <svg className={`w-3 h-3 transition-transform duration-300 ${showMiscDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`fixed xl:absolute top-20 xl:top-full xl:mt-1 left-0 mt-1 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl transition-all duration-300 z-[999999] backdrop-blur-sm ${showMiscDropdown ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <div className="py-2">
                    {miscNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center px-2 py-1.5 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-orange-400 text-xs font-medium"
                      >
                        <span className="mr-2 text-orange-400">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Bar - Desktop only (not tablets) */}
      {hasMounted && !isTablet && (
      <div className="hidden lg:block">
        <div className="container mx-auto px-4">
          <div className="flex items-center space-x-8 py-3">
            {/* News Section */}
            <div className="relative">
              <Link 
                href="/"
                className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-yellow-600/10 text-yellow-400 hover:text-yellow-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-yellow-500 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/20"
              >
                <span className="text-lg">📰</span>
                <span className="font-semibold">News</span>
              </Link>
            </div>

            {/* League Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-cyan-600/10 text-cyan-400 hover:text-cyan-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-cyan-500 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20">
                <span className="text-lg">🏆</span>
                <span className="font-semibold">League</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] backdrop-blur-sm">
                <div className="py-2">
                  <Link
                    href="/league/ctfpl"
                    className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                  >
                    <span className="mr-2 text-cyan-400">⚔️</span>
                    <span>CTFPL</span>
                  </Link>
                  <Link
                    href="/"
                    className="flex items-center px-2 py-1.5 text-gray-300 hover:text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-cyan-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-cyan-400 text-xs font-medium"
                  >
                    <span className="mr-2 text-cyan-400">🛡️</span>
                    <span>CTFDL</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Squads Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-green-600/10 text-green-400 hover:text-green-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-green-500 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20">
                <Gamepad2 className="w-4 h-4" />
                <span className="font-semibold">Squads</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] backdrop-blur-sm">
                <div className="py-2">
                  {squadsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-green-400 hover:bg-gradient-to-r hover:from-green-600/10 hover:to-green-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-green-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-green-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-blue-600/10 text-blue-400 hover:text-blue-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-blue-500 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20">
                <BarChart3 className="w-4 h-4" />
                <span className="font-semibold">Stats</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] backdrop-blur-sm">
                <div className="py-2">
                  {statsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-blue-400 hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-blue-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-blue-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-blue-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Community Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-purple-600/10 text-purple-400 hover:text-purple-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-purple-500 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20">
                <Users className="w-4 h-4" />
                <span className="font-semibold">Community</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] backdrop-blur-sm">
                <div className="py-2">
                  {communityNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-purple-400 hover:bg-gradient-to-r hover:from-purple-600/10 hover:to-purple-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-purple-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-purple-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Misc Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-4 py-2.5 bg-transparent hover:bg-orange-600/10 text-orange-400 hover:text-orange-300 text-sm font-bold rounded-lg transition-all duration-300 border-2 border-orange-500 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/20">
                <span className="text-lg">🔧</span>
                <span className="font-semibold">Misc</span>
                <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 max-w-[calc(100vw-2rem)] sm:max-w-xs border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] backdrop-blur-sm">
                <div className="py-2">
                  {miscNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-2 py-1.5 text-gray-300 hover:text-orange-400 hover:bg-gradient-to-r hover:from-orange-600/10 hover:to-orange-600/10 transition-all duration-200 border-l-2 border-transparent hover:border-orange-400 text-xs font-medium"
                    >
                      <span className="mr-2 text-orange-400">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </nav>

    {/* Mobile Menu Modal - Only show on small screens */}
      {isMobileMenuOpen && hasMounted && !isTablet && (
        <div className="fixed inset-0 z-[999999] flex flex-col" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          
          {/* Menu Content */}
          <div className="relative bg-gray-800 border-b border-gray-700 max-h-screen overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="container mx-auto px-4 py-4">
            <div className="space-y-4">
              {/* Close Button */}
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Navigation</h3>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

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
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Main</h4>
                  <div className="space-y-1">
                    <Link
                      href="/"
                      className="flex items-center px-3 py-2 text-gray-300 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="mr-3">📰</span>
                      News
                    </Link>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">League</h4>
                  <div className="space-y-1">
                    <Link
                      href="/league/ctfpl"
                      className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="mr-3">⚔️</span>
                      CTFPL
                    </Link>
                    <Link
                      href="/"
                      className="flex items-center px-3 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="mr-3">🛡️</span>
                      CTFDL
                    </Link>
                  </div>
                </div>

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
        </div>
      )}
    </>
  );
} 