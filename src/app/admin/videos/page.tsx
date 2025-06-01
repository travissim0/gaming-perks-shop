'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

interface FeaturedVideo {
  id: string;
  title: string;
  description: string;
  youtube_url?: string;
  vod_url?: string;
  thumbnail_url?: string;
  video_type: string;
  match_id?: string;
  featured_order: number;
  is_active: boolean;
  view_count: number;
  published_at: string;
  created_at: string;
}

interface VideoFormData {
  title: string;
  description: string;
  youtube_url: string;
  vod_url: string;
  thumbnail_url: string;
  video_type: string;
  featured_order: number;
  is_active: boolean;
}

export default function AdminVideos() {
  const { user, loading } = useAuth();
  const [videos, setVideos] = useState<FeaturedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVideo, setEditingVideo] = useState<FeaturedVideo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    youtube_url: '',
    vod_url: '',
    thumbnail_url: '',
    video_type: 'match',
    featured_order: 0,
    is_active: true
  });

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchVideos();
    }
  }, [isAdmin]);

  // Helper function to extract YouTube video ID
  const getYouTubeVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Helper function to generate YouTube thumbnail
  const getYouTubeThumbnail = (url: string, quality = 'hqdefault') => {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : null;
  };

  // Auto-generate thumbnail when YouTube URL changes
  const handleYouTubeUrlChange = (url: string) => {
    setFormData(prev => ({
      ...prev,
      youtube_url: url,
      // Auto-generate thumbnail if not manually set
      thumbnail_url: prev.thumbnail_url || getYouTubeThumbnail(url) || ''
    }));
  };

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, is_media_manager')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const hasAccess = data?.is_admin || data?.is_media_manager || false;
      setIsAdmin(hasAccess);
      if (!hasAccess) {
        toast.error('Access denied: Admin or Media Manager privileges required');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      toast.error('Error checking permissions');
    }
  };

  const fetchVideos = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('featured_videos')
        .select('*')
        .order('featured_order', { ascending: true });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Error loading videos');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      youtube_url: '',
      vod_url: '',
      thumbnail_url: '',
      video_type: 'match',
      featured_order: videos.length,
      is_active: true
    });
    setEditingVideo(null);
    setShowForm(false);
  };

  const handleEdit = (video: FeaturedVideo) => {
    setFormData({
      title: video.title,
      description: video.description || '',
      youtube_url: video.youtube_url || '',
      vod_url: video.vod_url || '',
      thumbnail_url: video.thumbnail_url || '',
      video_type: video.video_type,
      featured_order: video.featured_order,
      is_active: video.is_active
    });
    setEditingVideo(video);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.youtube_url.trim() && !formData.vod_url.trim()) {
      toast.error('At least one video URL is required');
      return;
    }

    try {
      const videoData = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        youtube_url: formData.youtube_url.trim() || null,
        vod_url: formData.vod_url.trim() || null,
        thumbnail_url: formData.thumbnail_url.trim() || null,
        video_type: formData.video_type,
        featured_order: formData.featured_order,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      };

      if (editingVideo) {
        // Update existing video
        const { error } = await supabase
          .from('featured_videos')
          .update(videoData)
          .eq('id', editingVideo.id);

        if (error) throw error;
        toast.success('Video updated successfully');
      } else {
        // Create new video
        const { error } = await supabase
          .from('featured_videos')
          .insert([{
            ...videoData,
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          }]);

        if (error) throw error;
        toast.success('Video added successfully');
      }

      resetForm();
      fetchVideos();
    } catch (error) {
      console.error('Error saving video:', error);
      toast.error('Error saving video');
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;

    try {
      const { error } = await supabase
        .from('featured_videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;
      toast.success('Video deleted successfully');
      fetchVideos();
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Error deleting video');
    }
  };

  const toggleActive = async (video: FeaturedVideo) => {
    try {
      const { error } = await supabase
        .from('featured_videos')
        .update({ 
          is_active: !video.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', video.id);

      if (error) throw error;
      toast.success(`Video ${!video.is_active ? 'activated' : 'deactivated'}`);
      fetchVideos();
    } catch (error) {
      console.error('Error toggling video status:', error);
      toast.error('Error updating video status');
    }
  };

  const moveVideo = async (videoId: string, direction: 'up' | 'down') => {
    const currentIndex = videos.findIndex(v => v.id === videoId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= videos.length) return;

    try {
      // Swap the featured_order values
      const video1 = videos[currentIndex];
      const video2 = videos[newIndex];

      const { error } = await supabase.rpc('swap_video_order', {
        video1_id: video1.id,
        video2_id: video2.id,
        video1_order: video2.featured_order,
        video2_order: video1.featured_order
      });

      if (error) {
        // Fallback to individual updates if RPC doesn't exist
        await Promise.all([
          supabase.from('featured_videos').update({ featured_order: video2.featured_order }).eq('id', video1.id),
          supabase.from('featured_videos').update({ featured_order: video1.featured_order }).eq('id', video2.id)
        ]);
      }

      toast.success('Video order updated');
      fetchVideos();
    } catch (error) {
      console.error('Error moving video:', error);
      toast.error('Error updating video order');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-gray-400 mb-4">Admin or Media Manager privileges required</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300">
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Featured Videos Management</h1>
            <p className="text-gray-400 mt-2">Manage videos displayed on the homepage</p>
          </div>
          <div className="flex gap-4">
            <Link 
              href="/admin" 
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              ← Back to Admin
            </Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Video'}
            </button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-cyan-400 mb-4">
              {editingVideo ? 'Edit Video' : 'Add New Video'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="Video title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Video Type
                  </label>
                  <select
                    value={formData.video_type}
                    onChange={(e) => setFormData({ ...formData, video_type: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="match">Match</option>
                    <option value="highlight">Highlight</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  rows={3}
                  placeholder="Video description"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube URL
                  </label>
                  <input
                    type="url"
                    value={formData.youtube_url}
                    onChange={(e) => handleYouTubeUrlChange(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    VOD URL
                  </label>
                  <input
                    type="url"
                    value={formData.vod_url}
                    onChange={(e) => setFormData({ ...formData, vod_url: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="https://vod-platform.com/..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Thumbnail URL
                  </label>
                  <input
                    type="url"
                    value={formData.thumbnail_url}
                    onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="https://example.com/thumbnail.jpg"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    💡 Leave empty to auto-generate from YouTube URL
                  </p>
                  {formData.thumbnail_url && (
                    <div className="mt-2">
                      <img 
                        src={formData.thumbnail_url} 
                        alt="Thumbnail preview" 
                        className="w-32 h-18 object-cover rounded border border-gray-600"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.featured_order}
                    onChange={(e) => setFormData({ ...formData, featured_order: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    min="0"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                    />
                    <span className="ml-2 text-sm text-gray-300">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  {editingVideo ? 'Update Video' : 'Add Video'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Videos List */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Current Videos ({videos.length})</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
            </div>
          ) : videos.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400">No videos found. Add your first video!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {videos.map((video, index) => (
                <div key={video.id} className="p-6 hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div className="w-32 h-18 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                      {video.thumbnail_url ? (
                        <img 
                          src={video.thumbnail_url} 
                          alt={video.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjcyIiB2aWV3Qm94PSIwIDAgMTI4IDcyIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjcyIiBmaWxsPSIjMzc0MTUxIi8+Cjx0ZXh0IHg9IjY0IiB5PSIzNiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOUNBM0FGIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5WaWRlbzwvdGV4dD4KPHN2Zz4K';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          🎬
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-1">{video.title}</h3>
                          <p className="text-gray-400 text-sm mb-2 line-clamp-2">{video.description}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="bg-gray-700 px-2 py-1 rounded">{video.video_type}</span>
                            <span>Order: {video.featured_order}</span>
                            <span>Views: {video.view_count}</span>
                            <span className={video.is_active ? 'text-green-400' : 'text-red-400'}>
                              {video.is_active ? '● Active' : '● Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Move up/down */}
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => moveVideo(video.id, 'up')}
                              disabled={index === 0}
                              className="p-1 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveVideo(video.id, 'down')}
                              disabled={index === videos.length - 1}
                              className="p-1 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ▼
                            </button>
                          </div>

                          {/* Toggle active */}
                          <button
                            onClick={() => toggleActive(video)}
                            className={`px-3 py-1 rounded text-xs ${
                              video.is_active 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'bg-gray-600 hover:bg-gray-700 text-white'
                            }`}
                          >
                            {video.is_active ? 'Deactivate' : 'Activate'}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => handleEdit(video)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                          >
                            Edit
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(video.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* URLs */}
                      <div className="mt-3 flex gap-2">
                        {video.youtube_url && (
                          <a
                            href={video.youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            YouTube
                          </a>
                        )}
                        {video.vod_url && (
                          <a
                            href={video.vod_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 text-xs"
                          >
                            VOD
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 