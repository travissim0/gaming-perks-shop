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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingSquadRequests, setPendingSquadRequests] = useState(0);
  const [squadRequests, setSquadRequests] = useState<any[]>([]);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

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

      // Get pending join requests TO these squads (self-requests where someone wants to join)
      const { data: allRequests, error: requestsError } = await supabase
        .from('squad_invites')
        .select('id, invited_by, invited_player_id, squad_id, profiles!squad_invites_invited_player_id_fkey(in_game_alias)')
        .in('squad_id', squadIds)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (requestsError) throw requestsError;

      // Filter to only self-requests (where invited_by = invited_player_id)
      const requests = allRequests?.filter(request => 
        request.invited_by === request.invited_player_id
      ) || [];

      if (!requestsError && requests) {
        setPendingSquadRequests(requests.length);
        setSquadRequests(requests);
      }
    } catch (error) {
      console.error('Error checking pending squad requests:', error);
    }
  };

  useEffect(() => {
    const checkUserData = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin, ctf_role, is_media_manager, avatar_url')
          .eq('id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
        setIsCtfAdmin(profile?.is_admin || profile?.ctf_role === 'ctf_admin');
        setIsMediaManager(profile?.is_media_manager || false);
        setUserAvatar(profile?.avatar_url || null);

        // Also check for pending squad requests
        await checkPendingSquadRequests();
      } catch (error) {
        console.error('Error checking user data:', error);
      }
    };

    checkUserData();

    // Set up interval to check for new squad requests every 30 seconds
    const interval = setInterval(checkPendingSquadRequests, 30000);
    
    return () => clearInterval(interval);
  }, [user]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
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
    { href: '/free-agents', label: 'Free Agents', icon: '🎯' },
    { href: '/matches', label: 'Match Log', icon: '⚔️' },
    { href: '/dueling', label: 'Dueling Log', icon: '🗡️' },
  ];

  const statsNavItems = [
    { href: '/stats', label: 'Player Stats', icon: '📊' },
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
      <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl">
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
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl">
      {/* Top Utility Bar */}
      <div className="border-b border-gray-700/50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Left - Logo */}
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/images/ctfpl1.png" alt="CTFPL" className="h-8 w-auto" />
            </Link>

            {/* Center - Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search players, squads, matches..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-gray-800"
                />
              </div>
            </div>

            {/* Right - Utilities */}
            <div className="flex items-center space-x-3">
              {/* Notifications */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className="relative p-2 text-gray-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-gray-800/50"
                >
                  <Bell className="w-5 h-5" />
                  {(unreadMessageCount + pendingSquadRequests) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {(unreadMessageCount + pendingSquadRequests) > 9 ? '9+' : (unreadMessageCount + pendingSquadRequests)}
                    </span>
                  )}
                </button>

                {showNotificationDropdown && (
                  <div 
                    className="absolute left-0 sm:right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[100] max-w-[calc(100vw-2rem)] sm:max-w-none"
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
                            <p className="text-sm font-medium text-yellow-400">🛡️ Squad Join Requests</p>
                          </div>
                          {squadRequests.map((request) => (
                            <div key={request.id} className="px-4 py-3 border-b border-gray-600/20 last:border-b-0">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    {request.profiles?.in_game_alias || 'Unknown Player'}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    Wants to join squad
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
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
                      {(unreadMessageCount + pendingSquadRequests) === 0 && (
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

              {/* Admin Quick Access */}
              {(isAdmin || isCtfAdmin || isMediaManager) && (
                <div className="flex items-center space-x-2">
                  {isAdmin && (
                    <Link 
                      href="/admin"
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition-all"
                    >
                      ADMIN
                    </Link>
                  )}
                  {isCtfAdmin && (
                    <Link 
                      href="/admin/ctf"
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-all"
                    >
                      CTF
                    </Link>
                  )}
                  {(isAdmin || isMediaManager) && (
                    <Link 
                      href="/admin/videos"
                      className="px-2 py-1 bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold rounded transition-all"
                    >
                      MEDIA
                    </Link>
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
                    <img src={userAvatar} alt="Avatar" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {user.email?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[100] max-w-[calc(100vw-2rem)] sm:max-w-none">
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
                className="md:hidden p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="hidden md:block">
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
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] backdrop-blur-sm">
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
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] backdrop-blur-sm">
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
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] backdrop-blur-sm">
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
              
              <div className="absolute top-full left-0 mt-2 w-52 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] backdrop-blur-sm">
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
        <div className="md:hidden bg-gray-800 border-t border-gray-700">
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
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
} 