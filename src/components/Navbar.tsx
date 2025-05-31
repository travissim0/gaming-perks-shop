import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function Navbar({ user }: { user: any }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
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
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b-2 border-cyan-500 shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="text-cyan-400 text-xl font-bold tracking-wider">
            🏁 CTFPL
          </div>
          
          {/* Desktop Navigation */}
          {user && (
            <div className="hidden lg:flex items-center space-x-1">
              <Link 
                href="/" 
                className="nav-link group px-3 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide text-sm"
              >
                <span className="group-hover:text-shadow-glow">🏠 Home</span>
              </Link>
              <Link 
                href="/dashboard" 
                className="nav-link group px-3 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide text-sm"
              >
                <span className="group-hover:text-shadow-glow">📊 Dashboard</span>
              </Link>
              <Link 
                href="/perks" 
                className="nav-link group px-3 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide text-sm"
              >
                <span className="group-hover:text-shadow-glow">🛍️ Perks</span>
              </Link>
              <Link 
                href="/forum" 
                className="nav-link group px-3 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide text-sm"
              >
                <span className="group-hover:text-shadow-glow">💬 Forum</span>
              </Link>
              
              {/* Divider */}
              <div className="h-6 w-px bg-gray-600 mx-2"></div>
              
              {/* Player Content - Colorful Buttons */}
              <Link 
                href="/squads" 
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white px-3 py-2 rounded font-bold tracking-wide transition-all duration-300 shadow-lg hover:shadow-purple-500/25 text-sm"
              >
                🛡️ Squads
              </Link>
              <Link 
                href="/matches" 
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white px-3 py-2 rounded font-bold tracking-wide transition-all duration-300 shadow-lg hover:shadow-green-500/25 text-sm"
              >
                ⚔️ Matches
              </Link>
              
              {/* Divider */}
              <div className="h-6 w-px bg-gray-600 mx-2"></div>
              
              <Link 
                href="/patch-notes" 
                className="nav-link group px-3 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide text-sm"
              >
                <span className="group-hover:text-shadow-glow">📋 Patch Notes</span>
              </Link>
            </div>
          )}
          
          {/* Desktop Right Side */}
          <div className="hidden md:flex items-center space-x-3">
            {user && isAdmin && (
              <Link 
                href="/admin" 
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-3 py-2 rounded font-bold tracking-wide transition-all duration-300 shadow-lg hover:shadow-red-500/25 text-sm border border-red-500/50 hover:border-red-400"
              >
                ⚡ ADMIN
              </Link>
            )}
            {user && (
              <Link 
                href="/donate" 
                className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-3 py-2 rounded border border-yellow-500 hover:border-yellow-400 transition-all duration-300 font-bold tracking-wide shadow-lg hover:shadow-yellow-500/25 text-sm"
              >
                💰 Donate
              </Link>
            )}
            {user ? (
              <button
                onClick={handleSignOut}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-3 py-2 rounded border border-red-500 hover:border-red-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-red-500/25 text-sm"
              >
                Sign Out
              </button>
            ) : (
              <>
                <Link 
                  href="/auth/login" 
                  className="text-gray-300 hover:text-cyan-400 transition-colors duration-300 font-medium tracking-wide text-sm"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-3 py-2 rounded border border-cyan-500 hover:border-cyan-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-cyan-500/25 text-sm"
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
                  <Link 
                    href="/forum" 
                    onClick={closeMobileMenu}
                    className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                  >
                    💬 Forum
                  </Link>
                  <Link 
                    href="/patch-notes" 
                    onClick={closeMobileMenu}
                    className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                  >
                    📋 Patch Notes
                  </Link>
                  <Link 
                    href="/squads" 
                    onClick={closeMobileMenu}
                    className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                  >
                    👥 Squads
                  </Link>
                  <Link 
                    href="/matches" 
                    onClick={closeMobileMenu}
                    className="block px-4 py-2 text-gray-300 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all duration-300"
                  >
                    ⚔️ Matches
                  </Link>
                  {isAdmin && (
                    <Link 
                      href="/admin" 
                      onClick={closeMobileMenu}
                      className="block mx-4 mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-4 py-2 rounded border border-red-500/50 hover:border-red-400 transition-all duration-300 font-bold tracking-wide shadow-lg hover:shadow-red-500/25 text-center"
                    >
                      ⚡ ADMIN
                    </Link>
                  )}
                  <Link 
                    href="/donate" 
                    onClick={closeMobileMenu}
                    className="block mx-4 mt-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-4 py-2 rounded border border-yellow-500 hover:border-yellow-400 transition-all duration-300 font-bold tracking-wide shadow-lg hover:shadow-yellow-500/25 text-center"
                  >
                    💰 Donate
                  </Link>
                  <button
                    onClick={() => {
                      handleSignOut();
                      closeMobileMenu();
                    }}
                    className="block mx-4 mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 py-2 rounded border border-red-500 hover:border-red-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-red-500/25 text-center"
                  >
                    Sign Out
                  </button>
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