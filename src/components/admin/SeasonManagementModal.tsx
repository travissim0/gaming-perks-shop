'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { SYSTEM_USER_ID } from '@/lib/constants';
import { Modal, Chip, Empty } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface Season {
  id: string;
  season_number: number;
  season_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'upcoming' | 'active' | 'completed';
  champion_squad_ids: string[];
  runner_up_squad_ids: string[];
  third_place_squad_ids: string[];
  total_matches: number;
  total_squads: number;
  created_at: string;
  updated_at: string;
}
interface Squad { id: string; name: string; tag: string; is_active?: boolean }
interface League { id: string; slug: string; name: string; description?: string | null }

const STATUS_PILL: Record<string, string> = {
  active: 'bg-[#34D399]/15 text-[#34D399]',
  upcoming: 'bg-[#F59E0B]/15 text-[#F59E0B]',
  completed: 'bg-white/5 text-[#8B98B0]',
};

// Date helpers: keep the picked calendar day regardless of timezone.
const formatDateForInput = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatDateForDatabase = (dateString: string): string | null => {
  if (!dateString.trim()) return null;
  return new Date(dateString + 'T00:00:00').toISOString().split('T')[0];
};
const formatDateForDisplay = (dateString: string | null): string => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('T')[0].split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const emptyForm = {
  season_number: '', season_name: '', start_date: '', end_date: '',
  status: 'upcoming' as 'upcoming' | 'active' | 'completed',
  champion_squad_names: '', runner_up_squad_names: '', third_place_squad_names: '',
};

/** Staff tool: create and edit league seasons, set which is active, record the top three. */
const SeasonManagementModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [showAddLeague, setShowAddLeague] = useState(false);
  const [newLeagueSlug, setNewLeagueSlug] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [formData, setFormData] = useState({ ...emptyForm });

  const fetchLeagues = async () => {
    try {
      const { data, error } = await supabase.from('leagues').select('id, slug, name, description').order('name');
      if (error) throw error;
      const list = (data || []) as League[];
      setLeagues(list);
      if (list.length > 0 && !selectedLeague) setSelectedLeague(list[0]);
    } catch (error) {
      console.error('Error fetching leagues:', error);
      toast.error('Failed to fetch leagues');
    }
  };

  const fetchSeasons = async () => {
    if (!selectedLeague) return;
    try {
      if (selectedLeague.slug === 'ctfpl') {
        const { data, error } = await supabase.from('ctfpl_seasons').select('*').order('season_number', { ascending: false });
        if (error) throw error;
        setSeasons(data || []);
      } else {
        const { data, error } = await supabase.from('league_seasons').select('*').eq('league_id', selectedLeague.id).order('season_number', { ascending: false });
        if (error) throw error;
        setSeasons(data || []);
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
      toast.error('Failed to fetch seasons');
    }
  };

  const fetchSquads = async () => {
    try {
      const { data, error } = await supabase.from('squads').select('id, name, tag, is_active').order('name');
      if (error) throw error;
      setSquads(data || []);
    } catch (error) {
      console.error('Error fetching squads:', error);
      toast.error('Failed to fetch squads');
    }
  };

  useEffect(() => { if (isOpen) { fetchLeagues(); fetchSquads(); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen && selectedLeague) fetchSeasons(); }, [isOpen, selectedLeague?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => { setFormData({ ...emptyForm }); setSelectedSeason(null); };
  const startAdd = () => { resetForm(); setMode('add'); };
  const startEdit = (season: Season) => {
    setFormData({
      season_number: season.season_number.toString(),
      season_name: season.season_name || '',
      start_date: formatDateForInput(season.start_date),
      end_date: formatDateForInput(season.end_date),
      status: season.status,
      champion_squad_names: (season.champion_squad_ids || []).map(getSquadName).join(', '),
      runner_up_squad_names: (season.runner_up_squad_ids || []).map(getSquadName).join(', '),
      third_place_squad_names: (season.third_place_squad_ids || []).map(getSquadName).join(', '),
    });
    setSelectedSeason(season);
    setMode('edit');
  };

  // Squad names → ids, creating a legacy squad for any name that doesn't exist.
  const findOrCreateSquadIdsByNames = async (namesString: string): Promise<string[]> => {
    if (!namesString.trim()) return [];
    const names = namesString.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
    const squadIds: string[] = [];
    for (const name of names) {
      const squad = squads.find((s) =>
        s.name.toLowerCase() === name.toLowerCase() || s.tag.toLowerCase() === name.toLowerCase() || `${s.name} [${s.tag}]`.toLowerCase() === name.toLowerCase(),
      );
      if (squad) { squadIds.push(squad.id); continue; }
      try {
        const baseTag = name.slice(0, 4).toUpperCase();
        let finalTag = baseTag;
        let attemptCount = 0;
        while (attemptCount < 10) {
          const { data: newSquad, error } = await supabase
            .from('squads')
            .insert([{ name, tag: finalTag, is_active: false, captain_id: SYSTEM_USER_ID, description: 'Historical squad created for season records', is_legacy: true }])
            .select('id')
            .single();
          if (!error && newSquad) {
            squadIds.push(newSquad.id);
            setSquads((prev) => [...prev, { id: newSquad.id, name, tag: finalTag, is_active: false }]);
            toast.success(`Created historical squad ${name} [${finalTag}]`);
            break;
          }
          if (error?.code === '23505') {
            if (error.message.includes('squads_tag_key')) { attemptCount++; finalTag = baseTag.slice(0, 3) + attemptCount; continue; }
            if (error.message.includes('squads_name_key')) { toast.error(`Squad “${name}” already exists`); break; }
          }
          console.error('Error creating historical squad:', error);
          toast.error(`Failed to create squad ${name}: ${error?.message || 'unknown error'}`);
          break;
        }
      } catch (error) {
        console.error('Error creating squad:', error);
        toast.error(`Failed to create squad ${name}`);
      }
    }
    return squadIds;
  };

  const saveSeason = async () => {
    if (!formData.season_number) { toast.error('Season number is required'); return; }
    setLoading(true);
    try {
      const championIds = await findOrCreateSquadIdsByNames(formData.champion_squad_names);
      const runnerUpIds = await findOrCreateSquadIdsByNames(formData.runner_up_squad_names);
      const thirdPlaceIds = await findOrCreateSquadIdsByNames(formData.third_place_squad_names);
      const seasonData: Record<string, unknown> = {
        season_number: parseInt(formData.season_number),
        season_name: formData.season_name || null,
        start_date: formatDateForDatabase(formData.start_date),
        end_date: formatDateForDatabase(formData.end_date),
        status: formData.status,
        champion_squad_ids: championIds,
        runner_up_squad_ids: runnerUpIds,
        third_place_squad_ids: thirdPlaceIds,
      };
      if (selectedLeague?.slug === 'ctfpl') {
        if (mode === 'add') { const { error } = await supabase.from('ctfpl_seasons').insert([seasonData]); if (error) throw error; toast.success('Season created'); }
        else { const { error } = await supabase.from('ctfpl_seasons').update(seasonData).eq('id', selectedSeason?.id); if (error) throw error; toast.success('Season updated'); }
      } else if (selectedLeague) {
        const payload = { ...seasonData, league_id: selectedLeague.id };
        if (mode === 'add') { const { error } = await supabase.from('league_seasons').insert([payload]); if (error) throw error; toast.success('Season created'); }
        else { const { error } = await supabase.from('league_seasons').update(seasonData).eq('id', selectedSeason?.id); if (error) throw error; toast.success('Season updated'); }
      }
      fetchSeasons();
      setMode('view');
      resetForm();
    } catch (error) {
      console.error('Error saving season:', error);
      toast.error('Failed to save season');
    } finally {
      setLoading(false);
    }
  };

  const setActiveStatus = async (seasonId: string, makeActive: boolean) => {
    if (!selectedLeague) return;
    setLoading(true);
    try {
      if (selectedLeague.slug === 'ctfpl') {
        if (makeActive) await supabase.from('ctfpl_seasons').update({ status: 'completed' }).eq('status', 'active');
        const { error } = await supabase.from('ctfpl_seasons').update({ status: makeActive ? 'active' : 'completed' }).eq('id', seasonId);
        if (error) throw error;
      } else {
        if (makeActive) await supabase.from('league_seasons').update({ status: 'completed' }).eq('league_id', selectedLeague.id).eq('status', 'active');
        const { error } = await supabase.from('league_seasons').update({ status: makeActive ? 'active' : 'completed' }).eq('id', seasonId);
        if (error) throw error;
      }
      toast.success(makeActive ? 'Season is now active' : 'Season marked completed');
      fetchSeasons();
    } catch (error) {
      console.error('Error updating season status:', error);
      toast.error('Failed to update season status');
    } finally {
      setLoading(false);
    }
  };

  const addLeague = async () => {
    const slug = newLeagueSlug.trim().toLowerCase().replace(/\s+/g, '-');
    const name = newLeagueName.trim();
    if (!slug || !name) { toast.error('Slug and name are required'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('leagues').insert([{ slug, name }]).select('id, slug, name').single();
      if (error) throw error;
      toast.success(`League “${name}” added`);
      setNewLeagueSlug(''); setNewLeagueName(''); setShowAddLeague(false);
      await fetchLeagues();
      if (data) setSelectedLeague(data as League);
    } catch (error) {
      console.error('Error adding league:', error);
      toast.error('Failed to add league');
    } finally {
      setLoading(false);
    }
  };

  const getSquadName = (squadId: string) => {
    const squad = squads.find((s) => s.id === squadId);
    return squad ? `${squad.name} [${squad.tag}]` : `Historical squad (${squadId.slice(0, 8)})`;
  };

  const field = (label: string, key: keyof typeof emptyForm, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input {...props} value={formData[key]} onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))} className={inputCls} style={props.type === 'date' ? { colorScheme: 'dark' } : undefined} />
    </label>
  );

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-[#E6EDF7] hover:bg-white/10 transition-colors">
        Manage seasons
      </button>

      {isOpen && (
        <Modal
          title={`Seasons${selectedLeague ? ` · ${selectedLeague.name}` : ''}`}
          hint="Create seasons, set which one is active, and record the top three once a season ends."
          onClose={() => setIsOpen(false)}
          size="xl"
          actions={mode === 'view' ? <button type="button" onClick={startAdd} className={btnPrimary}>New season</button> : <button type="button" onClick={() => setMode('view')} className={btnQuiet}>Back to list</button>}
        >
          <div className="space-y-4">
            {/* League */}
            <div className="flex flex-wrap items-center gap-2">
              {leagues.map((l) => <Chip key={l.id} active={selectedLeague?.id === l.id} onClick={() => setSelectedLeague(l)}>{l.name}</Chip>)}
              <button type="button" onClick={() => setShowAddLeague(!showAddLeague)} className="text-xs text-[#22D3EE] hover:text-[#67E8F9]">+ Add league</button>
            </div>
            {showAddLeague && (
              <div className="flex flex-wrap items-end gap-2 rounded-md bg-[#1B2438] p-3">
                <label className="block"><span className={labelCls}>Slug</span><input type="text" value={newLeagueSlug} onChange={(e) => setNewLeagueSlug(e.target.value)} placeholder="ctfdl" className={`${inputCls} w-36`} /></label>
                <label className="block"><span className={labelCls}>Name</span><input type="text" value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} placeholder="CTFDL" className={`${inputCls} w-44`} /></label>
                <button type="button" onClick={addLeague} disabled={loading} className={btnPrimary}>Add</button>
              </div>
            )}

            {mode === 'view' ? (
              seasons.length === 0 ? (
                <Empty>No seasons for {selectedLeague?.name || 'this league'} yet.</Empty>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-md bg-[#1B2438]">
                  {seasons.map((season) => {
                    const hasPodium = season.champion_squad_ids?.length > 0 || season.runner_up_squad_ids?.length > 0 || season.third_place_squad_ids?.length > 0;
                    return (
                      <li key={season.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-lg text-[#E6EDF7]">Season {season.season_number}</span>
                            {season.season_name && <span className="text-sm text-[#8B98B0]">{season.season_name}</span>}
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL[season.status]}`}>{season.status}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#8B98B0]">
                            {season.start_date && <span>{formatDateForDisplay(season.start_date)}{season.end_date ? ` – ${formatDateForDisplay(season.end_date)}` : ''}</span>}
                            <span>{season.total_squads} squads · {season.total_matches} matches</span>
                          </div>
                          {hasPodium && (
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                              {season.champion_squad_ids?.length > 0 && <span><span className="text-[#F59E0B]">1st</span> <span className="text-[#E6EDF7]">{season.champion_squad_ids.map(getSquadName).join(', ')}</span></span>}
                              {season.runner_up_squad_ids?.length > 0 && <span><span className="text-[#8B98B0]">2nd</span> <span className="text-[#E6EDF7]">{season.runner_up_squad_ids.map(getSquadName).join(', ')}</span></span>}
                              {season.third_place_squad_ids?.length > 0 && <span><span className="text-[#8B98B0]">3rd</span> <span className="text-[#E6EDF7]">{season.third_place_squad_ids.map(getSquadName).join(', ')}</span></span>}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(season)} className={btnQuiet}>Edit</button>
                          {season.status !== 'active'
                            ? <button type="button" onClick={() => setActiveStatus(season.id, true)} disabled={loading} className={btnQuiet}>Set active</button>
                            : <button type="button" onClick={() => setActiveStatus(season.id, false)} disabled={loading} className={`${btnQuiet} text-[#F59E0B]`}>Mark completed</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-[#E6EDF7]">{mode === 'add' ? 'New season' : `Editing Season ${selectedSeason?.season_number}`}</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {field('Season number *', 'season_number', { type: 'number', placeholder: '5' })}
                  {field('Name', 'season_name', { type: 'text', placeholder: 'optional' })}
                  {field('Start', 'start_date', { type: 'date' })}
                  {field('End', 'end_date', { type: 'date' })}
                  <label className="block">
                    <span className={labelCls}>Status</span>
                    <select value={formData.status} onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as 'upcoming' | 'active' | 'completed' }))} className={inputCls} style={{ colorScheme: 'dark' }}>
                      <option value="upcoming">Upcoming</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>
                <div>
                  <div className={labelCls}>Playoff top three <span className="normal-case tracking-normal text-[#8B98B0]/70">squad names, comma-separated; unknown names become legacy squads</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {field('1st · Golden flag', 'champion_squad_names', { type: 'text' })}
                    {field('2nd · Silver flag', 'runner_up_squad_names', { type: 'text' })}
                    {field('3rd · Bronze flag', 'third_place_squad_names', { type: 'text' })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setMode('view')} className={btnQuiet}>Cancel</button>
                  <button type="button" onClick={saveSeason} disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : mode === 'add' ? 'Create season' : 'Save changes'}</button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default SeasonManagementModal;
