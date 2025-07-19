'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

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

const SquadMaintenanceModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'legacy'>('all');
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const fetchSquads = async () => {
    try {
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          captain_id,
          is_active,
          is_legacy,
          created_at,
          updated_at,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members(id)
        `)
        .order('name');

      if (error) throw error;

      const formattedSquads: Squad[] = (data || []).map((squad: any) => ({
        ...squad,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: squad.squad_members?.length || 0
      }));

      setSquads(formattedSquads);
    } catch (error) {
      console.error('Error fetching squads:', error);
      toast.error('Failed to fetch squads');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSquads();
    }
  }, [isOpen]);

  const startEdit = (squad: Squad) => {
    setEditingSquad(squad);
    setEditName(squad.name);
    setEditTag(squad.tag);
    setEditDescription(squad.description || '');
  };

  const cancelEdit = () => {
    setEditingSquad(null);
    setEditName('');
    setEditTag('');
    setEditDescription('');
  };

  const saveSquadChanges = async () => {
    if (!editingSquad || !editName.trim() || !editTag.trim()) {
      toast.error('Squad name and tag are required');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('squads')
        .update({
          name: editName.trim(),
          tag: editTag.trim().toUpperCase(),
          description: editDescription.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingSquad.id);

      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('squads_name_key')) {
            toast.error('Squad name already exists');
          } else if (error.message.includes('squads_tag_key')) {
            toast.error('Squad tag already exists');
          } else {
            toast.error('Squad name or tag already exists');
          }
        } else {
          throw error;
        }
        return;
      }

      toast.success('Squad updated successfully');
      await fetchSquads();
      cancelEdit();
    } catch (error) {
      console.error('Error updating squad:', error);
      toast.error('Failed to update squad');
    } finally {
      setLoading(false);
    }
  };

  const filteredSquads = squads.filter(squad => {
    // Apply filter
    if (filter === 'active' && (!squad.is_active || squad.is_legacy)) return false;
    if (filter === 'inactive' && (squad.is_active || squad.is_legacy)) return false;
    if (filter === 'legacy' && !squad.is_legacy) return false;

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        squad.name.toLowerCase().includes(term) ||
        squad.tag.toLowerCase().includes(term) ||
        squad.captain_alias.toLowerCase().includes(term)
      );
    }

    return true;
  });

  const getSquadStatusBadge = (squad: Squad) => {
    if (squad.is_legacy) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
          Legacy
        </span>
      );
    } else if (squad.is_active) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30 rounded-full">
          Active
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-full">
          Inactive
        </span>
      );
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300"
      >
        🔧 Maintain Squads
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
              className="bg-gray-900 border border-blue-500/30 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gray-800/50 px-6 py-4 border-b border-blue-500/30 flex justify-between items-center">
                <h2 className="text-blue-400 text-xl font-bold">🔧 Squad Maintenance</h2>
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
                  {/* Controls */}
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Search */}
                      <div className="flex items-center gap-2">
                        <label className="text-gray-300 font-medium">Search:</label>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Squad name, tag, or captain..."
                          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400"
                        />
                      </div>

                      {/* Filter */}
                      <div className="flex items-center gap-2">
                        <label className="text-gray-300 font-medium">Filter:</label>
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value as any)}
                          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Squads</option>
                          <option value="active">Active Only</option>
                          <option value="inactive">Inactive Only</option>
                          <option value="legacy">Legacy Only</option>
                        </select>
                      </div>

                      <div className="text-gray-400 text-sm">
                        Showing {filteredSquads.length} of {squads.length} squads
                      </div>
                    </div>
                  </div>

                  {/* Squad List */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-700/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Squad
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Tag
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Captain
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Members
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                          {filteredSquads.map((squad) => (
                            <tr key={squad.id} className="hover:bg-gray-700/25">
                              {editingSquad?.id === squad.id ? (
                                // Edit Mode Row
                                <>
                                  <td className="px-4 py-4">
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className="w-full bg-gray-700 border border-gray-600 text-white px-2 py-1 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="Squad name"
                                    />
                                  </td>
                                  <td className="px-4 py-4">
                                    <input
                                      type="text"
                                      value={editTag}
                                      onChange={(e) => setEditTag(e.target.value.toUpperCase())}
                                      className="w-full bg-gray-700 border border-gray-600 text-white px-2 py-1 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="TAG"
                                      maxLength={10}
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-sm text-gray-300">
                                    {squad.captain_alias}
                                  </td>
                                  <td className="px-4 py-4 text-center text-sm text-gray-300">
                                    {squad.member_count}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    {getSquadStatusBadge(squad)}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={saveSquadChanges}
                                        disabled={loading}
                                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs transition-colors disabled:opacity-50"
                                      >
                                        {loading ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={cancelEdit}
                                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                // View Mode Row
                                <>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <div>
                                      <div className="text-sm font-medium text-white">
                                        {squad.name}
                                      </div>
                                      {squad.description && (
                                        <div className="text-sm text-gray-400 truncate max-w-xs">
                                          {squad.description}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <span className="bg-gray-700 text-white px-2 py-1 rounded text-sm font-mono">
                                      {squad.tag}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {squad.captain_alias}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-300">
                                    {squad.member_count}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-center">
                                    {getSquadStatusBadge(squad)}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-center">
                                    <button
                                      onClick={() => startEdit(squad)}
                                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs transition-colors"
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {filteredSquads.length === 0 && (
                      <div className="p-8 text-center text-gray-400">
                        No squads found matching your criteria.
                      </div>
                    )}
                  </div>

                  {/* Description Edit Section */}
                  {editingSquad && (
                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                      <h3 className="text-white font-semibold mb-2">Squad Description</h3>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Optional squad description..."
                        rows={3}
                      />
                    </div>
                  )}

                  {/* Help Section */}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-blue-400 mb-2">💡 Squad Maintenance</h3>
                    <ul className="space-y-1 text-gray-300 text-sm">
                      <li>• Edit squad names and tags for all squad types (active, inactive, legacy)</li>
                      <li>• Squad names and tags must be unique across all squads</li>
                      <li>• Tags are automatically converted to uppercase</li>
                      <li>• Changes are saved immediately when you click Save</li>
                      <li>• Use the search and filter options to find specific squads quickly</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SquadMaintenanceModal;