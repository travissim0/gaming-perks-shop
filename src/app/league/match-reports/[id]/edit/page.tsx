'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { Squad, MatchReportWithDetails } from '@/types/database';

export default function EditMatchReportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [report, setReport] = useState<MatchReportWithDetails | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    squad_a_id: '',
    squad_b_id: '',
    squad_a_name: '',
    squad_b_name: '',
    match_summary: '',
    match_highlights_video_url: '',
    match_date: '',
    season_name: ''
  });

  useEffect(() => {
    if (params.id) {
      fetchReport();
      checkPermissions();
      fetchSquads();
    }
  }, [params.id, user]);

  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/match-reports/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data.report);
        
        // Populate form with existing data
        const reportData = data.report;
        setFormData({
          title: reportData.title || '',
          squad_a_id: reportData.squad_a_id || '',
          squad_b_id: reportData.squad_b_id || '',
          squad_a_name: reportData.squad_a_name || '',
          squad_b_name: reportData.squad_b_name || '',
          match_summary: reportData.match_summary || '',
          match_highlights_video_url: reportData.match_highlights_video_url || '',
          match_date: reportData.match_date || '',
          season_name: reportData.season_name || ''
        });
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
                          profile?.ctf_role === 'ctf_analyst';
        setHasPermission(permission);
        
        if (!permission) {
          toast.error('You do not have permission to edit match reports');
          router.push('/league/match-reports');
        }
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setHasPermission(false);
    }
  };

  const fetchSquads = async () => {
    try {
      const response = await fetch('/api/squads');
      if (response.ok) {
        const data = await response.json();
        setSquads(data.squads || []);
      }
    } catch (error) {
      console.error('Error fetching squads:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Auto-populate squad names when squad IDs are selected
    if (name === 'squad_a_id' || name === 'squad_b_id') {
      const selectedSquad = squads.find(squad => squad.id === value);
      if (selectedSquad) {
        const nameField = name === 'squad_a_id' ? 'squad_a_name' : 'squad_b_name';
        setFormData(prev => ({ ...prev, [nameField]: selectedSquad.name }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.squad_a_name || !formData.squad_b_name || !formData.match_summary || !formData.season_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/match-reports/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Match report updated successfully!');
        router.push(`/league/match-reports/${params.id}`);
      } else {
        toast.error(data.error || 'Failed to update match report');
      }
    } catch (error) {
      console.error('Error updating match report:', error);
      toast.error('Failed to update match report');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this match report? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/match-reports/${params.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Match report deleted successfully');
        router.push('/league/match-reports');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete match report');
      }
    } catch (error) {
      console.error('Error deleting match report:', error);
      toast.error('Failed to delete match report');
    }
  };

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
            <p className="text-gray-400 mb-6">You do not have permission to edit this match report</p>
            <Link href="/league/match-reports">
              <button className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300">
                Back to Match Reports
              </button>
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
            Edit Match Report
          </h1>
          <p className="text-xl text-gray-300">
            Update the match analysis and information
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-8">
            {/* Basic Information */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Basic Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Match Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., CTFPL Week 3: Darkslayers vs Smurfs"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Match Date *
                  </label>
                  <input
                    type="date"
                    name="match_date"
                    value={formData.match_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Season *
                  </label>
                  <input
                    type="text"
                    name="season_name"
                    value={formData.season_name}
                    onChange={handleInputChange}
                    placeholder="e.g., Season 5"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Squad Selection */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Teams</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Squad A */}
                <div>
                  <label className="block text-sm font-medium text-cyan-400 mb-2">
                    Squad A *
                  </label>
                  <select
                    name="squad_a_id"
                    value={formData.squad_a_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent mb-2"
                  >
                    <option value="">Select Squad A</option>
                    {squads.map(squad => (
                      <option key={squad.id} value={squad.id}>
                        {squad.name} ({squad.tag})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="squad_a_name"
                    value={formData.squad_a_name}
                    onChange={handleInputChange}
                    placeholder="Or enter squad name manually"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Squad B */}
                <div>
                  <label className="block text-sm font-medium text-purple-400 mb-2">
                    Squad B *
                  </label>
                  <select
                    name="squad_b_id"
                    value={formData.squad_b_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-2"
                  >
                    <option value="">Select Squad B</option>
                    {squads.map(squad => (
                      <option key={squad.id} value={squad.id}>
                        {squad.name} ({squad.tag})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="squad_b_name"
                    value={formData.squad_b_name}
                    onChange={handleInputChange}
                    placeholder="Or enter squad name manually"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Match Content */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-white mb-6">Match Analysis</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Match Summary *
                  </label>
                  <textarea
                    name="match_summary"
                    value={formData.match_summary}
                    onChange={handleInputChange}
                    rows={6}
                    placeholder="Provide a detailed summary of the match, including key moments, strategies, and overall performance..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-vertical"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Match Highlights Video URL
                  </label>
                  <input
                    type="url"
                    name="match_highlights_video_url"
                    value={formData.match_highlights_video_url}
                    onChange={handleInputChange}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-400 mt-1">
                    Optional YouTube video URL for match highlights
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleDelete}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-300"
              >
                🗑️ Delete Report
              </button>
              
              <div className="flex items-center space-x-4">
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
                  className={`px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
