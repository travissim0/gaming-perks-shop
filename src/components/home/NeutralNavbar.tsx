'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Menu, X, User, LogOut } from 'lucide-react';

export default function NeutralNavbar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('in_game_alias, avatar_url')
        .eq('id', user.id)
        .single();

      if (data) setUserProfile(data);
    };

    fetchProfile();
  }, [user]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  return (
    <nav className="relative z-50">
      {/* Main Navbar */}
      <div className="bg-gray-900/80 backdrop-blur-md border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">

            {/* Logo - Stylized FREE INFANTRY */}
            <Link href="/home-new" className="flex items-center gap-3 group">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl group-hover:bg-cyan-400/30 transition-all duration-300" />

                {/* Main text */}
                <div className="relative flex items-center gap-2">
                  <span className="text-2xl md:text-3xl font-black tracking-wider">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                      FREE
                    </span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                      INFANTRY
                    </span>
                  </span>

                  {/* Futuristic accent */}
                  <div className="hidden sm:flex items-center gap-1">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                    <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse delay-100" />
                    <div className="w-1 h-1 bg-pink-400 rounded-full animate-pulse delay-200" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/league/ctfpl"
                className="text-gray-300 hover:text-cyan-400 transition-colors font-medium"
              >
                CTFPL
              </Link>
              <Link
                href="/triple-threat"
                className="text-gray-300 hover:text-orange-400 transition-colors font-medium"
              >
                Triple Threat
              </Link>
            </div>

            {/* Right Side - Auth */}
            <div className="flex items-center gap-4">
              {user ? (
                <div className="relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors border border-gray-700/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                      {userProfile?.in_game_alias?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <span className="hidden sm:block text-gray-200 text-sm">
                      {userProfile?.in_game_alias || 'User'}
                    </span>
                  </button>

                  {showUserDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 px-4 py-3 text-gray-200 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </Link>
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-4 py-3 text-gray-200 hover:bg-gray-700/50 transition-colors"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <User className="w-4 h-4" />
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 w-full px-4 py-3 text-red-400 hover:bg-gray-700/50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]"
                  >
                    Register
                  </Link>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-gray-900/95 backdrop-blur-md border-b border-gray-800">
          <div className="px-4 py-4 space-y-2">
            <Link
              href="/league/ctfpl"
              className="block px-4 py-3 text-gray-300 hover:text-cyan-400 hover:bg-gray-800/50 rounded-lg transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              CTFPL League
            </Link>
            <Link
              href="/triple-threat"
              className="block px-4 py-3 text-gray-300 hover:text-orange-400 hover:bg-gray-800/50 rounded-lg transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Triple Threat
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
