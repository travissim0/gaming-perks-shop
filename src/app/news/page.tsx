'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

interface NewsPost {
  id: string;
  title: string;
  subtitle: string;
  content: any;
  featured_image_url: string;
  author_name: string;
  author_alias: string;
  status: string;
  featured: boolean;
  priority: number;
  view_count: number;
  created_at: string;
  published_at: string;
  tags: string[];
  metadata: any;
  reaction_counts: any;
  is_read: boolean;
  read_at: string;
}

export default function NewsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const postsPerPage = 10;

  useEffect(() => {
    fetchPosts();
  }, [currentPage, selectedTag]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const limit = postsPerPage;
      const offset = (currentPage - 1) * postsPerPage;
      
      let url = `/api/news?limit=${limit}&offset=${offset}`;
      if (selectedTag) {
        url += `&tag=${encodeURIComponent(selectedTag)}`;
      }

      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (user?.id) {
        try {
          // Get session from Supabase directly
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            console.warn('Session retrieval error (non-critical):', error);
          }
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
        } catch (error) {
          console.warn('Error getting session for news fetch (continuing without auth):', error);
          // Continue without auth header - this is non-critical for news reading
        }
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error('Failed to fetch news posts');
      }

      const data = await response.json();
      setPosts(data.posts || []);
      setTotalPages(Math.ceil((data.total || 0) / postsPerPage));
      
      // Extract unique tags
      const tags = new Set<string>();
      data.posts?.forEach((post: NewsPost) => {
        post.tags?.forEach((tag: string) => tags.add(tag));
      });
      setAllTags(Array.from(tags).sort());
      
    } catch (error) {
      console.error('Error fetching news posts:', error);
      toast.error('Failed to load news posts');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const getContentPreview = (content: any) => {
    if (!content) return '';
    
    // Handle different content formats
    if (typeof content === 'string') {
      return content;
    }
    
    if (content.type === 'doc' && content.content) {
      // ProseMirror format
      const extractText = (node: any): string => {
        if (node.type === 'text') {
          return node.text || '';
        }
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join(' ');
        }
        return '';
      };
      
      return content.content.map(extractText).join(' ');
    }
    
    return JSON.stringify(content);
  };

  const handleTagFilter = (tag: string | null) => {
    setSelectedTag(tag);
    setCurrentPage(1);
  };

  const getReactionEmoji = (type: string) => {
    const reactions: { [key: string]: string } = {
      'like': '👍',
      'love': '❤️',
      'laugh': '😂',
      'wow': '😮',
      'sad': '😢',
      'angry': '😠',
      'fire': '🔥',
      'rocket': '🚀',
      'star': '⭐',
      'trophy': '🏆'
    };
    return reactions[type] || '👍';
  };

  if (loading && posts.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            📰 News & Updates
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Stay up to date with the latest news, announcements, and updates from Free Infantry
          </p>
        </div>

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => handleTagFilter(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedTag === null
                    ? 'bg-cyan-500 text-white shadow-lg'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All Posts
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagFilter(tag)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedTag === tag
                      ? 'bg-cyan-500 text-white shadow-lg'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* News Posts */}
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No news posts found</h3>
              <p className="text-gray-500">
                {selectedTag ? `No posts found for tag "${selectedTag}"` : 'Check back later for updates!'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className={`bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 ${
                    post.featured ? 'border-cyan-500/50 bg-gradient-to-br from-gray-800 to-gray-900' : ''
                  } ${
                    !post.is_read ? 'border-l-4 border-l-cyan-400' : ''
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {post.featured && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                              ⭐ Featured
                            </span>
                          )}
                          {!post.is_read && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              New
                            </span>
                          )}
                        </div>
                        
                        <Link href={`/news/${post.id}`}>
                          <h2 className="text-2xl font-bold text-white mb-2 hover:text-cyan-400 transition-colors cursor-pointer">
                            {post.title}
                          </h2>
                        </Link>
                        
                        {post.subtitle && (
                          <p className="text-gray-300 text-lg mb-3">
                            {post.subtitle}
                          </p>
                        )}
                        
                        <p className="text-gray-400 mb-4 leading-relaxed">
                          {truncateText(getContentPreview(post.content), 200)}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-gray-500">
                            <span>By {post.author_name || post.author_alias}</span>
                            <span className="mx-2">•</span>
                            <span>{formatDate(post.published_at)}</span>
                            <span className="mx-2">•</span>
                            <span>{post.view_count} views</span>
                          </div>
                          
                          {post.reaction_counts && Object.keys(post.reaction_counts).length > 0 && (
                            <div className="flex items-center gap-1">
                              {Object.entries(post.reaction_counts).map(([type, count]) => (
                                <span key={type} className="text-xs text-gray-500">
                                  {getReactionEmoji(type)} {String(count)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {post.tags && post.tags.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {post.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {post.featured_image_url && (
                        <div className="ml-6 flex-shrink-0">
                          <img
                            src={post.featured_image_url}
                            alt={post.title}
                            className="w-32 h-24 object-cover rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                      <Link
                        href={`/news/${post.id}`}
                        className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                      >
                        Read More
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-12">
            <nav className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    page === currentPage
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {page}
                </button>
              ))}
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
} 