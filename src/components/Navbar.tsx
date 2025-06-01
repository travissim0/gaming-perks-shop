import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function Navbar({ user }: { user: any }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCtfAdmin, setIsCtfAdmin] = useState(false);
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin, ctf_role, is_media_manager')
          .eq('id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
        setIsCtfAdmin(profile?.is_admin || profile?.ctf_role === 'ctf_admin');
        setIsMediaManager(profile?.is_media_manager || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [user]);

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

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-xl shadow-cyan-500/10">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="text-cyan-400 text-xl font-bold tracking-wider">
            🏁 CTFPL
          </div>
          
          {/* Desktop Navigation */}
          {user && (
            <div className="hidden lg:flex items-center space-x-6">
              {/* Core Navigation - Primary controls */}
              <div className="flex items-center space-x-1">
                <Link 
                  href="/" 
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-cyan-400 transition-all duration-200 border border-gray-700/50 hover:border-cyan-500/50 rounded bg-gray-800/30 hover:bg-cyan-500/10 font-medium"
                >
                  🏠 Home
                </Link>
                <Link 
                  href="/dashboard" 
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-cyan-400 transition-all duration-200 border border-gray-700/50 hover:border-cyan-500/50 rounded bg-gray-800/30 hover:bg-cyan-500/10 font-medium"
                >
                  📊 Dashboard
                </Link>
                <Link 
                  href="/perks" 
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-cyan-400 transition-all duration-200 border border-gray-700/50 hover:border-cyan-500/50 rounded bg-gray-800/30 hover:bg-cyan-500/10 font-medium"
                >
                  🛍️ Perks
                </Link>
              </div>
              
              {/* Vertical separator */}
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent"></div>
              
              {/* Community - Secondary priority */}
              <div className="flex items-center space-x-1">
                <Link 
                  href="/guides" 
                  className="px-3 py-1.5 text-sm text-amber-300 hover:text-amber-200 transition-all duration-200 border border-amber-600/50 hover:border-amber-400 rounded bg-amber-600/20 hover:bg-amber-500/30 font-medium"
                >
                  📚 Guides
                </Link>
                <Link 
                  href="/forum" 
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-blue-400 transition-all duration-200 border border-gray-700/30 hover:border-blue-500/50 rounded bg-gray-800/20 hover:bg-blue-500/10 font-medium"
                >
                  💬 Forum
                </Link>
                <Link 
                  href="/squads" 
                  className="px-3 py-1.5 text-sm text-purple-300 hover:text-purple-200 transition-all duration-200 border border-purple-600/50 hover:border-purple-400 rounded bg-purple-600/20 hover:bg-purple-500/30 font-medium"
                >
                  🛡️ Squads
                </Link>
                <Link 
                  href="/matches" 
                  className="px-3 py-1.5 text-sm text-green-300 hover:text-green-200 transition-all duration-200 border border-green-600/50 hover:border-green-400 rounded bg-green-600/20 hover:bg-green-500/30 font-medium"
                >
                  ⚔️ Matches
                </Link>
                <Link 
                  href="/logs" 
                  className="px-3 py-1.5 text-sm text-orange-300 hover:text-orange-200 transition-all duration-200 border border-orange-600/50 hover:border-orange-400 rounded bg-orange-600/20 hover:bg-orange-500/30 font-medium"
                >
                  📜 Logs
                </Link>
              </div>
              
              {/* Vertical separator */}
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent"></div>
              
              {/* Info - Lower priority */}
              <div className="flex items-center">
                <Link 
                  href="/patch-notes" 
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-all duration-200 border border-gray-700/20 hover:border-gray-500/50 rounded bg-gray-800/10 hover:bg-gray-700/30 font-medium"
                >
                  📋 Patch Notes
                </Link>
              </div>
            </div>
          )}
          
          {/* Desktop Right Side */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Admin Controls - Critical but separate */}
            {user && (isAdmin || isCtfAdmin || isMediaManager) && (
              <div className="flex items-center space-x-1">
                {isAdmin && (
                  <Link 
                    href="/admin"
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    ⚡ ADMIN
                  </Link>
                )}
                {isCtfAdmin && (
                  <Link 
                    href="/admin/ctf"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    🎮 CTF ADMIN
                  </Link>
                )}
                {(isAdmin || isMediaManager) && (
                  <Link 
                    href="/admin/videos"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    🎬 MEDIA
                  </Link>
                )}
              </div>
            )}
            
            {/* Support & Account - Important secondary actions */}
            <div className="flex items-center space-x-2">
              {user && (
                <Link 
                  href="/donate" 
                  className="px-3 py-1.5 text-sm text-yellow-200 hover:text-yellow-100 transition-all duration-200 border border-yellow-600/60 hover:border-yellow-400 rounded bg-yellow-600/25 hover:bg-yellow-500/40 font-bold"
                >
                  💰 Donate
                </Link>
              )}
              
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-400 hover:text-gray-200 transition-all duration-200 border border-gray-600/40 hover:border-gray-500 rounded bg-gray-700/30 hover:bg-gray-600/50"
                  title="Sign Out"
                >
                  🚪
                </button>
              ) : (
                <>
                  <Link 
                    href="/auth/login" 
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors duration-200 font-medium"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
                    className="px-3 py-1.5 text-sm text-cyan-200 hover:text-cyan-100 transition-all duration-200 border border-cyan-600/60 hover:border-cyan-400 rounded bg-cyan-600/25 hover:bg-cyan-500/40 font-medium"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
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
                        href="/" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        🏠 Home
                      </Link>
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
                        href="/guides" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-amber-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📚 Guides
                      </Link>
                      <Link 
                        href="/forum" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-purple-400 hover:bg-gray-800 rounded transition-all duration-300"
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
                        href="/logs" 
                        onClick={closeMobileMenu}
                        className="block px-4 py-2 text-gray-300 hover:text-orange-400 hover:bg-gray-800 rounded transition-all duration-300"
                      >
                        📜 Logs
                      </Link>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="px-4 py-2">
                    <h4 className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Info</h4>
                    <Link 
                      href="/patch-notes" 
                      onClick={closeMobileMenu}
                      className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                    >
                      📋 Patch Notes
                    </Link>
                  </div>

                  {/* Admin Controls */}
                  {(isAdmin || isCtfAdmin || isMediaManager) && (
                    <div className="px-4 py-2">
                      <h4 className="text-xs text-red-400 font-medium uppercase tracking-wider mb-2">Admin</h4>
                      <div className="space-y-2">
                        {isAdmin && (
                          <Link 
                            href="/admin"
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            ⚡ ADMIN
                          </Link>
                        )}
                        {isCtfAdmin && (
                          <Link 
                            href="/admin/ctf"
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            🎮 CTF ADMIN
                          </Link>
                        )}
                        {(isAdmin || isMediaManager) && (
                          <Link 
                            href="/admin/videos"
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