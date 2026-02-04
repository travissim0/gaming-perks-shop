'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Bell, Menu, X, User, LogOut, Settings } from 'lucide-react';

export default function NeutralNavbar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCtfAdmin, setIsCtfAdmin] = useState(false);
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [isZoneAdmin, setIsZoneAdmin] = useState(false);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Fetch user profile and permissions
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('in_game_alias, avatar_url, is_admin, ctf_role, is_media_manager, is_zone_admin, site_admin')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserProfile(profile);
        setUserAvatar(profile.avatar_url);
        setIsAdmin(profile.is_admin || false);
        setIsCtfAdmin(profile.is_admin || profile.ctf_role === 'ctf_admin');
        setIsMediaManager(profile.is_media_manager || false);
        setIsZoneAdmin(profile.is_admin || profile.is_zone_admin || profile.ctf_role === 'ctf_admin' || profile.ctf_role === 'ctf_head_referee');
        setIsSiteAdmin(profile.site_admin || false);
      }
    };

    fetchProfile();
  }, [user]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userDropdownRef.current && !userDropdownRef.current.contains(target)) {
        setShowUserDropdown(false);
      }
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(target)) {
        setShowAdminDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setShowNotificationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const hasAdminAccess = isAdmin || isCtfAdmin || isMediaManager || isZoneAdmin || isSiteAdmin;

  return (
    <nav className="relative z-50">
      {/* Main Navbar */}
      <div className="bg-gray-900/80 backdrop-blur-md border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">

            {/* Logo - Stylized FREE INFANTRY */}
            <Link href="/" className="flex items-center gap-3 group">
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

            {/* Desktop Navigation - Stylized League Buttons */}
            <div className="hidden md:flex items-center gap-4">
              {/* CTFPL Button - Blue/Cyan theme */}
              <Link
                href="/league"
                className="group relative px-4 py-2 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 hover:from-blue-600/40 hover:to-cyan-600/40 border border-blue-500/50 hover:border-cyan-400 rounded-lg transition-all duration-300"
              >
                <span className="flex items-center gap-2">
                  <span className="text-blue-400 group-hover:text-cyan-300 transition-colors">🏆</span>
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 group-hover:from-blue-300 group-hover:to-cyan-300">
                    CTFPL
                  </span>
                </span>
                <div className="absolute inset-0 rounded-lg bg-cyan-400/0 group-hover:bg-cyan-400/5 transition-colors" />
              </Link>

              {/* Triple Threat Button - Orange/Red theme */}
              <Link
                href="/triple-threat"
                className="group relative px-4 py-2 bg-gradient-to-r from-orange-600/20 to-red-600/20 hover:from-orange-600/40 hover:to-red-600/40 border border-orange-500/50 hover:border-orange-400 rounded-lg transition-all duration-300"
              >
                <span className="flex items-center gap-2">
                  <span className="text-orange-400 group-hover:text-orange-300 transition-colors">⚡</span>
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400 group-hover:from-orange-300 group-hover:to-red-300">
                    Triple Threat
                  </span>
                </span>
                <div className="absolute inset-0 rounded-lg bg-orange-400/0 group-hover:bg-orange-400/5 transition-colors" />
              </Link>

              {/* USL Stats Button - Green/Emerald theme */}
              <Link
                href="/dueling/bo9-stats"
                className="group relative px-4 py-2 bg-gradient-to-r from-green-600/20 to-emerald-600/20 hover:from-green-600/40 hover:to-emerald-600/40 border border-green-500/50 hover:border-emerald-400 rounded-lg transition-all duration-300"
              >
                <span className="flex items-center gap-2">
                  <span className="text-green-400 group-hover:text-emerald-300 transition-colors">📊</span>
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 group-hover:from-green-300 group-hover:to-emerald-300">
                    USL Stats
                  </span>
                </span>
                <div className="absolute inset-0 rounded-lg bg-green-400/0 group-hover:bg-green-400/5 transition-colors" />
              </Link>
            </div>

            {/* Right Side - Utilities (matching original navbar) */}
            <div className="flex items-center space-x-3">
              {user ? (
                <>
                  {/* Notifications Bell */}
                  <div className="relative" ref={notificationRef}>
                    <button
                      onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                      className="relative p-2 text-gray-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-gray-800/50"
                    >
                      <Bell className="w-5 h-5" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {showNotificationDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
                        <div className="py-2">
                          <div className="px-4 py-2 border-b border-gray-600/50">
                            <h3 className="text-sm font-medium text-white">Notifications</h3>
                          </div>
                          <div className="px-4 py-6 text-center text-gray-400">
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No new notifications</p>
                          </div>
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

                  {/* Admin Dropdown */}
                  {hasAdminAccess && (
                    <div className="relative" ref={adminDropdownRef}>
                      <button
                        onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                        className="flex items-center space-x-1 px-2 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold rounded-lg transition-all duration-300 border border-red-500/30 hover:shadow-lg hover:shadow-red-500/20"
                      >
                        <span>⚙️</span>
                        <span className="hidden sm:inline">Admin</span>
                        <svg className={`w-3 h-3 transition-transform duration-300 ${showAdminDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {showAdminDropdown && (
                        <div className="absolute right-0 top-full mt-1 min-w-48 bg-gray-800/95 border border-gray-600/50 rounded-xl shadow-2xl z-50 backdrop-blur-sm">
                          <div className="py-2">
                            {isAdmin && (
                              <Link
                                href="/admin"
                                className="flex items-center px-3 py-2 text-gray-300 hover:text-red-400 hover:bg-red-600/10 transition-all text-sm"
                                onClick={() => setShowAdminDropdown(false)}
                              >
                                <span className="mr-2">🛡️</span>
                                Site Admin
                              </Link>
                            )}
                            {(isAdmin || isZoneAdmin) && (
                              <Link
                                href="/admin/zones"
                                className="flex items-center px-3 py-2 text-gray-300 hover:text-orange-400 hover:bg-orange-600/10 transition-all text-sm"
                                onClick={() => setShowAdminDropdown(false)}
                              >
                                <span className="mr-2">🖥️</span>
                                Zones
                              </Link>
                            )}
                            {isCtfAdmin && (
                              <Link
                                href="/admin/ctf"
                                className="flex items-center px-3 py-2 text-gray-300 hover:text-indigo-400 hover:bg-indigo-600/10 transition-all text-sm"
                                onClick={() => setShowAdminDropdown(false)}
                              >
                                <span className="mr-2">⚔️</span>
                                CTF Admin
                              </Link>
                            )}
                            {(isAdmin || isMediaManager || isSiteAdmin) && (
                              <Link
                                href="/admin/videos"
                                className="flex items-center px-3 py-2 text-gray-300 hover:text-pink-400 hover:bg-pink-600/10 transition-all text-sm"
                                onClick={() => setShowAdminDropdown(false)}
                              >
                                <span className="mr-2">🎬</span>
                                Media
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User Avatar Dropdown */}
                  <div className="relative" ref={userDropdownRef}>
                    <button
                      onClick={() => setShowUserDropdown(!showUserDropdown)}
                      className="flex items-center"
                    >
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt="Avatar"
                          className="w-10 h-10 rounded-full border-2 border-gray-600 hover:border-cyan-400 transition-colors object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold border-2 border-gray-600 hover:border-cyan-400 transition-colors">
                          {userProfile?.in_game_alias?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </button>

                    {showUserDropdown && (
                      <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                        <div className="px-4 py-3 border-b border-gray-700">
                          <p className="text-sm font-medium text-white truncate">
                            {userProfile?.in_game_alias || 'User'}
                          </p>
                        </div>
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
                          <Settings className="w-4 h-4" />
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
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/auth/login"
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
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
          <div className="px-4 py-4 space-y-3">
            {/* CTFPL - Mobile */}
            <Link
              href="/league"
              className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-lg transition-all"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-xl">🏆</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                CTFPL League
              </span>
            </Link>

            {/* Triple Threat - Mobile */}
            <Link
              href="/triple-threat"
              className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-orange-600/20 to-red-600/20 border border-orange-500/30 rounded-lg transition-all"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-xl">⚡</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                Triple Threat
              </span>
            </Link>

            {/* USL Stats - Mobile */}
            <Link
              href="/dueling/bo9-stats"
              className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-lg transition-all"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-xl">📊</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                USL Stats
              </span>
            </Link>
            {!user && (
              <>
                <Link
                  href="/auth/login"
                  className="block px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="block px-4 py-3 text-cyan-400 hover:text-cyan-300 hover:bg-gray-800/50 rounded-lg transition-colors font-medium"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
