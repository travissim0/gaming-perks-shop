'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, ExternalLink, Play, Calendar, User } from 'lucide-react';
import NewPostModal from './NewPostModal';

interface NewsPost {
  id: string;
  title: string;
  subtitle: string;
  content: any;
  featured_image_url: string;
  author_id: string;
  author_name: string;
  author_alias?: string;
  status: string;
  featured: boolean;
  view_count: number;
  created_at: string;
  published_at: string;
  tags: string[];
  metadata: any;
}

export default function HomeNewsSection() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('is_admin, site_admin')
        .eq('id', user.id)
        .single();

      setIsAdmin(data?.is_admin || data?.site_admin || false);
    };

    checkAdmin();
  }, [user]);

  // Fetch news posts with author profiles
  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase
          .from('news_posts')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        // Fetch author aliases for all posts
        if (data && data.length > 0) {
          const authorIds = [...new Set(data.map((p: any) => p.author_id).filter(Boolean))];

          if (authorIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, in_game_alias')
              .in('id', authorIds);

            const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.in_game_alias]));

            // Add author_alias to each post
            const postsWithAlias = data.map((post: any) => ({
              ...post,
              author_alias: profileMap.get(post.author_id) || post.author_name
            }));

            setPosts(postsWithAlias);
          } else {
            setPosts(data || []);
          }
        } else {
          setPosts([]);
        }
      } catch (error) {
        console.error('Failed to fetch news:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Extract YouTube video ID from URL
  const getYouTubeId = (url: string) => {
    const match = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    return match ? match[1] : null;
  };

  // Render content based on type
  const renderContent = (content: any) => {
    if (!content) return null;

    // If content is a string (plain text or HTML)
    if (typeof content === 'string') {
      return (
        <div
          className="text-gray-300 text-sm leading-relaxed prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }

    // If content is TipTap JSON format
    if (content.type === 'doc' && content.content) {
      return (
        <div className="text-gray-300 text-sm leading-relaxed space-y-2">
          {content.content.map((block: any, index: number) => {
            if (block.type === 'paragraph') {
              const text = block.content?.map((c: any) => c.text).join('') || '';
              return <p key={index}>{text}</p>;
            }
            if (block.type === 'heading') {
              const text = block.content?.map((c: any) => c.text).join('') || '';
              return <h3 key={index} className="text-lg font-bold text-white">{text}</h3>;
            }
            return null;
          })}
        </div>
      );
    }

    return null;
  };

  const handlePostCreated = async () => {
    // Refresh posts after creating a new one
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('news_posts')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        const authorIds = [...new Set(data.map((p: any) => p.author_id).filter(Boolean))];

        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, in_game_alias')
            .in('id', authorIds);

          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.in_game_alias]));

          const postsWithAlias = data.map((post: any) => ({
            ...post,
            author_alias: profileMap.get(post.author_id) || post.author_name
          }));

          setPosts(postsWithAlias);
        } else {
          setPosts(data || []);
        }
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Failed to refresh posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700/50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">📰</span>
          News & Updates
        </h2>

        {/* Admin: New Post Button */}
        {isAdmin && (
          <button
            onClick={() => setShowNewPostModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 text-green-400 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        )}
      </div>

      {/* Posts List */}
      <div className="divide-y divide-gray-700/30">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-2/3 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No news posts yet</p>
            {isAdmin && (
              <button
                onClick={() => setShowNewPostModal(true)}
                className="mt-4 text-green-400 hover:text-green-300 text-sm"
              >
                Create the first post →
              </button>
            )}
          </div>
        ) : (
          posts.map((post) => {
            const videoUrl = post.metadata?.video_url;
            const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;

            return (
              <article key={post.id} className="p-6 hover:bg-gray-800/30 transition-colors">
                <div className="flex gap-4">
                  {/* Thumbnail or Video */}
                  {(post.featured_image_url || youtubeId) && (
                    <div className="flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden bg-gray-900">
                      {youtubeId ? (
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block w-full h-full group"
                        >
                          <img
                            src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                            alt={post.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                            <Play className="w-8 h-8 text-white fill-white" />
                          </div>
                        </a>
                      ) : post.featured_image_url ? (
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h3 className="text-lg font-semibold text-white mb-1 hover:text-cyan-400 transition-colors">
                      <Link href={`/news/${post.id}`}>
                        {post.title}
                      </Link>
                    </h3>

                    {/* Subtitle */}
                    {post.subtitle && (
                      <p className="text-gray-400 text-sm mb-2 line-clamp-2">
                        {post.subtitle}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.published_at || post.created_at)}
                      </span>
                      {(post.author_alias || post.author_name) && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {post.author_alias || post.author_name}
                        </span>
                      )}
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex gap-1">
                          {post.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 bg-gray-700/50 rounded text-gray-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* External Link */}
                    {post.metadata?.external_url && (
                      <a
                        href={post.metadata.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-cyan-400 hover:text-cyan-300 text-sm"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Read more
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* View All Link */}
      {posts.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-700/30 bg-gray-800/20">
          <Link
            href="/news"
            className="text-sm text-gray-400 hover:text-cyan-400 transition-colors"
          >
            View all news →
          </Link>
        </div>
      )}

      {/* New Post Modal */}
      {showNewPostModal && (
        <NewPostModal
          onClose={() => setShowNewPostModal(false)}
          onPostCreated={handlePostCreated}
        />
      )}
    </div>
  );
}
