'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { SquadRatingWithDetails, PlayerRatingWithDetails } from '@/types/database';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_alias: string;
  member_count: number;
  is_active: boolean;
  created_at: string;
  banner_url?: string;
}

interface SquadMember {
  id: string;
  player_id: string;
  profiles: {
    in_game_alias: string;
  };
}

interface PlayerRatingForm {
  player_id: string;
  player_alias: string;
  rating: number;
  notes: string;
}

function AdminRatingsContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'edit'>('list');
  
  // Data states
  const [ratings, setRatings] = useState<SquadRatingWithDetails[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([]);
  
  // Form states
  const [selectedSquadId, setSelectedSquadId] = useState('');
  const [seasonName, setSeasonName] = useState('');
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [analystCommentary, setAnalystCommentary] = useState('');
  const [analystQuote, setAnalystQuote] = useState('');
  const [breakdownSummary, setBreakdownSummary] = useState('');
  const [playerRatings, setPlayerRatings] = useState<PlayerRatingForm[]>([]);
  
  // Edit states
  const [editingRating, setEditingRating] = useState<SquadRatingWithDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      checkAccess();
    }
  }, [user, loading]);

  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [hasAccess]);

  useEffect(() => {
    // Check for tab parameter in URL
    const tabParam = searchParams.get('tab');
    if (tabParam === 'create') {
      setActiveTab('create');
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedSquadId) {
      loadSquadMembers(selectedSquadId);
    } else {
      setSquadMembers([]);
      setPlayerRatings([]);
    }
  }, [selectedSquadId]);

  const checkAccess = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, is_media_manager')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const access = data?.is_admin || data?.is_media_manager || false;
      setHasAccess(access);
      
      if (!access) {
        toast.error('Access denied: Admin or Media Manager privileges required');
      }
    } catch (error) {
      console.error('Error checking access:', error);
      toast.error('Error checking permissions');
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    await Promise.all([loadRatings(), loadSquads()]);
  };

  const loadRatings = async () => {
    try {
      const response = await fetch('/api/squad-ratings');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch ratings');
      }

      setRatings(data.ratings || []);
    } catch (error) {
      console.error('Error loading ratings:', error);
      toast.error('Failed to load ratings');
    }
  };

  const loadSquads = async () => {
    try {
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          is_active,
          created_at,
          banner_url,
          captain_id,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members!inner(id)
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const formattedSquads: Squad[] = (data || []).map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: squad.squad_members?.length || 0,
        is_active: squad.is_active,
        created_at: squad.created_at,
        banner_url: squad.banner_url
      }));

      setSquads(formattedSquads);
    } catch (error) {
      console.error('Error loading squads:', error);
      toast.error('Failed to load squads');
    }
  };

  const loadSquadMembers = async (squadId: string) => {
    try {
      const { data, error } = await supabase
        .from('squad_members')
        .select(`
          id,
          player_id,
          profiles!squad_members_player_id_fkey(in_game_alias)
        `)
        .eq('squad_id', squadId)
        .eq('status', 'active');

      if (error) throw error;

      const members = (data || []).map((member: any) => ({
        id: member.id,
        player_id: member.player_id,
        profiles: {
          in_game_alias: member.profiles?.in_game_alias || 'Unknown Player'
        }
      }));

      setSquadMembers(members);
      
      // Initialize player ratings form
      const initialPlayerRatings = members.map(member => ({
        player_id: member.player_id,
        player_alias: member.profiles.in_game_alias,
        rating: 3.0,
        notes: ''
      }));
      
      setPlayerRatings(initialPlayerRatings);
    } catch (error) {
      console.error('Error loading squad members:', error);
      toast.error('Failed to load squad members');
    }
  };

  const resetForm = () => {
    setSelectedSquadId('');
    setSeasonName('');
    setAnalysisDate(new Date().toISOString().split('T')[0]);
    setAnalystCommentary('');
    setAnalystQuote('');
    setBreakdownSummary('');
    setPlayerRatings([]);
    setEditingRating(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSquadId || !seasonName.trim()) {
      toast.error('Please select a squad and enter a season name');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        squad_id: selectedSquadId,
        season_name: seasonName.trim(),
        analysis_date: analysisDate,
        analyst_commentary: analystCommentary.trim() || null,
        analyst_quote: analystQuote.trim() || null,
        breakdown_summary: breakdownSummary.trim() || null,
        player_ratings: playerRatings.filter(pr => pr.rating > 0)
      };

      const url = editingRating ? `/api/squad-ratings/${editingRating.id}` : '/api/squad-ratings';
      const method = editingRating ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save rating');
      }

      toast.success(editingRating ? 'Rating updated successfully!' : 'Rating created successfully!');
      resetForm();
      setActiveTab('list');
      await loadRatings();
    } catch (error) {
      console.error('Error saving rating:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (rating: SquadRatingWithDetails) => {
    try {
      // Load the full rating details including player ratings
      const response = await fetch(`/api/squad-ratings/${rating.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load rating details');
      }

      // Set form fields
      setEditingRating(rating);
      setSelectedSquadId(rating.squad_id);
      setSeasonName(rating.season_name);
      setAnalysisDate(rating.analysis_date);
      setAnalystCommentary(rating.analyst_commentary || '');
      setAnalystQuote(rating.analyst_quote || '');
      setBreakdownSummary(rating.breakdown_summary || '');

      // Load squad members first, then set player ratings
      await loadSquadMembers(rating.squad_id);
      
      // Set player ratings from the loaded data
      const existingPlayerRatings = data.player_ratings || [];
      setPlayerRatings(prev => prev.map(pr => {
        const existing = existingPlayerRatings.find((epr: any) => epr.player_id === pr.player_id);
        return existing ? {
          ...pr,
          rating: existing.rating,
          notes: existing.notes || ''
        } : pr;
      }));

      setActiveTab('edit');
    } catch (error) {
      console.error('Error loading rating for edit:', error);
      toast.error('Failed to load rating details');
    }
  };

  const handleDelete = async (ratingId: string) => {
    if (!confirm('Are you sure you want to delete this rating? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/squad-ratings/${ratingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete rating');
      }

      toast.success('Rating deleted successfully!');
      await loadRatings();
    } catch (error) {
      console.error('Error deleting rating:', error);
      toast.error('Failed to delete rating');
    }
  };

  const updatePlayerRating = (playerId: string, field: 'rating' | 'notes', value: string | number) => {
    setPlayerRatings(prev => prev.map(pr => 
      pr.player_id === playerId ? { ...pr, [field]: value } : pr
    ));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Access Denied</h2>
            <p className="text-red-300">You need Admin or Media Manager privileges to access this page.</p>
            <Link 
              href="/admin"
              className="inline-block mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Back to Admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Squad <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">Ratings</span> Management
            </h1>
            <p className="text-gray-400">Manage squad analysis and player ratings</p>
          </div>
          <Link 
            href="/admin"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            ← Back to Admin
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-4 mb-8">
          <button
            onClick={() => { setActiveTab('list'); resetForm(); }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'list' 
                ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/20' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📊 All Ratings ({ratings.length})
          </button>
          <button
            onClick={() => { setActiveTab('create'); resetForm(); }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'create' 
                ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/20' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ➕ Create New Rating
          </button>
        </div>

        {/* Content */}
        {activeTab === 'list' && (
          <div className="space-y-6">
            {ratings.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-2xl font-bold text-gray-300 mb-2">No Ratings Yet</h3>
                <p className="text-gray-500 mb-6">Create your first squad rating analysis</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
                >
                  Create First Rating
                </button>
              </div>
            ) : (
              <div className="grid gap-6">
                {ratings.map((rating) => (
                  <div
                    key={rating.id}
                    className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-lg p-6 hover:border-pink-500/50 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xl font-bold px-3 py-2 rounded">
                          {rating.squad_tag}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">
                            {rating.squad_name}
                          </h3>
                          <p className="text-gray-400">
                            By <span className="text-pink-400">{rating.analyst_alias}</span> • {rating.season_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(rating)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rating.id)}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          Delete
                        </button>
                        <Link
                          href={`/league/ratings/${rating.id}`}
                          target="_blank"
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </div>

                    <div className="text-sm text-gray-500">
                      Analysis Date: {formatDate(rating.analysis_date)} • 
                      Created: {formatDate(rating.created_at)}
                    </div>

                    {rating.analyst_quote && (
                      <div className="mt-4 bg-gray-900/50 rounded-lg p-4">
                        <blockquote className="text-gray-300 italic">
                          "{rating.analyst_quote}"
                        </blockquote>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeTab === 'create' || activeTab === 'edit') && (
          <div className="bg-gray-800/50 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingRating ? 'Edit Squad Rating' : 'Create New Squad Rating'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Squad Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Squad <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedSquadId}
                  onChange={(e) => setSelectedSquadId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                  disabled={!!editingRating}
                >
                  <option value="">Select a squad...</option>
                  {squads.map(squad => (
                    <option key={squad.id} value={squad.id}>
                      [{squad.tag}] {squad.name} ({squad.member_count} members)
                    </option>
                  ))}
                </select>
              </div>

              {/* Season and Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Season Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={seasonName}
                    onChange={(e) => setSeasonName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="e.g., Season 53, Season 54, etc."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Analysis Date
                  </label>
                  <input
                    type="date"
                    value={analysisDate}
                    onChange={(e) => setAnalysisDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Analyst Quote */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Analyst Quote
                </label>
                <textarea
                  value={analystQuote}
                  onChange={(e) => setAnalystQuote(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  rows={2}
                  placeholder="A short quote that summarizes your analysis..."
                />
              </div>

              {/* Analyst Commentary */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Analyst Commentary
                </label>
                <textarea
                  value={analystCommentary}
                  onChange={(e) => setAnalystCommentary(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  rows={6}
                  placeholder="Detailed analysis and commentary..."
                />
              </div>

              {/* Breakdown Summary */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Breakdown Summary
                </label>
                <textarea
                  value={breakdownSummary}
                  onChange={(e) => setBreakdownSummary(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  rows={4}
                  placeholder="Summary of squad strengths, weaknesses, and overall assessment..."
                />
              </div>

              {/* Player Ratings */}
              {playerRatings.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Player Ratings</h3>
                  <div className="space-y-4">
                    {playerRatings.map((player) => (
                      <div key={player.player_id} className="bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-white font-medium">{player.player_alias}</h4>
                          <div className="flex items-center space-x-2">
                            <label className="text-sm text-gray-400">Rating:</label>
                            <select
                              value={player.rating}
                              onChange={(e) => updatePlayerRating(player.player_id, 'rating', parseFloat(e.target.value))}
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                            >
                              <option value={1.0}>⭐ (1.0)</option>
                              <option value={1.5}>⭐☆ (1.5)</option>
                              <option value={2.0}>⭐⭐ (2.0)</option>
                              <option value={2.5}>⭐⭐☆ (2.5)</option>
                              <option value={3.0}>⭐⭐⭐ (3.0)</option>
                              <option value={3.5}>⭐⭐⭐☆ (3.5)</option>
                              <option value={4.0}>⭐⭐⭐⭐ (4.0)</option>
                              <option value={4.5}>⭐⭐⭐⭐☆ (4.5)</option>
                              <option value={5.0}>⭐⭐⭐⭐⭐ (5.0)</option>
                              <option value={5.5}>⭐⭐⭐⭐⭐☆ (5.5)</option>
                              <option value={6.0}>⭐⭐⭐⭐⭐⭐ (6.0)</option>
                            </select>
                          </div>
                        </div>
                        <textarea
                          value={player.notes}
                          onChange={(e) => updatePlayerRating(player.player_id, 'notes', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                          rows={2}
                          placeholder={`Notes for ${player.player_alias}...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => { setActiveTab('list'); resetForm(); }}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSquadId || !seasonName.trim()}
                  className="px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                >
                  {submitting && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  <span>
                    {submitting 
                      ? (editingRating ? 'Updating...' : 'Creating...') 
                      : (editingRating ? 'Update Rating' : 'Create Rating')
                    }
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminRatingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-500"></div>
      </div>
    }>
      <AdminRatingsContent />
    </Suspense>
  );
}