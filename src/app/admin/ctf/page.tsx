'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Shield, Users, CalendarDays, MessageCircle, Ban, ListOrdered, Lock, BarChart3, Swords, Trophy, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import CTFAdminPanel from '@/components/CTFAdminPanel';
import AliasAssociationModal from '@/components/AliasAssociationModal';
import SeasonManagementModal from '@/components/admin/SeasonManagementModal';
import SquadMaintenanceModal from '@/components/admin/SquadMaintenanceModal';
import { Panel, Spinner, StaffShell, HeaderStrip } from '@/components/ctf/AdminBits';
import { btnQuiet } from '@/components/ctf/FormBits';

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
  ctf_role: string | null;
  avatar_url?: string;
}

const ROLE_LABEL: Record<string, string> = {
  ctf_admin: 'CTF admin',
  ctf_head_referee: 'Head referee',
  ctf_referee: 'Referee',
  ctf_recorder: 'Recorder',
  ctf_commentator: 'Commentator',
  ctf_analyst: 'Analyst',
  ctf_analyst_commentator: 'Analyst · Commentator',
  ctf_analyst_referee: 'Analyst · Referee',
  ctf_analyst_commentator_referee: 'Analyst · Commentator · Referee',
};

type Tool = { href: string; icon: React.ComponentType<{ className?: string }>; title: string; blurb: string; sub?: { href: string; label: string }[] };

const TOOLS: Tool[] = [
  {
    href: '/admin/ctf-management', icon: Shield, title: 'CTF management', blurb: 'Squads, player pool, season dates, Discord, bans and tournament flags.',
    sub: [
      { href: '/admin/ctf-management?tab=squads', label: 'Squads' },
      { href: '/admin/ctf-management?tab=pool', label: 'Player pool' },
      { href: '/admin/ctf-management?tab=season', label: 'Season' },
      { href: '/admin/ctf-management?tab=discord', label: 'Discord' },
      { href: '/admin/ctf-management?tab=bans', label: 'Bans' },
    ],
  },
  { href: '/admin/ctfdl-draft', icon: ListOrdered, title: 'Draft setup', blurb: 'Create the CTFDL draft, add the squads, rank the pool, run draft night.' },
  { href: '/league/schedule', icon: CalendarDays, title: 'Schedule', blurb: 'Add fixtures, generate the regular season and playoffs, set home and away.' },
  { href: '/admin/ctf/match-manager', icon: Swords, title: 'Match manager', blurb: 'Record official results that drive the standings.' },
  { href: '/admin/roster-lock', icon: Lock, title: 'Roster lock', blurb: 'Lock season rosters so squads can’t change mid-season.' },
  { href: '/admin/league-stats', icon: BarChart3, title: 'League stats', blurb: 'CSV import and analytics for league games.' },
  { href: '/matches', icon: Trophy, title: 'Match log', blurb: 'Every scheduled and played match, with crews, videos and setup.' },
  { href: '/league', icon: ClipboardList, title: 'League page', blurb: 'What players see. Check the strip, standings and community box.' },
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
            .select('id, email, in_game_alias, is_admin, ctf_role, avatar_url')
            .eq('id', user.id)
            .single();
          if (error) throw error;

          setProfile(data as UserProfile);
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
  }, [user, loading, isCTFAdmin, router]);

  if (loading || !user || !isCTFAdmin) {
    return <StaffShell user={user}><Spinner label="Checking staff access…" /></StaffShell>;
  }

  const roleLabel = profile?.is_admin ? 'Site admin' : ROLE_LABEL[profile?.ctf_role || ''] || 'Staff';

  return (
    <StaffShell user={user}>
      <HeaderStrip
        title="CTF admin"
        meta={
          <>
            <span>Signed in as <span className="text-[#E6EDF7]">{profile?.in_game_alias}</span></span>
            <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">{roleLabel}</span>
          </>
        }
        actions={
          <>
            <Link href="/admin/ctf-management" className={btnQuiet}>CTF management</Link>
            <Link href="/admin/ctfdl-draft" className={btnQuiet}>Draft setup</Link>
            <Link href="/league/schedule" className={btnQuiet}>Schedule</Link>
          </>
        }
      />

      {/* Tools */}
      <Panel title="Tools" hint="Everything league staff runs, in one place.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06]">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.href} className="bg-[#131A2B] p-4 flex flex-col gap-2">
                <Link href={t.href} className="group flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1B2438] text-[#22D3EE]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-lg leading-tight text-[#E6EDF7] group-hover:text-[#22D3EE]">{t.title}</span>
                    <span className="block text-xs text-[#8B98B0]">{t.blurb}</span>
                  </span>
                </Link>
                {t.sub && (
                  <div className="flex flex-wrap gap-1 pl-12">
                    {t.sub.map((s) => (
                      <Link key={s.href} href={s.href} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]">{s.label}</Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Quick tools (modals) */}
      <Panel title="Quick tools" hint="Open in place.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.06]">
          <div className="bg-[#131A2B] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#E6EDF7]"><Users className="h-4 w-4 text-[#22D3EE]" /> Aliases</div>
            <p className="text-xs text-[#8B98B0]">Link in-game aliases from recorded games to site profiles.</p>
            <AliasAssociationModal />
          </div>
          <div className="bg-[#131A2B] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#E6EDF7]"><CalendarDays className="h-4 w-4 text-[#22D3EE]" /> Seasons</div>
            <p className="text-xs text-[#8B98B0]">Create seasons and set which one is active.</p>
            <SeasonManagementModal />
          </div>
          <div className="bg-[#131A2B] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#E6EDF7]"><MessageCircle className="h-4 w-4 text-[#22D3EE]" /> Squad details</div>
            <p className="text-xs text-[#8B98B0]">Rename squads, edit tags and descriptions.</p>
            <SquadMaintenanceModal />
          </div>
        </div>
      </Panel>

      {/* Role management */}
      <CTFAdminPanel />

      <p className="text-[11px] text-[#8B98B0] flex items-center gap-1.5"><Ban className="h-3 w-3" /> League bans live under CTF management → Bans.</p>
    </StaffShell>
  );
}
