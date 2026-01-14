'use client';

import React, { useState } from 'react';
import { X, Image, Video, Link as LinkIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

interface NewPostModalProps {
  onClose: () => void;
  onPostCreated: () => void;
}

export default function NewPostModal({ onClose, onPostCreated }: NewPostModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [featuredImageUrl, setFeaturedImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!user) {
      setError('You must be logged in to create a post');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get author name from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('in_game_alias')
        .eq('id', user.id)
        .single();

      const authorName = profile?.in_game_alias || 'Admin';

      // Parse tags
      const tagArray = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      // Create the post
      const { error: insertError } = await supabase
        .from('news_posts')
        .insert({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          content: content.trim() || null,
          featured_image_url: featuredImageUrl.trim() || null,
          author_id: user.id,
          author_name: authorName,
          status: 'published',
          featured: false,
          view_count: 0,
          tags: tagArray.length > 0 ? tagArray : null,
          metadata: {
            video_url: videoUrl.trim() || null,
            external_url: externalUrl.trim() || null,
          },
          published_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      onPostCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create post:', err);
      setError(err.message || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700 z-10">
          <h2 className="text-xl font-bold text-white">Create News Post</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title..."
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              required
            />
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Subtitle
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Brief description or summary..."
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post content here... (supports HTML)"
              rows={6}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors resize-y"
            />
            <p className="mt-1 text-xs text-gray-500">
              You can use basic HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;a href=""&gt;, &lt;br&gt;
            </p>
          </div>

          {/* Media Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Featured Image URL */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <Image className="w-4 h-4" />
                Featured Image URL
              </label>
              <input
                type="url"
                value={featuredImageUrl}
                onChange={(e) => setFeaturedImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
            </div>

            {/* Video URL */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <Video className="w-4 h-4" />
                YouTube Video URL
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
            </div>
          </div>

          {/* External Link */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <LinkIcon className="w-4 h-4" />
              External Link (optional "Read more" link)
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://example.com/full-article"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="announcement, update, event"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Preview */}
          {(featuredImageUrl || videoUrl) && (
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
              <p className="text-xs text-gray-500 mb-2">Preview</p>
              {videoUrl && (
                <div className="text-sm text-cyan-400 flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  YouTube video will be embedded
                </div>
              )}
              {featuredImageUrl && (
                <div className="mt-2">
                  <img
                    src={featuredImageUrl}
                    alt="Preview"
                    className="max-h-32 rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Publish Post'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
