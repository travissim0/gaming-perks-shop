'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import CTFAdminPanel from '@/components/CTFAdminPanel';
import AliasAssociationModal from '@/components/AliasAssociationModal';
import SeasonManagementModal from '@/components/admin/SeasonManagementModal';
import SquadMaintenanceModal from '@/components/admin/SquadMaintenanceModal';
import { toast } from 'react-hot-toast';

export type CTFRoleType =
  | 'none'
  | 'ctf_admin'
  | 'ctf_head_referee'
  | 'ctf_referee'
  | 'ctf_recorder'
  | 'ctf_commentator';

interface UserProfile {
  id: string;
  email: string;
  in_game_alias: string;
  is_admin: boolean;
  is_media_manager: boolean;
  ctf_role: CTFRoleType;
  registration_status: string;
  created_at: string;
  updated_at: string;
  avatar_url?: string;
}

const CTF_ROLE_INFO = {
  none: { display_name: 'No CTF Role', level: 0, color: 'bg-gray-500 border-gray-600' },
  ctf_admin: { display_name: 'CTF Administrator', level: 90, color: 'bg-purple-500 border-purple-600' },
  ctf_head_referee: { display_name: 'CTF Head Referee', level: 80, color: 'bg-blue-500 border-blue-600' },
  ctf_referee: { display_name: 'CTF Referee', level: 70, color: 'bg-green-500 border-green-600' },
  ctf_recorder: { display_name: 'CTF Recorder', level: 60, color: 'bg-yellow-500 border-yellow-600' },
  ctf_commentator: { display_name: 'CTF Commentator', level: 50, color: 'bg-orange-500 border-orange-600' }
};

const NAV_CARDS = [
  {
    href: '/admin/ctf-management',
    icon: '🛡️',
    title: 'Squad Management',
    description: 'Manage squads & tournaments',
    color: 'bg-purple-600 hover:bg-purple-700',
  },
  {
    href: '/admin/ctf-management?tab=free-agents',
    icon: '🎯',
    title: 'Free Agent Pool',
    description: 'Manage available players',
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    href: '/admin/ctf-management?tab=bans',
    icon: '🚫',
    title: 'League Bans',
    description: 'Manage banned players',
    color: 'bg-red-600 hover:bg-red-700',
  },
  {
    href: '/admin/roster-lock',
    icon: '🔒',
    title: 'Roster Lock',
    description: 'Season roster management',
    color: 'bg-orange-600 hover:bg-orange-700',
  },
  {
    href: '/admin/league-stats',
    icon: '📈',
    title: 'League Stats',
    description: 'CSV import & analytics',
    color: 'bg-teal-600 hover:bg-teal-700',
  },
  {
    href: '/matches',
    icon: '🏆',
    title: 'View Matches',
    description: 'Browse match history',
    color: 'bg-green-600 hover:bg-green-700',
  },
];

export default function CTFAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isCTFAdmin, setIsCTFAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    const checkCTFAdmin = async () => {
      if (user && !isCTFAdmin) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            throw error;
          }

          setProfile(data);

          const hasAccess = data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
          if (!hasAccess) {
            router.push('/dashboard');
            toast.error('Unauthorized: CTF Admin access required');
            return;
          }

          setIsCTFAdmin(true);
        } catch (error: any) {
          console.error('Error checking CTF admin status:', error);
          router.push('/dashboard');
          toast.error('Error checking permissions');
        }
      }
    };

    checkCTFAdmin();
  }, [user, loading, isCTFAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!user || !isCTFAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-400 font-mono">Checking permissions...</p>
        </div>
      </div>
    );
  }

  const roleInfo = CTF_ROLE_INFO[profile?.ctf_role || 'none'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto px-2 py-4 sm:px-4 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Compact Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold text-purple-400 tracking-wider">
              CTF Admin Panel
            </h1>
            <span className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-white ${roleInfo.color}`}>
              {roleInfo.display_name}
            </span>
          </div>

          {/* Admin Tools — Navigation Cards */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-purple-400 mb-4">Admin Tools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {NAV_CARDS.map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  className={`${card.color} text-white p-4 rounded-lg transition-all duration-200 hover:scale-[1.02] group`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{card.icon}</div>
                    <div>
                      <div className="font-semibold">{card.title}</div>
                      <div className="text-sm opacity-80">{card.description}</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Inline Tools — Modals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Link player aliases to profiles</p>
              <AliasAssociationModal />
            </div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Create and manage league seasons</p>
              <SeasonManagementModal />
            </div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Rename squads, edit tags & descriptions</p>
              <SquadMaintenanceModal />
            </div>
          </div>

          {/* CTF Role Management Table */}
          <CTFAdminPanel />
        </div>
      </main>
    </div>
  );
}
