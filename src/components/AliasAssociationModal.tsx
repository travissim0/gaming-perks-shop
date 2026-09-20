'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { Modal, Chip } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';

interface Profile { id: string; in_game_alias: string; email: string }
interface ExistingAlias { id: string; alias: string; is_primary: boolean; added_at: string }

/**
 * Staff tool: attach in-game aliases (from recorded games) to a site profile
 * so stats consolidate across name changes. One alias is primary.
 */
export default function AliasAssociationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [aliasToAdd, setAliasToAdd] = useState('');
  const [targetProfileSearch, setTargetProfileSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [existingAliases, setExistingAliases] = useState<ExistingAlias[]>([]);
  const [isPrimary, setIsPrimary] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ExistingAlias | null>(null);

  const searchProfiles = async (searchTerm: string) => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email')
        .or(`in_game_alias.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching profiles:', error);
      toast.error('Error searching profiles');
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchExistingAliases = async (profileId: string) => {
    try {
      const { data, error } = await supabase
        .from('profile_aliases')
        .select('id, alias, is_primary, added_at')
        .eq('profile_id', profileId)
        .order('is_primary', { ascending: false })
        .order('added_at', { ascending: true });
      if (error) throw error;
      const aliases = data || [];
      setExistingAliases(aliases);
      // The Add box starts empty: it used to be pre-filled with the current primary, which read as
      // "enter your name again". The primary chip is only forced on when the profile has none yet.
      setAliasToAdd('');
      setIsPrimary(!aliases.some((a) => a.is_primary));
    } catch (error) {
      console.error('Error fetching aliases:', error);
      toast.error('Error fetching existing aliases');
    }
  };

  const selectProfile = async (profile: Profile) => {
    setSelectedProfile(profile);
    setTargetProfileSearch(profile.in_game_alias || profile.email);
    setSearchResults([]);
    await fetchExistingAliases(profile.id);
  };

  const addAlias = async () => {
    if (!selectedProfile || !aliasToAdd.trim()) { toast.error('Pick a profile and type an alias'); return; }
    setLoading(true);
    try {
      const { data: existingAlias, error: checkError } = await supabase
        .from('profile_aliases')
        .select('alias')
        .eq('profile_id', selectedProfile.id)
        .eq('alias', aliasToAdd.trim())
        .single();
      if (checkError && checkError.code !== 'PGRST116') throw checkError;
      if (existingAlias) { toast.error('This alias is already on this profile'); return; }

      const hasPrimaryAlias = existingAliases.find((a) => a.is_primary);
      const shouldBePrimary = isPrimary || !hasPrimaryAlias;
      if (shouldBePrimary) {
        const { error: updateError } = await supabase.from('profile_aliases').update({ is_primary: false }).eq('profile_id', selectedProfile.id).eq('is_primary', true);
        if (updateError) throw updateError;
      }
      const { data: inserted, error: insertError } = await supabase
        .from('profile_aliases')
        .insert({ profile_id: selectedProfile.id, alias: aliasToAdd.trim(), is_primary: shouldBePrimary, added_by: 'admin' })
        .select('id');
      if (insertError) throw insertError;
      if (!inserted || inserted.length === 0) throw new Error('Nothing was saved — you may not have permission');

      toast.success(`Added “${aliasToAdd.trim()}”${shouldBePrimary ? ' as primary' : ''}`);
      setAliasToAdd('');
      setIsPrimary(false);
      await fetchExistingAliases(selectedProfile.id);
    } catch (error: any) {
      console.error('Error adding alias:', error);
      toast.error(error?.message || 'Error adding alias');
    } finally {
      setLoading(false);
    }
  };

  const removeAlias = async (alias: ExistingAlias) => {
    try {
      const { error } = await supabase.from('profile_aliases').delete().eq('id', alias.id);
      if (error) throw error;
      toast.success(`Removed “${alias.alias}”`);
      setConfirmRemove(null);
      if (selectedProfile) await fetchExistingAliases(selectedProfile.id);
    } catch (error) {
      console.error('Error removing alias:', error);
      toast.error('Error removing alias');
    }
  };

  const setPrimaryAlias = async (aliasId: string, aliasName: string) => {
    if (!selectedProfile) return;
    try {
      const { error: updateError } = await supabase.from('profile_aliases').update({ is_primary: false }).eq('profile_id', selectedProfile.id);
      if (updateError) throw updateError;
      const { error: setPrimaryError } = await supabase.from('profile_aliases').update({ is_primary: true }).eq('id', aliasId);
      if (setPrimaryError) throw setPrimaryError;
      toast.success(`“${aliasName}” is now the primary alias`);
      await fetchExistingAliases(selectedProfile.id);
    } catch (error) {
      console.error('Error setting primary alias:', error);
      toast.error('Error setting primary alias');
    }
  };

  const resetForm = () => {
    setAliasToAdd(''); setTargetProfileSearch(''); setSelectedProfile(null); setSearchResults([]); setExistingAliases([]); setIsPrimary(false); setConfirmRemove(null);
  };
  const closeModal = () => { setIsOpen(false); resetForm(); };

  const primary = existingAliases.find((a) => a.is_primary);

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-[#E6EDF7] hover:bg-white/10 transition-colors">
        Manage aliases
      </button>

      {isOpen && (
        <Modal title="Aliases" hint="Attach in-game names from recorded games to a site profile so stats follow the player across name changes." onClose={closeModal} size="lg">
          <div className="space-y-4">
            {/* Profile search */}
            <div className="relative">
              <label className={labelCls}>Profile</label>
              <input
                type="text"
                value={targetProfileSearch}
                onChange={(e) => { setTargetProfileSearch(e.target.value); setSelectedProfile(null); searchProfiles(e.target.value); }}
                placeholder="Search by alias or email"
                className={inputCls}
              />
              {searchLoading && <span className="absolute right-3 top-7 text-[11px] text-[#8B98B0]">searching…</span>}
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-white/10 bg-[#0B0F1A] shadow-xl">
                  {searchResults.map((profile) => (
                    <button key={profile.id} type="button" onClick={() => selectProfile(profile)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5">
                      <span className="text-[#E6EDF7]">{profile.in_game_alias || 'No alias set'}</span>
                      <span className="text-xs text-[#8B98B0]">{profile.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProfile && (
              <>
                {/* Current aliases */}
                <div className="rounded-md bg-[#1B2438] overflow-hidden">
                  <div className="px-3 py-1.5 flex items-center justify-between border-b border-white/[0.06] bg-[#0B0F1A]/60">
                    <span className="text-[11px] uppercase tracking-wide text-[#8B98B0]">Aliases on <span className="text-[#E6EDF7] normal-case tracking-normal">{selectedProfile.in_game_alias || selectedProfile.email}</span>&apos;s account</span>
                    <span className="text-[11px] text-[#8B98B0]">{existingAliases.length} alias{existingAliases.length === 1 ? '' : 'es'} · primary {primary ? <span className="text-[#F59E0B]">{primary.alias}</span> : <span className="text-[#F87171]">none</span>}</span>
                  </div>
                  {existingAliases.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-[#8B98B0]">No aliases yet. The first one you add becomes primary.</p>
                  ) : (
                    <ul className="divide-y divide-white/[0.04]">
                      {existingAliases.map((alias) => (
                        <li key={alias.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate text-[#E6EDF7]">
                            {alias.alias}
                            {alias.is_primary && <span className="ml-2 rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">Primary</span>}
                          </span>
                          {!alias.is_primary && <button type="button" onClick={() => setPrimaryAlias(alias.id, alias.alias)} className="text-xs text-[#F59E0B] hover:text-[#FBBF24]">Make primary</button>}
                          <button type="button" onClick={() => setConfirmRemove(alias)} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Add */}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block flex-1 min-w-[200px]">
                    <span className={labelCls}>Add an alias</span>
                    <input type="text" value={aliasToAdd} onChange={(e) => setAliasToAdd(e.target.value)} placeholder="In-game name as it appears in stats" className={inputCls} />
                  </label>
                  <Chip active={isPrimary || !primary} tone="warn" onClick={() => primary && setIsPrimary(!isPrimary)} title={primary ? 'Make this the primary alias' : 'No primary yet, so this one will be'} disabled={!primary}>
                    Primary
                  </Chip>
                  <button type="button" onClick={addAlias} disabled={loading || !aliasToAdd.trim()} className={btnPrimary}>{loading ? 'Adding…' : 'Add'}</button>
                </div>
              </>
            )}

            {confirmRemove && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#F87171]/10 px-3 py-2 text-sm text-[#FCA5A5]">
                <span>Remove “{confirmRemove.alias}” from this profile?</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setConfirmRemove(null)} className={btnQuiet}>Keep</button>
                  <button type="button" onClick={() => removeAlias(confirmRemove)} className={btnDanger}>Remove</button>
                </span>
              </div>
            )}

            <p className="text-[11px] text-[#8B98B0]">Aliases don&apos;t need site accounts of their own. The primary alias is the display name used for stats.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
