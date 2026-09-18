'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { Chip, Panel, Spinner, Empty, th, td } from '@/components/ctf/AdminBits';
import { inputCls } from '@/components/ctf/FormBits';

interface User {
  id: string;
  email: string;
  in_game_alias: string;
  ctf_role: string | null;
  is_admin: boolean;
}

/** Every CTF staff role the site knows. Order = display order. */
const CTF_ROLES = [
  { value: 'ctf_admin', label: 'CTF admin', cls: 'bg-[#22D3EE]/15 text-[#22D3EE]' },
  { value: 'ctf_head_referee', label: 'Head referee', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  { value: 'ctf_referee', label: 'Referee', cls: 'bg-[#34D399]/15 text-[#34D399]' },
  { value: 'ctf_commentator', label: 'Commentator', cls: 'bg-white/10 text-[#E6EDF7]' },
  { value: 'ctf_recorder', label: 'Recorder', cls: 'bg-white/10 text-[#E6EDF7]' },
  { value: 'ctf_analyst', label: 'Analyst', cls: 'bg-white/10 text-[#E6EDF7]' },
  { value: 'ctf_analyst_commentator', label: 'Analyst · Commentator', cls: 'bg-white/10 text-[#E6EDF7]' },
  { value: 'ctf_analyst_referee', label: 'Analyst · Referee', cls: 'bg-[#34D399]/15 text-[#34D399]' },
  { value: 'ctf_analyst_commentator_referee', label: 'Analyst · Commentator · Referee', cls: 'bg-[#34D399]/15 text-[#34D399]' },
] as const;

/** "none" is stored on many profiles and means no role, same as null or ''. */
const hasRole = (r: string | null | undefined) => !!r && r !== '' && r !== 'none';

type SortField = 'in_game_alias' | 'email' | 'ctf_role';
type SortDirection = 'asc' | 'desc';
type ViewFilter = 'all' | 'staff' | 'players';

/** Staff roster: who holds which CTF role, with a dropdown to change it. */
export default function CTFAdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [sortField, setSortField] = useState<SortField>('in_game_alias');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('staff');
  const [saving, setSaving] = useState<string | null>(null);

  // Site admins and CTF admins may view and manage; nobody else.
  const canView = !!currentUserProfile && (currentUserProfile.is_admin || currentUserProfile.ctf_role === 'ctf_admin');

  // CTF admins (who are not site admins) can't touch site admins.
  const canManageUser = (target: User): boolean => {
    if (!currentUserProfile) return false;
    if (currentUserProfile.is_admin) return true;
    if (target.is_admin) return false;
    return currentUserProfile.ctf_role === 'ctf_admin';
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, in_game_alias, ctf_role, is_admin')
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null)
        .neq('in_game_alias', '')
        .order('in_game_alias');
      if (error) throw error;

      let list = (profiles || []) as User[];
      if (currentUserProfile && currentUserProfile.ctf_role === 'ctf_admin' && !currentUserProfile.is_admin) {
        list = list.filter((u) => !u.is_admin);
      }
      setUsers(list);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    }
  };

  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, in_game_alias, ctf_role, is_admin')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setCurrentUserProfile(data as User);
    } catch (error: any) {
      console.error('Error fetching current user profile:', error);
    }
  };

  const handleRoleChange = async (userId: string, roleName: string | null) => {
    const target = users.find((u) => u.id === userId);
    if (!target || !canManageUser(target)) {
      toast.error('Insufficient permissions');
      return;
    }
    setSaving(userId);
    try {
      const { data, error } = await supabase.from('profiles').update({ ctf_role: roleName }).eq('id', userId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No change saved — you may not have permission to edit this profile');
      const label = CTF_ROLES.find((r) => r.value === roleName)?.label;
      toast.success(label ? `${target.in_game_alias} is now ${label}` : `${target.in_game_alias} has no CTF role`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ctf_role: roleName } : u)));
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update role');
    } finally {
      setSaving(null);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const roleRank = (r: string | null) => { const i = CTF_ROLES.findIndex((x) => x.value === r); return i < 0 ? 99 : i; };

  const sortedUsers = [...users].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'in_game_alias') cmp = a.in_game_alias.toLowerCase().localeCompare(b.in_game_alias.toLowerCase());
    else if (sortField === 'email') cmp = a.email.toLowerCase().localeCompare(b.email.toLowerCase());
    else cmp = roleRank(a.ctf_role) - roleRank(b.ctf_role) || a.in_game_alias.localeCompare(b.in_game_alias);
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const term = searchTerm.trim().toLowerCase();
  const filteredUsers = sortedUsers.filter((u) => {
    if (term) {
      const roleLabel = CTF_ROLES.find((r) => r.value === u.ctf_role)?.label.toLowerCase() || '';
      if (!u.in_game_alias.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term) && !roleLabel.includes(term)) return false;
    }
    if (viewFilter === 'staff') return hasRole(u.ctf_role);
    if (viewFilter === 'players') return !hasRole(u.ctf_role);
    return true;
  });

  const stats = {
    total: users.length,
    staff: users.filter((u) => hasRole(u.ctf_role)).length,
    players: users.filter((u) => !hasRole(u.ctf_role)).length,
    byRole: CTF_ROLES.map((r) => ({ ...r, n: users.filter((u) => u.ctf_role === r.value).length })).filter((r) => r.n > 0),
  };

  const sortIcon = (field: SortField) => (sortField !== field ? '' : sortDirection === 'asc' ? ' ↑' : ' ↓');

  useEffect(() => {
    if (user) { setLoading(true); fetchCurrentUserProfile(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (currentUserProfile) fetchUsers().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserProfile]);

  if (loading) return <Panel><Spinner label="Loading staff roles…" /></Panel>;
  if (!canView) return <Panel><Empty>Only CTF admins can manage roles.</Empty></Panel>;

  return (
    <Panel
      title="Staff roles"
      hint={<>{stats.staff} with a role · {stats.players} without · {stats.total} accounts</>}
      actions={
        <input
          type="text"
          placeholder="Search alias, email, role…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`${inputCls} w-64`}
        />
      }
    >
      <div className="px-5 py-3 flex flex-wrap items-center gap-1.5 border-b border-white/[0.06]">
        <Chip active={viewFilter === 'staff'} onClick={() => setViewFilter('staff')}>Staff <span className="ml-1 tabular-nums opacity-70">{stats.staff}</span></Chip>
        <Chip active={viewFilter === 'players'} onClick={() => setViewFilter('players')}>No role <span className="ml-1 tabular-nums opacity-70">{stats.players}</span></Chip>
        <Chip active={viewFilter === 'all'} onClick={() => setViewFilter('all')}>All <span className="ml-1 tabular-nums opacity-70">{stats.total}</span></Chip>
        <span className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          {stats.byRole.map((r) => (
            <span key={r.value} className={`rounded px-1.5 py-0.5 ${r.cls}`}>{r.label} <span className="tabular-nums opacity-80">{r.n}</span></span>
          ))}
        </span>
      </div>

      {filteredUsers.length === 0 ? (
        <Empty>{term ? `Nobody matches “${searchTerm}”.` : viewFilter === 'staff' ? 'Nobody holds a CTF role yet.' : 'Nobody here.'}</Empty>
      ) : (
        <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#131A2B]">
              <tr>
                <th className={`${th} cursor-pointer select-none hover:text-[#E6EDF7]`} onClick={() => handleSort('in_game_alias')}>Alias{sortIcon('in_game_alias')}</th>
                <th className={`${th} cursor-pointer select-none hover:text-[#E6EDF7]`} onClick={() => handleSort('email')}>Email{sortIcon('email')}</th>
                <th className={`${th} cursor-pointer select-none hover:text-[#E6EDF7]`} onClick={() => handleSort('ctf_role')}>Role{sortIcon('ctf_role')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const info = CTF_ROLES.find((r) => r.value === u.ctf_role);
                const editable = canManageUser(u);
                return (
                  <tr key={u.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                    <td className={`${td} font-medium text-[#E6EDF7]`}>
                      {u.in_game_alias}
                      {u.is_admin && <span className="ml-2 rounded bg-[#F87171]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F87171]">Site admin</span>}
                    </td>
                    <td className={`${td} text-[#8B98B0]`}>{u.email}</td>
                    <td className={td}>
                      {editable ? (
                        <select
                          value={hasRole(u.ctf_role) ? (u.ctf_role as string) : ''}
                          onChange={(e) => handleRoleChange(u.id, e.target.value || null)}
                          disabled={saving === u.id}
                          className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1 text-xs text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">No role</option>
                          {CTF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : info ? (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${info.cls}`}>{info.label}</span>
                      ) : (
                        <span className="text-xs text-[#8B98B0]/60">No role</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
