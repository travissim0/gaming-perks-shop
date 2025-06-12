'use client';

import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
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
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

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
      } catch (error) {
        console.error('Error checking user data:', error);
      }
    };

    const checkPendingJoinRequests = async () => {
      if (!user) {
        setPendingJoinRequestCount(0);
        return;
      }
      
      try {
        // First, check if user is a captain or co-captain of any squad
        const { data: squads } = await supabase
          .from('squad_members')
          .select(`
            squad_id,
            role,
            squads!inner(id, name)
          `)
          .eq('player_id', user.id)
          .eq('status', 'active')
          .in('role', ['captain', 'co_captain']);

        if (!squads || squads.length === 0) {
          setPendingJoinRequestCount(0);
          return;
        }

        // Get squad IDs where user is captain/co-captain
        const squadIds = squads.map(s => s.squad_id);

        // Check for pending join requests to those squads
        const { data: requests } = await supabase
          .from('squad_invites')
          .select('id, invited_by, invited_player_id, squad_id')
          .in('squad_id', squadIds)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString());

        if (requests) {
          // Filter for self-requests (join requests) where invited_by = invited_player_id
          const joinRequests = requests.filter(req => req.invited_by === req.invited_player_id);
          setPendingJoinRequestCount(joinRequests.length);
        } else {
          setPendingJoinRequestCount(0);
        }
      } catch (error) {
        console.error('Error checking pending join requests:', error);
        setPendingJoinRequestCount(0);
      }
    };

    checkUserData();
    checkPendingJoinRequests();

    // Set up periodic checking for join requests (every 30 seconds)
    const interval = setInterval(checkPendingJoinRequests, 30000);
    
    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Navigation groups
  const playNavItems = [
    { href: '/matches', label: 'Matches', icon: '⚔️' },
    { href: '/squads', label: 'Squads', icon: '🛡️' },
    { href: '/dueling', label: 'Dueling', icon: '🗡️' },
  ];

  const statsNavItems = [
    { href: '/stats', label: 'Player Stats', icon: '📊' },
    { href: '/logs', label: 'Game Logs', icon: '📜' },
  ];

  const communityNavItems = [
    { href: '/forum', label: 'Forum', icon: '💬' },
    { href: '/guides', label: 'Guides', icon: '📚' },
    { href: '/champions', label: 'Hall of Champions', icon: '👑' },
    { href: '/affiliate-sites', label: 'Community Sites', icon: '🌐' },
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
              <Link 
                href={pendingJoinRequestCount > 0 ? "/squads" : "/messages"}
                className="relative p-2 text-gray-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-gray-800/50"
                title={
                  pendingJoinRequestCount > 0 
                    ? `${pendingJoinRequestCount} pending join request${pendingJoinRequestCount > 1 ? 's' : ''}`
                    : unreadMessageCount > 0 
                    ? `${unreadMessageCount} unread message${unreadMessageCount > 1 ? 's' : ''}`
                    : 'Notifications'
                }
              >
                <Bell className={`w-5 h-5 ${(unreadMessageCount > 0 || pendingJoinRequestCount > 0) ? 'text-cyan-400' : ''}`} />
                {(unreadMessageCount > 0 || pendingJoinRequestCount > 0) && (
                  <span className={`absolute -top-1 -right-1 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center ${
                    pendingJoinRequestCount > 0 ? 'bg-orange-500' : 'bg-red-500'
                  }`}>
                    {pendingJoinRequestCount > 0 
                      ? (pendingJoinRequestCount > 9 ? '9+' : pendingJoinRequestCount)
                      : (unreadMessageCount > 9 ? '9+' : unreadMessageCount)
                    }
                  </span>
                )}
              </Link>

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
              <div className="relative">
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
                  <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
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
            {/* Play Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-3 py-2 text-gray-300 hover:text-cyan-400 transition-colors rounded-lg group-hover:bg-gray-800/30">
                <Gamepad2 className="w-4 h-4" />
                <span className="font-medium">Play</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="py-2">
                  {playNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-3 py-2 text-gray-300 hover:text-cyan-400 transition-colors rounded-lg group-hover:bg-gray-800/30">
                <BarChart3 className="w-4 h-4" />
                <span className="font-medium">Stats</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="py-2">
                  {statsNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Community Section */}
            <div className="group relative">
              <button className="flex items-center space-x-2 px-3 py-2 text-gray-300 hover:text-cyan-400 transition-colors rounded-lg group-hover:bg-gray-800/30">
                <Users className="w-4 h-4" />
                <span className="font-medium">Community</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="py-2">
                  {communityNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.label}
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
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Play</h4>
                  <div className="space-y-1">
                    {playNavItems.map((item) => (
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