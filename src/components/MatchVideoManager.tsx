'use client';

import { useState, useEffect } from 'react';
import { useMediaPermissions } from '@/hooks/useMediaPermissions';
import { toast } from 'react-hot-toast';

interface MatchVideoManagerProps {
  matchId: string;
  matchTitle: string;
}

interface VideoInfo {
  youtube_url?: string;
  vod_url?: string;
  highlight_url?: string;
  video_title?: string;
  video_description?: string;
  video_thumbnail_url?: string;
  added_by_alias?: string;
  video_added_at?: string;
  has_video: boolean;
}

export default function MatchVideoManager({ matchId, matchTitle }: MatchVideoManagerProps) {
  const { permissions, getMatchVideoInfo, addMatchVideo } = useMediaPermissions();
  const [videoInfo, setVideoInfo] = useState<VideoInfo>({ has_video: false });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    youtube_url: '',
    vod_url: '',
    highlight_url: '',
    video_title: '',
    video_description: '',
    video_thumbnail_url: '',
  });

  useEffect(() => {
    loadVideoInfo();
  }, [matchId]);

  const loadVideoInfo = async () => {
    try {
      setLoading(true);
      const info = await getMatchVideoInfo(matchId);
      setVideoInfo(info || { has_video: false });
      
      // Pre-populate form if video exists
      if (info && info.has_video) {
        setFormData({
          youtube_url: info.youtube_url || '',
          vod_url: info.vod_url || '',
          highlight_url: info.highlight_url || '',
          video_title: info.video_title || '',
          video_description: info.video_description || '',
          video_thumbnail_url: info.video_thumbnail_url || '',
        });
      }
    } catch (error) {
      console.error('Error loading video info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.youtube_url && !formData.vod_url && !formData.highlight_url) {
      toast.error('Please provide at least one video URL');
      return;
    }

    try {
      setSaving(true);
      await addMatchVideo(matchId, formData);
      toast.success('Video information saved successfully!');
      setShowForm(false);
      loadVideoInfo(); // Refresh video info
    } catch (error: any) {
      console.error('Error saving video:', error);
      toast.error(error.message || 'Failed to save video information');
    } finally {
      setSaving(false);
    }
  };

  const extractYouTubeId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const handleYouTubeUrlChange = (url: string) => {
    setFormData(prev => ({
      ...prev,
      youtube_url: url,
      // Auto-generate thumbnail if none provided
      video_thumbnail_url: prev.video_thumbnail_url || (
        extractYouTubeId(url) ? `https://i.ytimg.com/vi/${extractYouTubeId(url)}/hqdefault.jpg` : ''
      ),
      // Auto-generate title if none provided
      video_title: prev.video_title || `${matchTitle} - Match Recording`
    }));
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
          <div className="h-3 bg-gray-700 rounded w-32"></div>
        </div>
      </div>
    );
  }

  if (!permissions.canManageMatchVideos) {
    return null; // Don't show anything if user can't manage videos
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          🎬 Match Videos
        </h3>
        {videoInfo.has_video && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Edit Video Info
          </button>
        )}
      </div>

      {videoInfo.has_video && !showForm ? (
        <div className="space-y-4">
          {/* Video Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videoInfo.video_thumbnail_url && (
              <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden">
                <img
                  src={videoInfo.video_thumbnail_url}
                  alt={videoInfo.video_title || 'Match Video'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            <div className="space-y-3">
              {videoInfo.video_title && (
                <h4 className="text-white font-medium">{videoInfo.video_title}</h4>
              )}
              
              {videoInfo.video_description && (
                <p className="text-gray-300 text-sm">{videoInfo.video_description}</p>
              )}

              <div className="flex gap-2">
                {videoInfo.youtube_url && (
                  <a
                    href={videoInfo.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    📺 YouTube
                  </a>
                )}
                {videoInfo.vod_url && (
                  <a
                    href={videoInfo.vod_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    🎮 VOD
                  </a>
                )}
                {videoInfo.highlight_url && (
                  <a
                    href={videoInfo.highlight_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    ⭐ Highlights
                  </a>
                )}
              </div>

              {videoInfo.added_by_alias && videoInfo.video_added_at && (
                <p className="text-gray-500 text-xs">
                  Added by {videoInfo.added_by_alias} on {new Date(videoInfo.video_added_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                YouTube URL
              </label>
              <input
                type="url"
                value={formData.youtube_url}
                onChange={(e) => handleYouTubeUrlChange(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://vod-platform.com/..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Highlights URL
              </label>
              <input
                type="url"
                value={formData.highlight_url}
                onChange={(e) => setFormData({ ...formData, highlight_url: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://highlights-platform.com/..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Video Title
              </label>
              <input
                type="text"
                value={formData.video_title}
                onChange={(e) => setFormData({ ...formData, video_title: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Match title..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.video_description}
              onChange={(e) => setFormData({ ...formData, video_description: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Video description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Custom Thumbnail URL (optional)
            </label>
            <input
              type="url"
              value={formData.video_thumbnail_url}
              onChange={(e) => setFormData({ ...formData, video_thumbnail_url: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://example.com/thumbnail.jpg (auto-generated for YouTube)"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Saving...
                </>
              ) : (
                <>💾 Save Video</>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-4">
            <div className="text-4xl mb-2">🎬</div>
            <p>No video linked to this match yet</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            📹 Add Match Video
          </button>
        </div>
      )}
    </div>
  );
} 