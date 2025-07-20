'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

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

interface Squad {
  id: string;
  name: string;
  tag: string;
  is_active?: boolean;
}

const SYSTEM_USER_ID = '7066f090-a1a1-4f5f-bf1a-374d0e06130c'; // System user for historical squads

// Helper functions to handle date timezone issues
const formatDateForInput = (dateString: string | null): string => {
  if (!dateString) return '';
  // Convert database date to local date string for input (YYYY-MM-DD)
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateForDatabase = (dateString: string): string | null => {
  if (!dateString.trim()) return null;
  // Convert input date to proper database format maintaining the selected date
  const date = new Date(dateString + 'T00:00:00');
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
};

const formatDateForDisplay = (dateString: string | null): string => {
  if (!dateString) return '';
  // Parse date as local date to avoid timezone shifts in display
  const [year, month, day] = dateString.split('T')[0].split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString();
};

const SeasonManagementModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    season_number: '',
    season_name: '',
    start_date: '',
    end_date: '',
    status: 'upcoming' as 'upcoming' | 'active' | 'completed',
    champion_squad_names: '' as string,
    runner_up_squad_names: '' as string,
    third_place_squad_names: '' as string
  });

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('ctfpl_seasons')
        .select('*')
        .order('season_number', { ascending: false });

      if (error) throw error;
      setSeasons(data || []);
    } catch (error) {
      console.error('Error fetching seasons:', error);
      toast.error('Failed to fetch seasons');
    }
  };

  const fetchSquads = async () => {
    try {
      const { data, error } = await supabase
        .from('squads')
        .select('id, name, tag, is_active')
        .order('name');

      if (error) throw error;
      setSquads(data || []);
    } catch (error) {
      console.error('Error fetching squads:', error);
      toast.error('Failed to fetch squads');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSeasons();
      fetchSquads();
    }
  }, [isOpen]);

  const resetForm = () => {
    setFormData({
      season_number: '',
      season_name: '',
      start_date: '',
      end_date: '',
      status: 'upcoming' as 'upcoming' | 'active' | 'completed',
      champion_squad_names: '',
      runner_up_squad_names: '',
      third_place_squad_names: ''
    });
    setSelectedSeason(null);
  };

  const startAdd = () => {
    resetForm();
    setMode('add');
  };

  const startEdit = (season: Season) => {
    // Convert squad IDs to names for display
    const championNames = (season.champion_squad_ids || []).map(getSquadName).join(', ');
    const runnerUpNames = (season.runner_up_squad_ids || []).map(getSquadName).join(', ');
    const thirdPlaceNames = (season.third_place_squad_ids || []).map(getSquadName).join(', ');

    setFormData({
      season_number: season.season_number.toString(),
      season_name: season.season_name || '',
      start_date: formatDateForInput(season.start_date),
      end_date: formatDateForInput(season.end_date),
      status: season.status,
      champion_squad_names: championNames,
      runner_up_squad_names: runnerUpNames,
      third_place_squad_names: thirdPlaceNames
    });
    setSelectedSeason(season);
    setMode('edit');
  };

  // Helper function to find or create squad IDs by name
  const findOrCreateSquadIdsByNames = async (namesString: string): Promise<string[]> => {
    if (!namesString.trim()) return [];
    
    const names = namesString.split(',').map(name => name.trim()).filter(name => name.length > 0);
    const squadIds: string[] = [];
    
    for (const name of names) {
      // First try to find existing squad
      let squad = squads.find(s => 
        s.name.toLowerCase() === name.toLowerCase() ||
        s.tag.toLowerCase() === name.toLowerCase() ||
        `${s.name} [${s.tag}]`.toLowerCase() === name.toLowerCase()
      );
      
      if (squad) {
        squadIds.push(squad.id);
      } else {
        // Create a new historical squad entry
        try {
          let baseTag = name.slice(0, 4).toUpperCase();
          let finalTag = baseTag;
          let attemptCount = 0;
          
          // Handle potential tag conflicts by adding numbers
          while (attemptCount < 10) {
            const { data: newSquad, error } = await supabase
              .from('squads')
              .insert([{
                name: name,
                tag: finalTag,
                is_active: false, // Mark as inactive (historical)
                captain_id: SYSTEM_USER_ID, // Use system user as captain
                description: 'Historical squad created for season records',
                is_legacy: true // Mark as legacy/historical
              }])
              .select('id')
              .single();
            
            if (!error && newSquad) {
              squadIds.push(newSquad.id);
              // Add the new squad to local state immediately
              setSquads(prev => [...prev, {
                id: newSquad.id,
                name: name,
                tag: finalTag,
                is_active: false
              }]);
              toast.success(`Created historical squad: ${name} [${finalTag}]`);
              break;
            }
            
            // Handle unique constraint violations
            if (error?.code === '23505') { // Unique violation
              if (error.message.includes('squads_tag_key')) {
                // Tag conflict - try with a number suffix
                attemptCount++;
                finalTag = baseTag.slice(0, 3) + attemptCount;
                continue;
              } else if (error.message.includes('squads_name_key')) {
                // Name conflict - squad already exists with this name
                console.warn(`Squad with name "${name}" already exists`);
                toast.error(`Squad "${name}" already exists in database`);
                break;
              }
            }
            
            // Other errors
            console.error('Error creating historical squad:', error);
            console.error('Squad data:', { name, tag: finalTag });
            toast.error(`Failed to create squad: ${name} - ${error?.message || 'Unknown error'}`);
            break;
          }
        } catch (error) {
          console.error('Error creating squad:', error);
          toast.error(`Failed to create squad: ${name}`);
        }
      }
    }
    
    return squadIds;
  };

  const saveSeason = async () => {
    if (!formData.season_number) {
      toast.error('Season number is required');
      return;
    }

    setLoading(true);
    try {
      // Convert squad names to IDs (create historical squads if they don't exist)
      const championIds = await findOrCreateSquadIdsByNames(formData.champion_squad_names);
      const runnerUpIds = await findOrCreateSquadIdsByNames(formData.runner_up_squad_names);
      const thirdPlaceIds = await findOrCreateSquadIdsByNames(formData.third_place_squad_names);

      const seasonData = {
        season_number: parseInt(formData.season_number),
        season_name: formData.season_name || null,
        start_date: formatDateForDatabase(formData.start_date),
        end_date: formatDateForDatabase(formData.end_date),
        status: formData.status,
        champion_squad_ids: championIds,
        runner_up_squad_ids: runnerUpIds,
        third_place_squad_ids: thirdPlaceIds
      };

      if (mode === 'add') {
        const { error } = await supabase
          .from('ctfpl_seasons')
          .insert([seasonData]);
        
        if (error) throw error;
        toast.success('Season created successfully');
      } else {
        const { error } = await supabase
          .from('ctfpl_seasons')
          .update(seasonData)
          .eq('id', selectedSeason?.id);
        
        if (error) throw error;
        toast.success('Season updated successfully');
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
    setLoading(true);
    try {
      if (makeActive) {
        // Set all other seasons to completed/upcoming
        await supabase
          .from('ctfpl_seasons')
          .update({ status: 'completed' })
          .eq('status', 'active');
      }

      const { error } = await supabase
        .from('ctfpl_seasons')
        .update({ status: makeActive ? 'active' : 'completed' })
        .eq('id', seasonId);

      if (error) throw error;
      
      toast.success(makeActive ? 'Season set as active' : 'Season marked as completed');
      fetchSeasons();
    } catch (error) {
      console.error('Error updating season status:', error);
      toast.error('Failed to update season status');
    } finally {
      setLoading(false);
    }
  };

  const getSquadName = (squadId: string) => {
    const squad = squads.find(s => s.id === squadId);
    return squad ? `${squad.name} [${squad.tag}]` : `Historical Squad (${squadId.slice(0, 8)})`;
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300"
      >
        🏆 Manage Seasons
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-yellow-500/30 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gray-800/50 px-6 py-4 border-b border-yellow-500/30 flex justify-between items-center">
                <h2 className="text-yellow-400 text-xl font-bold">🏆 Season Management</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                <div className="space-y-6">
                  {/* Mode Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode('view')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        mode === 'view' 
                          ? 'bg-yellow-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      👁️ View Seasons
                    </button>
                    <button
                      onClick={startAdd}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        mode === 'add' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      ➕ Add Season
                    </button>
                  </div>

                  {mode === 'view' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">All Seasons</h3>
                      <div className="grid gap-4">
                        {seasons.map((season) => (
                          <div
                            key={season.id}
                            className="bg-gray-800 border border-gray-600 rounded-lg p-4"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-white font-bold">
                                    Season {season.season_number}
                                  </h4>
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    season.status === 'active' ? 'bg-green-600' :
                                    season.status === 'completed' ? 'bg-gray-600' :
                                    'bg-blue-600'
                                  }`}>
                                    {season.status.toUpperCase()}
                                  </span>
                                </div>
                                
                                {season.season_name && (
                                  <p className="text-gray-300 mb-2">{season.season_name}</p>
                                )}
                                
                                <div className="text-sm text-gray-400 space-y-1">
                                  {season.start_date && (
                                    <p>Start: {formatDateForDisplay(season.start_date)}</p>
                                  )}
                                  {season.end_date && (
                                    <p>End: {formatDateForDisplay(season.end_date)}</p>
                                  )}
                                  <p>Squads: {season.total_squads} | Matches: {season.total_matches}</p>
                                </div>

                                {/* Playoffs Top 3 */}
                                {(season.champion_squad_ids?.length > 0 || season.runner_up_squad_ids?.length > 0 || season.third_place_squad_ids?.length > 0) && (
                                  <div className="mt-3 space-y-1">
                                    <div className="text-sm font-semibold text-white mb-1">Playoffs Top 3:</div>
                                    {season.champion_squad_ids?.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-yellow-400 text-sm font-bold">🥇 1st:</span>
                                        <span className="text-yellow-300 text-sm">
                                          {season.champion_squad_ids.map(getSquadName).join(', ')}
                                        </span>
                                      </div>
                                    )}
                                    {season.runner_up_squad_ids?.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-300 text-sm font-bold">🥈 2nd:</span>
                                        <span className="text-gray-200 text-sm">
                                          {season.runner_up_squad_ids.map(getSquadName).join(', ')}
                                        </span>
                                      </div>
                                    )}
                                    {season.third_place_squad_ids?.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-orange-400 text-sm font-bold">🥉 3rd:</span>
                                        <span className="text-orange-300 text-sm">
                                          {season.third_place_squad_ids.map(getSquadName).join(', ')}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex gap-2">
                                <button
                                  onClick={() => startEdit(season)}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                                >
                                  ✏️ Edit
                                </button>
                                
                                {season.status !== 'active' && (
                                  <button
                                    onClick={() => setActiveStatus(season.id, true)}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                                    disabled={loading}
                                  >
                                    ✅ Set Active
                                  </button>
                                )}
                                
                                {season.status === 'active' && (
                                  <button
                                    onClick={() => setActiveStatus(season.id, false)}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                                    disabled={loading}
                                  >
                                    🏁 Complete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(mode === 'add' || mode === 'edit') && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold text-white">
                        {mode === 'add' ? 'Add New Season' : 'Edit Season'}
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-white font-medium">Season Number *</label>
                          <input
                            type="number"
                            value={formData.season_number}
                            onChange={(e) => setFormData(prev => ({ ...prev, season_number: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            placeholder="e.g. 22"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="block text-white font-medium">Season Name</label>
                          <input
                            type="text"
                            value={formData.season_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, season_name: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            placeholder="e.g. 2024 Spring Championship"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="block text-white font-medium">Start Date <span className="text-gray-400 font-normal">(optional)</span></label>
                          <input
                            type="date"
                            value={formData.start_date}
                            onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="block text-white font-medium">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
                          <input
                            type="date"
                            value={formData.end_date}
                            onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="block text-white font-medium">Status</label>
                          <select
                            value={formData.status}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'upcoming' | 'active' | 'completed' }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                          >
                            <option value="upcoming">Upcoming</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </div>

                      {/* Playoffs Top 3 */}
                      <div className="space-y-4">
                        <h4 className="text-white font-semibold">Playoffs Top 3</h4>
                        <p className="text-gray-400 text-sm">Enter squad names separated by commas (e.g., "Squad Name 1, Squad Name 2")</p>
                        
                        {/* Golden Flag */}
                        <div className="space-y-2">
                          <label className="block text-yellow-400 font-bold">🥇 1st Place (Golden Flag)</label>
                          <input
                            type="text"
                            value={formData.champion_squad_names}
                            onChange={(e) => setFormData(prev => ({ ...prev, champion_squad_names: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                            placeholder="Enter 1st place squad name(s)"
                          />
                        </div>

                        {/* Silver Flag */}
                        <div className="space-y-2">
                          <label className="block text-gray-300 font-bold">🥈 2nd Place (Silver Flag)</label>
                          <input
                            type="text"
                            value={formData.runner_up_squad_names}
                            onChange={(e) => setFormData(prev => ({ ...prev, runner_up_squad_names: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                            placeholder="Enter 2nd place squad name(s)"
                          />
                        </div>

                        {/* Bronze Flag */}
                        <div className="space-y-2">
                          <label className="block text-orange-400 font-bold">🥉 3rd Place (Bronze Flag)</label>
                          <input
                            type="text"
                            value={formData.third_place_squad_names}
                            onChange={(e) => setFormData(prev => ({ ...prev, third_place_squad_names: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            placeholder="Enter 3rd place squad name(s)"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={saveSeason}
                          disabled={loading}
                          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          💾 {loading ? 'Saving...' : 'Save Season'}
                        </button>
                        <button
                          onClick={() => setMode('view')}
                          className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SeasonManagementModal;