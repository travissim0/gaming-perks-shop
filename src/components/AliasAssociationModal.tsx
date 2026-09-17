'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Profile {
  id: string;
  in_game_alias: string;
  email: string;
}

interface ExistingAlias {
  id: string;
  alias: string;
  is_primary: boolean;
  added_at: string;
}

export default function AliasAssociationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Form state
  const [aliasToAdd, setAliasToAdd] = useState('');
  const [targetProfileSearch, setTargetProfileSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [existingAliases, setExistingAliases] = useState<ExistingAlias[]>([]);
  const [isPrimary, setIsPrimary] = useState(false);

  const searchProfiles = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

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
      
      // Set primary alias in the input field if it exists
      const primaryAlias = aliases.find(alias => alias.is_primary);
      if (primaryAlias) {
        setAliasToAdd(primaryAlias.alias);
        setIsPrimary(false); // Don't auto-check primary if one already exists
      } else {
        // Clear the input if no primary alias exists and auto-set as primary
        setAliasToAdd('');
        setIsPrimary(true); // Auto-check primary since none exists
      }
    } catch (error) {
      console.error('Error fetching aliases:', error);
      toast.error('Error fetching existing aliases');
    }
  };

  const selectProfile = async (profile: Profile) => {
    setSelectedProfile(profile);
    setTargetProfileSearch(profile.in_game_alias || profile.email);
    setSearchResults([]);
    
    // Fetch existing aliases and set primary alias in input field
    await fetchExistingAliases(profile.id);
  };

  const addAlias = async () => {
    if (!selectedProfile || !aliasToAdd.trim()) {
      toast.error('Please select a profile and enter an alias');
      return;
    }

    setLoading(true);
    try {
      // Check if alias already exists for this profile
      const { data: existingAlias, error: checkError } = await supabase
        .from('profile_aliases')
        .select('alias')
        .eq('profile_id', selectedProfile.id)
        .eq('alias', aliasToAdd.trim())
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingAlias) {
        toast.error('This alias already exists for this profile');
        return;
      }

      // Auto-set as primary if no primary alias exists
      const hasPrimaryAlias = existingAliases.find(a => a.is_primary);
      const shouldBePrimary = isPrimary || !hasPrimaryAlias;

      // If setting as primary, unset other primary aliases
      if (shouldBePrimary) {
        const { error: updateError } = await supabase
          .from('profile_aliases')
          .update({ is_primary: false })
          .eq('profile_id', selectedProfile.id)
          .eq('is_primary', true);

        if (updateError) throw updateError;
      }

      // Add the new alias
      const { error: insertError } = await supabase
        .from('profile_aliases')
        .insert({
          profile_id: selectedProfile.id,
          alias: aliasToAdd.trim(),
          is_primary: shouldBePrimary,
          added_by: 'admin'
        });

      if (insertError) throw insertError;

      toast.success(`Alias "${aliasToAdd.trim()}" added successfully${shouldBePrimary ? ' as primary' : ''}`);
      setAliasToAdd('');
      setIsPrimary(false);
      
      // Refresh existing aliases
      await fetchExistingAliases(selectedProfile.id);
    } catch (error) {
      console.error('Error adding alias:', error);
      toast.error('Error adding alias');
    } finally {
      setLoading(false);
    }
  };

  const removeAlias = async (aliasId: string, aliasName: string) => {
    if (!window.confirm(`Remove alias "${aliasName}"?`)) return;

    try {
      const { error } = await supabase
        .from('profile_aliases')
        .delete()
        .eq('id', aliasId);

      if (error) throw error;

      toast.success(`Alias "${aliasName}" removed successfully`);
      
      // Refresh existing aliases
      if (selectedProfile) {
        await fetchExistingAliases(selectedProfile.id);
      }
    } catch (error) {
      console.error('Error removing alias:', error);
      toast.error('Error removing alias');
    }
  };

  const setPrimaryAlias = async (aliasId: string, aliasName: string) => {
    if (!selectedProfile) return;

    try {
      // First, unset all primary flags
      const { error: updateError } = await supabase
        .from('profile_aliases')
        .update({ is_primary: false })
        .eq('profile_id', selectedProfile.id);

      if (updateError) throw updateError;

      // Then set the selected alias as primary
      const { error: setPrimaryError } = await supabase
        .from('profile_aliases')
        .update({ is_primary: true })
        .eq('id', aliasId);

      if (setPrimaryError) throw setPrimaryError;

      toast.success(`"${aliasName}" set as primary alias`);
      
      // Refresh existing aliases
      await fetchExistingAliases(selectedProfile.id);
    } catch (error) {
      console.error('Error setting primary alias:', error);
      toast.error('Error setting primary alias');
    }
  };

  const resetForm = () => {
    setAliasToAdd('');
    setTargetProfileSearch('');
    setSelectedProfile(null);
    setSearchResults([]);
    setExistingAliases([]);
    setIsPrimary(false);
  };

  const closeModal = () => {
    setIsOpen(false);
    resetForm();
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300"
      >
        🏷️ Manage Aliases
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeModal}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-gradient-to-br from-gray-800 to-gray-900 border border-cyan-500/30 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-cyan-400">🏷️ Alias Association</h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Profile Search */}
                <div>
                  <label className="block text-sm font-medium text-cyan-400 mb-2">
                    Search for Profile
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={targetProfileSearch}
                      onChange={(e) => {
                        setTargetProfileSearch(e.target.value);
                        searchProfiles(e.target.value);
                      }}
                      placeholder="Search by in-game alias or email..."
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-cyan-500 focus:outline-none"
                    />
                    {searchLoading && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-400 border-t-transparent"></div>
                      </div>
                    )}
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="mt-2 bg-gray-700 border border-gray-600 rounded-lg overflow-hidden">
                      {searchResults.map((profile) => (
                        <button
                          key={profile.id}
                          onClick={() => selectProfile(profile)}
                          className="w-full p-3 text-left hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                        >
                          <div className="text-white font-medium">
                            {profile.in_game_alias || 'No alias set'}
                          </div>
                          <div className="text-gray-400 text-sm">{profile.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Profile Info */}
                {selectedProfile && (
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-white mb-2">Selected Profile</h3>
                    <div className="space-y-1">
                      <p><span className="text-gray-400">Profile Alias:</span> <span className="text-cyan-400">{selectedProfile.in_game_alias || 'Not set'}</span></p>
                      <p><span className="text-gray-400">Email:</span> <span className="text-white">{selectedProfile.email}</span></p>
                      <p>
                        <span className="text-gray-400">Primary Alias:</span> 
                        <span className={`ml-2 ${existingAliases.find(a => a.is_primary) ? 'text-yellow-400' : 'text-red-400'}`}>
                          {existingAliases.find(a => a.is_primary)?.alias || 'None set'}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-400">Total Aliases:</span> 
                        <span className="text-white ml-2">{existingAliases.length}</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Existing Aliases Preview */}
                {selectedProfile && existingAliases.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-cyan-400">Current Aliases</h3>
                    <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-3">
                      <div className="flex flex-wrap gap-2">
                        {existingAliases.slice(0, 5).map((alias) => (
                          <span
                            key={alias.id}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              alias.is_primary 
                                ? 'bg-yellow-600 text-yellow-100' 
                                : 'bg-gray-600 text-gray-200'
                            }`}
                          >
                            {alias.alias}
                            {alias.is_primary && ' ★'}
                          </span>
                        ))}
                        {existingAliases.length > 5 && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500 text-gray-300">
                            +{existingAliases.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Add New Alias */}
                {selectedProfile && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-cyan-400">Add New Alias</h3>
                      {existingAliases.find(a => a.is_primary) && (
                        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                          Primary alias loaded below
                        </span>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Alias Name
                        {existingAliases.find(a => a.is_primary) && (
                          <span className="text-xs text-yellow-400 ml-2">(Primary alias loaded)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={aliasToAdd}
                        onChange={(e) => setAliasToAdd(e.target.value)}
                        placeholder={
                          existingAliases.find(a => a.is_primary) 
                            ? "Primary alias loaded - edit or add new..." 
                            : "Enter alias to associate (will be set as primary)..."
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-cyan-500 focus:outline-none"
                      />
                      {!existingAliases.find(a => a.is_primary) && (
                        <p className="text-xs text-blue-400 mt-1">
                          💡 This profile has no primary alias. The first alias you add will be set as primary.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isPrimary"
                        checked={isPrimary}
                        onChange={(e) => setIsPrimary(e.target.checked)}
                        disabled={!existingAliases.find(a => a.is_primary) && existingAliases.length === 0}
                        className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 disabled:opacity-50"
                      />
                      <label htmlFor="isPrimary" className="text-sm text-gray-300">
                        Set as primary alias
                        {!existingAliases.find(a => a.is_primary) && (
                          <span className="text-yellow-400 ml-2">(Required - no primary exists)</span>
                        )}
                      </label>
                    </div>

                    <button
                      onClick={addAlias}
                      disabled={loading || !aliasToAdd.trim()}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      {loading ? 'Adding...' : 'Add Alias'}
                    </button>
                  </div>
                )}

                {/* Existing Aliases */}
                {existingAliases.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-cyan-400">Existing Aliases</h3>
                    
                    <div className="space-y-2">
                      {existingAliases.map((alias) => (
                        <div
                          key={alias.id}
                          className="flex items-center justify-between bg-gray-700/50 border border-gray-600 rounded-lg p-3"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">{alias.alias}</span>
                            {alias.is_primary && (
                              <span className="bg-yellow-600 text-yellow-100 px-2 py-1 rounded text-xs font-bold">
                                PRIMARY
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {!alias.is_primary && (
                              <button
                                onClick={() => setPrimaryAlias(alias.id, alias.alias)}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs transition-colors"
                              >
                                Set Primary
                              </button>
                            )}
                            <button
                              onClick={() => removeAlias(alias.id, alias.alias)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Help Text */}
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-blue-400 font-semibold mb-2">ℹ️ How it works</h4>
                  <ul className="text-sm text-blue-200 space-y-1">
                    <li>• Search for a player by their current alias or email</li>
                    <li>• Add any in-game alias they've used to their profile</li>
                    <li>• Aliases don't need to have website accounts</li>
                    <li>• Set one alias as primary for display purposes</li>
                    <li>• This helps consolidate player stats across name changes</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}