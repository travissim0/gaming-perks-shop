'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { MatchReportWithDetails, Profile } from '@/types/database';
import { getRatingColor, getStarDisplay } from '@/utils/ratingUtils';

export default function AddPlayerRatingPage() {
  const { user, session } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [report, setReport] = useState<MatchReportWithDetails | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    player_alias: '',
    player_id: '',
    class_position: '',
    performance_description: '',
    highlight_clip_url: '',
    kills: 0,
    deaths: 0,
    turret_damage: '',
    rating_before: 3.0,
    rating_adjustment: 0.0,
    rating_after: 3.0,
    display_order: 0
  });

  useEffect(() => {
    if (params.id) {
      fetchReport();
      checkPermissions();
      fetchPlayers();
    }
  }, [params.id, user]);

  // Simple manual selection without complex calculations

  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/match-reports/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data.report);
        
        // Set next display order
        const nextOrder = (data.playerRatings?.length || 0);
        setFormData(prev => ({ ...prev, display_order: nextOrder }));
      } else {
        toast.error('Failed to load match report');
        router.push('/league/match-reports');
      }
    } catch (error) {
      console.error('Error fetching match report:', error);
      toast.error('Failed to load match report');
      router.push('/league/match-reports');
    } finally {
      setPageLoading(false);
    }
  };

  const checkPermissions = async () => {
    if (!user) {
      setHasPermission(false);
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, ctf_role')
        .eq('id', user.id)
        .single();

      if (!error && profile) {
        const permission = profile?.is_admin || 
                          profile?.ctf_role === 'ctf_admin' || 
                          profile?.ctf_role === 'ctf_analyst' ||
                          profile?.ctf_role === 'ctf_analyst_commentator' ||
                          profile?.ctf_role === 'ctf_analyst_commentator_referee' ||
                          profile?.ctf_role === 'ctf_analyst_referee';
        setHasPermission(permission);
        
        if (!permission) {
          toast.error('You do not have permission to add player ratings');
          router.push(`/league/match-reports/${params.id}`);
        }
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setHasPermission(false);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await fetch('/api/profile/all');
      if (response.ok) {
        const data = await response.json();
        setPlayers(data.profiles || []);
      }
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'number' || name === 'rating_before' || name === 'rating_adjustment' || name === 'rating_after') {
      const numValue = parseFloat(value);
      setFormData(prev => ({ ...prev, [name]: isNaN(numValue) ? 3.0 : numValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Auto-populate player alias when player ID is selected
    if (name === 'player_id') {
      const selectedPlayer = players.find(player => player.id === value);
      if (selectedPlayer) {
        setFormData(prev => ({ ...prev, player_alias: selectedPlayer.in_game_alias || '' }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.player_alias || !formData.class_position || !formData.performance_description) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        ...formData,
        turret_damage: formData.turret_damage ? parseInt(formData.turret_damage) : null,
        player_id: formData.player_id || null
      };

      // Get fresh session to ensure we have access_token
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      console.log('🚀 Submitting player rating:', {
        hasSession: !!session,
        hasCurrentSession: !!currentSession,
        hasAccessToken: !!currentSession?.access_token,
        tokenLength: currentSession?.access_token?.length,
        userId: user?.id,
        submitData
      });

      if (!currentSession?.access_token) {
        toast.error('Please log in again to continue');
        return;
      }

      const response = await fetch(`/api/match-reports/${params.id}/player-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      console.log('📝 Player rating response:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (response.ok) {
        toast.success('Player rating added successfully!');
        router.push(`/league/match-reports/${params.id}`);
      } else {
        console.error('❌ Player rating failed:', data);
        toast.error(data.error || 'Failed to add player rating');
      }
    } catch (error) {
      console.error('Error adding player rating:', error);
      toast.error('Failed to add player rating');
    } finally {
      setLoading(false);
    }
  };

  // Rating utilities imported from @/utils/ratingUtils

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-20 bg-gray-700 rounded mb-8"></div>
            <div className="h-64 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPermission || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h2>
            <p className="text-gray-400 mb-6">You do not have permission to add player ratings</p>
            <Link 
              href={`/league/match-reports/${params.id}`}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 inline-block"
            >
              Back to Report
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
        <div className="mb-8">
          <Link 
            href={`/league/match-reports/${params.id}`}
            className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-2 transition-colors mb-6"
          >
            <span>←</span>
            <span>Back to Report</span>
          </Link>
          
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
            Add Player Rating
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            {report?.title}
          </p>
          <p className="text-gray-400">
            Rate a player's performance in this match
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-8">
            {/* Player Information */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Player Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Player
                  </label>
                  <select
                    name="player_id"
                    value={formData.player_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent mb-2"
                  >
                    <option value="">Select from registered players</option>
                    {players.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.in_game_alias || player.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Player Alias *
                  </label>
                  <input
                    type="text"
                    name="player_alias"
                    value={formData.player_alias}
                    onChange={handleInputChange}
                    placeholder="Enter player alias/name"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Class/Position *
                  </label>
                  <input
                    type="text"
                    name="class_position"
                    value={formData.class_position}
                    onChange={handleInputChange}
                    placeholder="e.g., Defense, Offense, Captain"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Highlight Clip Embed Code
                  </label>
                  <textarea
                    name="highlight_clip_url"
                    value={formData.highlight_clip_url}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder='Paste YouTube embed code here...'
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-vertical"
                  />
                         <div className="mt-2 text-sm text-gray-400 space-y-2">
         <div>💡 <strong>Best method for clips with start/end times:</strong></div>
         <div className="pl-4 space-y-1">
           <div>1. Copy your YouTube video URL (with or without timestamp)</div>
           <div>2. Go to <a href="https://iframely.com/domains/youtube" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">Iframely YouTube Embed Generator</a></div>
           <div>3. Paste URL, set start/end times, copy the embed code</div>
         </div>
         <div className="border-t border-gray-600 pt-2 mt-3">
           <div>⚡ <strong>Alternative methods:</strong></div>
           <div className="pl-4 space-y-1">
             <div>• Right-click on video at start time → "Copy video URL at current time"</div>
             <div>• Right-click anywhere on video → "Copy embed code" for full video</div>
           </div>
         </div>
       </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Match Statistics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Kills
                  </label>
                  <input
                    type="number"
                    name="kills"
                    value={formData.kills}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Deaths
                  </label>
                  <input
                    type="number"
                    name="deaths"
                    value={formData.deaths}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Turret Damage (Optional)
                  </label>
                  <input
                    type="number"
                    name="turret_damage"
                    value={formData.turret_damage}
                    onChange={handleInputChange}
                    min="0"
                    placeholder="Enter damage amount"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Performance Description */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Performance Analysis</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Performance Description *
                </label>
                <textarea
                  name="performance_description"
                  value={formData.performance_description}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="Describe the player's performance in this match, including key plays, strengths, areas for improvement..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-vertical"
                  required
                />
              </div>
            </div>

            {/* Player Rating */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Player Rating</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Previous Rating
                  </label>
                  <select
                    name="rating_before"
                    value={formData.rating_before}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0].map(rating => (
                      <option key={rating} value={rating}>{rating.toFixed(1)}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex justify-center">
                    {getStarDisplay(parseFloat(formData.rating_before))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Rating Change
                  </label>
                  <select
                    name="rating_adjustment"
                    value={formData.rating_adjustment}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value={-2.0}>-2.0 (Major Drop)</option>
                    <option value={-1.5}>-1.5 (Large Drop)</option>
                    <option value={-1.0}>-1.0 (Drop)</option>
                    <option value={-0.5}>-0.5 (Small Drop)</option>
                    <option value={0.0}>+0.0 (No Change)</option>
                    <option value={0.5}>+0.5 (Small Improvement)</option>
                    <option value={1.0}>+1.0 (Improvement)</option>
                    <option value={1.5}>+1.5 (Large Improvement)</option>
                    <option value={2.0}>+2.0 (Major Improvement)</option>
                  </select>
                  <div className="mt-2 text-center">
                    <span className={`text-lg font-bold ${formData.rating_adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formData.rating_adjustment >= 0 ? '+' : ''}{parseFloat(formData.rating_adjustment).toFixed(1)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    New Rating
                  </label>
                  <select
                    name="rating_after"
                    value={formData.rating_after}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0].map(rating => (
                      <option key={rating} value={rating}>{rating.toFixed(1)}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex justify-center">
                    {getStarDisplay(parseFloat(formData.rating_after))}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end space-x-4">
              <Link href={`/league/match-reports/${params.id}`}>
                <button
                  type="button"
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold transition-all duration-300"
                >
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Adding...</span>
                  </span>
                ) : (
                  'Add Player Rating'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
