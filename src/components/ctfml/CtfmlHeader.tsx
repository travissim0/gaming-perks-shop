'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

type CtfmlPage = 'home' | 'rules' | 'squads' | 'standings' | 'matches';

interface CtfmlHeaderProps {
  currentPage?: CtfmlPage;
}

interface Profile {
  in_game_alias: string | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  ctf_role: string | null;
}

const NAV: { key: CtfmlPage; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/league/ctfml' },
  { key: 'rules', label: 'Rules', href: '/league/ctfml/rules' },
  { key: 'squads', label: 'Squads', href: '/league/ctfml/squads' },
  { key: 'standings', label: 'Standings', href: '/league/ctfml/standings' },
  { key: 'matches', label: 'Matches', href: '/league/ctfml/matches' },
];

/**
 * Fixed branded header/nav for the CTFML section. Pulls the player's profile
 * (alias / admin flags) from the `profiles` table — the alias is NOT in auth
 * user_metadata.
 */
export default function CtfmlHeader({ currentPage }: CtfmlHeaderProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('in_game_alias, avatar_url, is_admin, ctf_role')
        .eq('id', user.id)
        .maybeSingle();
      setProfile((data as Profile) || null);
    })();
  }, [user]);

  const isAdmin = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');
  const alias = profile?.in_game_alias || (user?.user_metadata?.in_game_alias as string) || null;
  const avatarUrl = profile?.avatar_url || (user?.user_metadata?.avatar_url as string) || null;

  const linkClasses = (page: CtfmlPage) =>
    currentPage === page
      ? 'px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 text-emerald-200 hover:text-emerald-100 transition-all duration-300 font-medium shadow-lg backdrop-blur-sm'
      : 'px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-300 border border-transparent hover:border-white/20 backdrop-blur-sm';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md border-b border-emerald-400/40">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/league/ctfml"
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent tracking-tight">
              CTFML
            </span>
            <span className="hidden sm:inline text-xs text-gray-400 font-medium">
              Mix League
            </span>
          </Link>

          <nav className="flex items-center space-x-2 md:space-x-6">
            {NAV.map((item) => (
              <Link key={item.key} href={item.href} className={linkClasses(item.key)}>
                {item.label}
              </Link>
            ))}

            {isAdmin && (
              <Link
                href="/admin/ctfml"
                className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30 transition-all duration-300 font-medium"
              >
                Admin
              </Link>
            )}

            {user && (
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={alias || user.email || 'User'}
                    className="w-9 h-9 rounded-full border-2 border-gray-600 hover:border-emerald-400 transition-colors cursor-pointer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-2 border-gray-600 hover:border-emerald-400 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
                    {(alias || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="absolute top-full right-0 mt-2 bg-gray-900/95 backdrop-blur-sm border border-gray-600/50 rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[200px] z-50">
                  <div className="text-sm">
                    <div className="text-white font-medium mb-1">
                      {alias || 'No Alias Set'}
                    </div>
                    <div className="text-gray-400 text-xs">{user.email}</div>
                    {isAdmin && (
                      <div className="text-amber-300 text-xs mt-2 pt-2 border-t border-gray-600/50">
                        CTF Admin
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Link
              href="/league"
              className="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:via-teal-400 hover:to-sky-400 px-4 py-2 rounded-lg transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105 backdrop-blur-sm border border-white/20"
            >
              ← League
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
