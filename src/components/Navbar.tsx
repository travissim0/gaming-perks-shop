import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function Navbar({ user }: { user: any }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCtfAdmin, setIsCtfAdmin] = useState(false);
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [showMyAccountDropdown, setShowMyAccountDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Refs and timers for improved dropdown behavior
  const myAccountDropdownTimer = useRef<NodeJS.Timeout | null>(null);
  const userDropdownTimer = useRef<NodeJS.Timeout | null>(null);
  const myAccountDropdownOpenTime = useRef<number | null>(null);
  const userDropdownOpenTime = useRef<number | null>(null);

  useEffect(() => {
    const checkAdminStatus = async () => {
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
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    const fetchUnreadMessageCount = async () => {
      if (!user) return;
      
      try {
        const { data: messages, error } = await supabase
          .from('private_messages')
          .select('id')
          .eq('recipient_id', user.id)
          .eq('is_read', false);
        
        if (error) {
          console.error('Error fetching unread messages:', error);
          return;
        }
        
        setUnreadMessageCount(messages?.length || 0);
      } catch (error) {
        console.error('Error fetching unread message count:', error);
      }
    };

    if (user) {
      fetchUnreadMessageCount();
      
      // Set up real-time subscription for new messages
      const messageSubscription = supabase
        .channel('private_messages')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${user.id}`
        }, (payload) => {
          fetchUnreadMessageCount();
        })
        .subscribe();

      return () => {
        messageSubscription.unsubscribe();
      };
    }
  }, [user]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (myAccountDropdownTimer.current) {
        clearTimeout(myAccountDropdownTimer.current);
      }
      if (userDropdownTimer.current) {
        clearTimeout(userDropdownTimer.current);
      }
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const closeAllDropdowns = () => {
    setShowMyAccountDropdown(false);
    setShowUserDropdown(false);
  };

  // My Account dropdown handlers
  const handleMyAccountDropdownEnter = () => {
    if (myAccountDropdownTimer.current) {
      clearTimeout(myAccountDropdownTimer.current);
    }
    if (!showMyAccountDropdown) {
      setShowMyAccountDropdown(true);
      myAccountDropdownOpenTime.current = Date.now();
    }
  };

  const handleMyAccountDropdownLeave = () => {
    const timeOpen = myAccountDropdownOpenTime.current ? Date.now() - myAccountDropdownOpenTime.current : 0;
    const minTime = Math.max(0, 2000 - timeOpen);
    
    myAccountDropdownTimer.current = setTimeout(() => {
      setShowMyAccountDropdown(false);
      myAccountDropdownOpenTime.current = null;
    }, minTime);
  };

  // User avatar dropdown handlers
  const handleUserDropdownEnter = () => {
    if (userDropdownTimer.current) {
      clearTimeout(userDropdownTimer.current);
    }
    if (!showUserDropdown) {
      setShowUserDropdown(true);
      userDropdownOpenTime.current = Date.now();
    }
  };

  const handleUserDropdownLeave = () => {
    const timeOpen = userDropdownOpenTime.current ? Date.now() - userDropdownOpenTime.current : 0;
    const minTime = Math.max(0, 2000 - timeOpen);
    
    userDropdownTimer.current = setTimeout(() => {
      setShowUserDropdown(false);
      userDropdownOpenTime.current = null;
    }, minTime);
  };

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl shadow-cyan-500/10">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left Side - Logo and My Account */}
          <div className="flex items-center space-x-4">
            {/* Logo */}
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity duration-200">
              <img 
                src="/images/ctfpl1.png" 
                alt="CTFPL" 
                className="h-12 w-auto"
              />
            </Link>
            
            {/* My Account Dropdown */}
            {user && (
              <div className="relative">
                <button
                  onMouseEnter={handleMyAccountDropdownEnter}
                  onMouseLeave={handleMyAccountDropdownLeave}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-cyan-400 transition-all duration-200 border border-gray-700/50 hover:border-cyan-500/50 rounded-lg bg-gray-800/30 hover:bg-cyan-500/10 font-medium flex items-center space-x-1"
                >
                  <span>👤 My Account</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showMyAccountDropdown && (
                  <div 
                    className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50"
                    onMouseEnter={handleMyAccountDropdownEnter}
                    onMouseLeave={handleMyAccountDropdownLeave}
                  >
                    <div className="py-2">
                      <Link 
                        href="/dashboard" 
                        className="flex items-center px-6 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                      >
                        <span className="text-lg mr-3">📊</span>
                        <span className="font-medium">Dashboard</span>
                      </Link>
                      <Link 
                        href="/perks" 
                        className="flex items-center px-6 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                      >
                        <span className="text-lg mr-3">🛍️</span>
                        <span className="font-medium">Perks</span>
                      </Link>
                      <Link 
                        href="/messages" 
                        className="flex items-center justify-between px-6 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center">
                          <span className="text-lg mr-3">✉️</span>
                          <span className="font-medium">Messages</span>
                        </div>
                        {unreadMessageCount > 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                          </span>
                        )}
                      </Link>
                      <div className="border-t border-gray-600/50 mt-2"></div>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center px-6 py-3 text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="text-lg mr-3">🚪</span>
                        <span className="font-medium">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Center - Community Links */}
          {user && (
            <div className="hidden lg:flex items-center space-x-3">
              <Link 
                href="/forum" 
                className="px-3 py-2 text-sm text-cyan-300 hover:text-cyan-400 transition-all duration-200 border border-cyan-700/50 hover:border-cyan-500/50 rounded-lg bg-cyan-800/20 hover:bg-cyan-500/10 font-medium"
              >
                💬 Forum
              </Link>
              <Link 
                href="/squads" 
                className="px-3 py-2 text-sm text-purple-300 hover:text-purple-400 transition-all duration-200 border border-purple-700/50 hover:border-purple-500/50 rounded-lg bg-purple-800/20 hover:bg-purple-500/10 font-medium"
              >
                🛡️ Squads
              </Link>
              <Link 
                href="/matches" 
                className="px-3 py-2 text-sm text-green-300 hover:text-green-400 transition-all duration-200 border border-green-700/50 hover:border-green-500/50 rounded-lg bg-green-800/20 hover:bg-green-500/10 font-medium"
              >
                ⚔️ Matches
              </Link>
              <Link 
                href="/stats" 
                className="px-3 py-2 text-sm text-indigo-300 hover:text-indigo-400 transition-all duration-200 border border-indigo-700/50 hover:border-indigo-500/50 rounded-lg bg-indigo-800/20 hover:bg-indigo-500/10 font-medium"
              >
                📊 Stats
              </Link>
              <Link 
                href="/guides" 
                className="px-3 py-2 text-sm text-amber-300 hover:text-amber-400 transition-all duration-200 border border-amber-700/50 hover:border-amber-500/50 rounded-lg bg-amber-800/20 hover:bg-amber-500/10 font-medium"
              >
                📚 Guides
              </Link>
              <Link 
                href="/logs" 
                className="px-3 py-2 text-sm text-orange-300 hover:text-orange-400 transition-all duration-200 border border-orange-700/50 hover:border-orange-500/50 rounded-lg bg-orange-800/20 hover:bg-orange-500/10 font-medium"
              >
                📜 Logs
              </Link>
            </div>
          )}
          
          {/* Right Side */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Admin Controls */}
            {user && (isAdmin || isCtfAdmin || isMediaManager) && (
              <div className="flex items-center space-x-2">
                {isAdmin && (
                  <Link 
                    href="/dueling"
                    className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105 border border-orange-500/50 shadow-lg shadow-orange-500/20"
                  >
                    ⚔️ DUELING
                  </Link>
                )}
                {isAdmin && (
                  <Link 
                    href="/admin"
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105 border border-red-500/50 shadow-lg shadow-red-500/20"
                  >
                    ⚡ ADMIN
                  </Link>
                )}
                {isCtfAdmin && (
                  <Link 
                    href="/admin/ctf"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105 border border-indigo-500/50 shadow-lg shadow-indigo-500/20"
                  >
                    🎮 CTF
                  </Link>
                )}
                {(isAdmin || isMediaManager) && (
                  <Link 
                    href="/admin/videos"
                    className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105 border border-pink-500/50 shadow-lg shadow-pink-500/20"
                  >
                    🎬 MEDIA
                  </Link>
                )}
              </div>
            )}
            
            {/* Support */}
            {user && (
              <Link 
                href="/donate" 
                className="px-3 py-2 text-sm text-yellow-200 hover:text-yellow-100 transition-all duration-200 border border-yellow-600/60 hover:border-yellow-400 rounded-lg bg-yellow-600/25 hover:bg-yellow-500/40 font-bold shadow-lg shadow-yellow-500/20"
              >
                💰 Donate
              </Link>
            )}
            
            {/* User Avatar Dropdown */}
            {user ? (
              <div className="relative">
                <button
                  onMouseEnter={handleUserDropdownEnter}
                  onMouseLeave={handleUserDropdownLeave}
                  className="relative p-1 hover:ring-2 hover:ring-cyan-400/50 transition-all duration-200 rounded-full"
                >
                  <div className="relative">
                    {userAvatar ? (
                      <img 
                        src={userAvatar} 
                        alt="User Avatar" 
                        className="w-16 h-16 rounded-full object-cover border-2 border-gray-600 hover:border-cyan-400 transition-colors"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-700 border-2 border-gray-600 hover:border-cyan-400 flex items-center justify-center text-gray-300 transition-colors text-2xl">
                        👤
                      </div>
                    )}
                    {unreadMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center animate-pulse">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                      </span>
                    )}
                  </div>
                </button>
                
                {showUserDropdown && (
                  <div 
                    className="absolute top-full right-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50"
                    onMouseEnter={handleUserDropdownEnter}
                    onMouseLeave={handleUserDropdownLeave}
                  >
                    <Link 
                      href="/messages" 
                      className="flex items-center justify-between px-4 py-2 text-sm text-gray-300 hover:text-cyan-400 hover:bg-gray-700 transition-colors"
                    >
                      <span>✉️ Messages</span>
                      {unreadMessageCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                          {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </span>
                      )}
                    </Link>
                    <div className="border-t border-gray-600/50"></div>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-red-400 hover:bg-gray-700 transition-colors"
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link 
                  href="/auth/login" 
                  className="px-4 py-2 text-sm text-gray-400 hover:text-cyan-400 transition-colors duration-200 font-medium rounded-lg border border-gray-600/40 hover:border-cyan-500/50"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="px-4 py-2 text-sm text-cyan-200 hover:text-cyan-100 transition-all duration-200 border border-cyan-600/60 hover:border-cyan-400 rounded-lg bg-cyan-600/25 hover:bg-cyan-500/40 font-medium"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={toggleMobileMenu}
              className="text-gray-300 hover:text-cyan-400 focus:outline-none focus:text-cyan-400 transition-colors duration-300"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-700">
            <div className="flex flex-col space-y-2 mt-4">
              {user && (
                <>
                  {/* Core Navigation */}
                  <div className="px-4 py-2">
                    <h4 className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Navigate</h4>
                    <div className="space-y-1">
                      <Link 
                        href="/dashboard" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📊 Dashboard
                      </Link>
                      <Link 
                        href="/perks" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        🛍️ Browse Perks
                      </Link>
                    </div>
                  </div>

                  {/* Community */}
                  <div className="px-4 py-2">
                    <h4 className="text-xs text-purple-400 font-medium uppercase tracking-wider mb-2">Community</h4>
                    <div className="space-y-1">
                      <Link 
                        href="/forum" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        💬 Forum
                      </Link>
                      <Link 
                        href="/squads" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-purple-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        🛡️ Squads
                      </Link>
                      <Link 
                        href="/matches" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-green-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        ⚔️ Matches
                      </Link>
                      <Link 
                        href="/stats" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-indigo-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📊 Player Stats
                      </Link>
                      <Link 
                        href="/guides" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-amber-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📚 Guides
                      </Link>
                      <Link 
                        href="/logs" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-orange-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📜 Logs
                      </Link>
                    </div>
                  </div>

                  {/* Admin Controls */}
                  {(isAdmin || isCtfAdmin || isMediaManager) && (
                    <div className="px-4 py-2">
                      <h4 className="text-xs text-red-400 font-medium uppercase tracking-wider mb-2">Admin</h4>
                      <div className="space-y-2">
                        {isAdmin && (
                          <Link 
                            href="/dueling"
                            onClick={closeMobileMenu}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            ⚔️ DUELING
                          </Link>
                        )}
                        {isAdmin && (
                          <Link 
                            href="/admin"
                            onClick={closeMobileMenu}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            ⚡ ADMIN
                          </Link>
                        )}
                        {isCtfAdmin && (
                          <Link 
                            href="/admin/ctf"
                            onClick={closeMobileMenu}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            🎮 CTF ADMIN
                          </Link>
                        )}
                        {(isAdmin || isMediaManager) && (
                          <Link 
                            href="/admin/videos"
                            onClick={closeMobileMenu}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            🎬 MEDIA
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Support & Account */}
                  <div className="px-4 py-2">
                    <h4 className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Account</h4>
                    <div className="space-y-2">
                      <Link 
                        href="/donate" 
                        onClick={closeMobileMenu}
                        className="block mx-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-4 py-2 rounded border border-yellow-500 hover:border-yellow-400 transition-all duration-300 font-bold tracking-wide shadow-lg hover:shadow-yellow-500/25 text-center"
                      >
                        💰 Donate
                      </Link>
                      <Link 
                        href="/messages" 
                        onClick={closeMobileMenu}
                        className="block mx-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500 transition-all duration-300 font-medium tracking-wide shadow-md text-center relative"
                      >
                        ✉️ Messages
                        {unreadMessageCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                          </span>
                        )}
                      </Link>
                      <button
                        onClick={() => {
                          handleSignOut();
                          closeMobileMenu();
                        }}
                        className="block w-full mx-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500 transition-all duration-300 font-medium tracking-wide shadow-md text-center"
                      >
                        🚪 Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
              {!user && (
                <>
                  <Link 
                    href="/auth/login" 
                    onClick={closeMobileMenu}
                    className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
                    onClick={closeMobileMenu}
                    className="block mx-4 mt-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-2 rounded border border-cyan-500 hover:border-cyan-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-cyan-500/25 text-center"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
} 