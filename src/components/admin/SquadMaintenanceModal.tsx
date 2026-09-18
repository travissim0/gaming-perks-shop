'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { patchSquads } from '@/lib/admin-squads';
import { Modal, Chip, Empty, th, td } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_id: string;
  captain_alias: string;
  is_active: boolean;
  is_legacy: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}
interface PlayerResult { id: string; in_game_alias: string; display_name: string | null }

const SYSTEM_USER_ID = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';

/** Staff tool: rename squads, edit tags and descriptions, assign a captain to system-owned legacy squads. */
const SquadMaintenanceModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'legacy'>('all');

  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [captainSquadId, setCaptainSquadId] = useState<string | null>(null);
  const [captainSearch, setCaptainSearch] = useState('');
  const [captainResults, setCaptainResults] = useState<PlayerResult[]>([]);
  const [captainSearching, setCaptainSearching] = useState(false);
  const [settingCaptain, setSettingCaptain] = useState(false);

  const fetchSquads = async () => {
    try {
      const { data, error } = await supabase
        .from('squads')
        .select('id, name, tag, description, captain_id, is_active, is_legacy, created_at, updated_at, profiles!squads_captain_id_fkey(in_game_alias), squad_members(id)')
        .order('name');
      if (error) throw error;
      setSquads((data || []).map((squad: any) => ({ ...squad, captain_alias: squad.profiles?.in_game_alias || 'Unknown', member_count: squad.squad_members?.length || 0 })));
    } catch (error) {
      console.error('Error fetching squads:', error);
      toast.error('Failed to fetch squads');
    }
  };

  useEffect(() => { if (isOpen) fetchSquads(); }, [isOpen]);

  const startEdit = (squad: Squad) => { setEditingSquad(squad); setEditName(squad.name); setEditTag(squad.tag); setEditDescription(squad.description || ''); setCaptainSquadId(null); };
  const cancelEdit = () => { setEditingSquad(null); setEditName(''); setEditTag(''); setEditDescription(''); };
  const startCaptainEdit = (squadId: string) => { setCaptainSquadId(squadId); setCaptainSearch(''); setCaptainResults([]); cancelEdit(); };
  const cancelCaptainEdit = () => { setCaptainSquadId(null); setCaptainSearch(''); setCaptainResults([]); };

  const searchPlayers = async (query: string) => {
    setCaptainSearch(query);
    if (query.length < 2) { setCaptainResults([]); return; }
    setCaptainSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/ctf/squads/set-captain?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || `Search failed (${res.status})`); setCaptainResults([]); return; }
      setCaptainResults(data.players || []);
    } catch (err) {
      console.error('set-captain search error:', err);
      setCaptainResults([]);
    } finally {
      setCaptainSearching(false);
    }
  };

  const assignCaptain = async (playerId: string) => {
    if (!captainSquadId) return;
    setSettingCaptain(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/ctf/squads/set-captain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ squadId: captainSquadId, playerId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to set captain'); return; }
      toast.success(`Captain set to ${data.captain_alias}`);
      cancelCaptainEdit();
      await fetchSquads();
    } catch {
      toast.error('Failed to set captain');
    } finally {
      setSettingCaptain(false);
    }
  };

  const saveSquadChanges = async () => {
    if (!editingSquad || !editName.trim() || !editTag.trim()) { toast.error('Squad name and tag are required'); return; }
    setLoading(true);
    try {
      // Through the staff API: browser writes to squads are silently dropped by RLS.
      await patchSquads(editingSquad.id, { name: editName.trim(), tag: editTag.trim().toUpperCase(), description: editDescription.trim() || null });
      toast.success('Squad updated');
      await fetchSquads();
      cancelEdit();
    } catch (error: any) {
      console.error('Error updating squad:', error);
      toast.error(error?.message || 'Failed to update squad');
    } finally {
      setLoading(false);
    }
  };

  const filteredSquads = squads.filter((squad) => {
    if (filter === 'active' && (!squad.is_active || squad.is_legacy)) return false;
    if (filter === 'inactive' && (squad.is_active || squad.is_legacy)) return false;
    if (filter === 'legacy' && !squad.is_legacy) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return squad.name.toLowerCase().includes(term) || squad.tag.toLowerCase().includes(term) || squad.captain_alias.toLowerCase().includes(term);
    }
    return true;
  });

  const statusPill = (squad: Squad) =>
    squad.is_legacy
      ? <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-white/5 text-[#8B98B0]">Legacy</span>
      : squad.is_active
        ? <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-[#34D399]/15 text-[#34D399]">Active</span>
        : <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-[#F87171]/15 text-[#F87171]">Inactive</span>;

  const captainTarget = captainSquadId ? squads.find((s) => s.id === captainSquadId) : null;

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-[#E6EDF7] hover:bg-white/10 transition-colors">
        Edit squad details
      </button>

      {isOpen && (
        <Modal
          title="Squad details"
          hint="Rename squads, edit tags and descriptions. Names and tags must be unique; tags are uppercased."
          onClose={() => setIsOpen(false)}
          size="xl"
          actions={<input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search name, tag, captain" className={`${inputCls} w-56`} />}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive'], ['legacy', 'Legacy']] as const).map(([k, label]) => (
                <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{label}</Chip>
              ))}
              <span className="ml-auto text-xs text-[#8B98B0]">{filteredSquads.length} of {squads.length}</span>
            </div>

            {/* Inline editor */}
            {editingSquad && (
              <div className="rounded-md bg-[#1B2438] p-3 space-y-3">
                <div className="text-sm text-[#E6EDF7]">Editing {editingSquad.name}</div>
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_3fr] gap-3">
                  <label className="block"><span className={labelCls}>Name</span><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} /></label>
                  <label className="block"><span className={labelCls}>Tag</span><input type="text" value={editTag} onChange={(e) => setEditTag(e.target.value.toUpperCase())} maxLength={10} className={`${inputCls} font-mono`} /></label>
                  <label className="block"><span className={labelCls}>Description</span><input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="optional" className={inputCls} /></label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={cancelEdit} className={btnQuiet}>Cancel</button>
                  <button type="button" onClick={saveSquadChanges} disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}

            {/* Captain assignment for system-owned squads */}
            {captainTarget && (
              <div className="rounded-md bg-[#F59E0B]/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#F59E0B]">Set a captain for {captainTarget.name}</span>
                  <button type="button" onClick={cancelCaptainEdit} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">Cancel</button>
                </div>
                <input type="text" value={captainSearch} onChange={(e) => searchPlayers(e.target.value)} placeholder="Search a player by alias" className={inputCls} autoFocus />
                {captainSearching && <div className="text-xs text-[#8B98B0]">Searching…</div>}
                {captainResults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {captainResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => assignCaptain(p.id)} disabled={settingCaptain} className={btnQuiet}>{p.in_game_alias}</button>
                    ))}
                  </div>
                )}
                {captainSearch.length >= 2 && !captainSearching && captainResults.length === 0 && <div className="text-xs text-[#8B98B0]">No players found</div>}
              </div>
            )}

            {filteredSquads.length === 0 ? (
              <Empty>No squads match.</Empty>
            ) : (
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-md bg-[#1B2438]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#1B2438]">
                    <tr>
                      <th className={th}>Squad</th>
                      <th className={th}>Tag</th>
                      <th className={th}>Captain</th>
                      <th className={`${th} text-right`}>Members</th>
                      <th className={th}>Status</th>
                      <th className={`${th} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSquads.map((squad) => (
                      <tr key={squad.id} className={`border-t border-white/[0.06] hover:bg-white/[0.02] ${editingSquad?.id === squad.id ? 'bg-[#22D3EE]/[0.06]' : ''}`}>
                        <td className={td}>
                          <div className="text-[#E6EDF7]">{squad.name}</div>
                          {squad.description && <div className="max-w-xs truncate text-xs text-[#8B98B0]">{squad.description}</div>}
                        </td>
                        <td className={`${td} font-mono text-[#22D3EE]`}>{squad.tag}</td>
                        <td className={`${td} text-[#8B98B0]`}>{squad.captain_alias}</td>
                        <td className={`${td} text-right tabular-nums text-[#8B98B0]`}>{squad.member_count}</td>
                        <td className={td}>{statusPill(squad)}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          <button type="button" onClick={() => startEdit(squad)} className="text-xs text-[#8B98B0] hover:text-[#22D3EE]">Edit</button>
                          {squad.captain_id === SYSTEM_USER_ID && (
                            <button type="button" onClick={() => startCaptainEdit(squad.id)} className="ml-3 text-xs text-[#F59E0B] hover:text-[#FBBF24]">Set captain</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default SquadMaintenanceModal;
