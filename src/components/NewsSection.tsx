'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

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
  is_read: boolean;
  read_at: string;
  reaction_counts: any;
}

interface NewsSectionProps {
  limit?: number;
  className?: string;
  showReadState?: boolean;
  heroLayout?: boolean;
  allowCollapse?: boolean;
  collapsedPosition?: 'inline' | 'below-server';
}

const NewsSection = ({ 
  limit = 5, 
  className = '', 
  showReadState = true,
  heroLayout = false,
  allowCollapse = false,
  collapsedPosition = 'inline'
}: NewsSectionProps) => {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [reactionDetails, setReactionDetails] = useState<Record<string, Record<string, string[]>>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();

  const fetchPosts = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/news?limit=${limit}`, {
        headers: session?.access_token ? {
          'authorization': `Bearer ${session.access_token}`
        } : {}
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      
      const data = await response.json();
      const posts = data.posts || [];
      setPosts(posts);
      
      // Set initial expanded state: expanded for unread posts, collapsed for read posts
      if (showReadState) {
        const newExpandedPosts = new Set<string>();
        posts.forEach((post: NewsPost) => {
          if (!post.is_read) {
            newExpandedPosts.add(post.id);
          }
        });
        setExpandedPosts(newExpandedPosts);
        
        // Auto-collapse if all posts are read and allowCollapse is enabled
        if (allowCollapse && posts.length > 0) {
          const allRead = posts.every((post: NewsPost) => post.is_read);
          setIsCollapsed(allRead);
        }
      } else {
        // If not showing read state, expand all posts by default
        const allPostIds = new Set<string>(posts.map((post: NewsPost) => post.id));
        setExpandedPosts(allPostIds);
      }
      
    } catch (error) {
      console.error('Error fetching posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleReaction = async (postId: string, reactionType: string) => {
    if (!user) {
      toast.error('Please login to react to posts');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Session expired. Please login again.');
        return;
      }

      // Optimistically update the UI first
      const currentPost = posts.find(p => p.id === postId);
      if (currentPost) {
        const currentCount = currentPost.reaction_counts?.[reactionType] || 0;
        const isRemoving = currentCount > 0; // Assume removing if count > 0
        
        setPosts(prevPosts => 
          prevPosts.map(post => {
            if (post.id === postId) {
              const newReactionCounts = { ...post.reaction_counts };
              if (isRemoving) {
                newReactionCounts[reactionType] = Math.max(0, currentCount - 1);
              } else {
                newReactionCounts[reactionType] = currentCount + 1;
              }
              return { ...post, reaction_counts: newReactionCounts };
            }
            return post;
          })
        );

        // Update reaction details optimistically
        if (isRemoving) {
          // Remove current user from reaction details
          setReactionDetails(prev => {
            const newDetails = { ...prev };
            if (newDetails[postId] && newDetails[postId][reactionType]) {
              const userAlias = user.user_metadata?.in_game_alias || 'You';
              newDetails[postId][reactionType] = newDetails[postId][reactionType].filter(
                alias => alias !== userAlias
              );
            }
            return newDetails;
          });
        } else {
          // Add current user to reaction details
          setReactionDetails(prev => {
            const newDetails = { ...prev };
            if (!newDetails[postId]) newDetails[postId] = {};
            if (!newDetails[postId][reactionType]) newDetails[postId][reactionType] = [];
            
            const userAlias = user.user_metadata?.in_game_alias || 'You';
            if (!newDetails[postId][reactionType].includes(userAlias)) {
              newDetails[postId][reactionType] = [...newDetails[postId][reactionType], userAlias];
            }
            return newDetails;
          });
        }
      }

      // Then make the API call
      const response = await fetch('/api/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'react',
          postId,
          reactionType,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        // Revert optimistic update on error
        fetchPosts();
        toast.error(result.error || 'Failed to react to post');
        return;
      }
      
      const action = result.action || 'added';
      const emoji = getReactionEmoji(reactionType);
      
      // Show a subtle success indication without toast spam
      if (action === 'added') {
        console.log(`Added ${emoji} reaction`);
      } else {
        console.log(`Removed ${emoji} reaction`);
      }
      
      // Fetch updated reaction details in the background
      fetchReactionDetails(postId);
      
    } catch (error) {
      console.error('Error toggling reaction:', error);
      // Revert optimistic update on error
      fetchPosts();
      toast.error('Failed to react to post');
    }
  };

  const fetchReactionDetails = async (postId: string) => {
    if (!user) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'get_reaction_details',
          postId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.reactionDetails) {
          setReactionDetails(prev => ({
            ...prev,
            [postId]: result.reactionDetails
          }));
        }
      }
    } catch (error) {
      // Silently fail for reaction details - it's not critical
      console.debug('Could not fetch reaction details:', error);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [limit]);

  const getReactionEmoji = (type: string) => {
    const emojis: Record<string, string> = {
      like: '👍',
      heart: '❤️',
      fire: '🔥',
      shock: '😲'
    };
    return emojis[type] || '👍';
  };

  const toggleExpanded = (postId: string) => {
    setExpandedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const renderContent = (content: any) => {
    if (!content) return null;
    
    if (typeof content === 'string') {
      return <div dangerouslySetInnerHTML={{ __html: content }} />;
    }
    
    // Handle ProseMirror document format
    if (content.type === 'doc' && content.content) {
      return content.content.map((node: any, index: number) => {
        return renderProseMirrorNode(node, index);
      });
    }
    
    // Legacy EditorJS format
    if (content.blocks) {
      return content.blocks.map((block: any, index: number) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={index} className="mb-4 text-gray-300 leading-relaxed">
                {block.data.text}
              </p>
            );
          case 'header':
            const level = block.data.level || 2;
            if (level === 1) {
              return <h1 key={index} className="text-3xl font-bold text-white mb-4">{block.data.text}</h1>;
            } else if (level === 2) {
              return <h2 key={index} className="text-2xl font-bold text-white mb-3">{block.data.text}</h2>;
            } else if (level === 3) {
              return <h3 key={index} className="text-xl font-bold text-white mb-3">{block.data.text}</h3>;
            } else {
              return <h4 key={index} className="text-lg font-bold text-white mb-3">{block.data.text}</h4>;
            }
          case 'list':
            const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
            return (
              <ListTag key={index} className="mb-4 text-gray-300 ml-6">
                {block.data.items.map((item: string, itemIndex: number) => (
                  <li key={itemIndex} className="mb-1">{item}</li>
                ))}
              </ListTag>
            );
          default:
            return null;
        }
      });
    }
    
    // Fallback - if it's an object, try to stringify it for debugging
    if (typeof content === 'object') {
      console.warn('Unknown content format in NewsSection:', content);
      return (
        <div className="bg-yellow-900/20 border border-yellow-600 rounded p-2 mb-2">
          <p className="text-yellow-400 text-sm font-semibold mb-1">Debug: Unknown content format</p>
          <pre className="text-xs text-gray-300 overflow-auto max-h-32">
            {JSON.stringify(content, null, 2)}
          </pre>
        </div>
      );
    }
    
    return <div dangerouslySetInnerHTML={{ __html: String(content) }} />;
  };

  const renderProseMirrorNode = (node: any, key: number): React.ReactNode => {
    switch (node.type) {
      case 'paragraph':
        return (
          <p key={key} className="mb-4 text-gray-300 leading-relaxed">
            {node.content?.map((child: any, childIndex: number) => 
              renderProseMirrorInline(child, childIndex)
            )}
          </p>
        );
      
      case 'heading':
        const level = node.attrs?.level || 2;
        const headingClasses = {
          1: "text-3xl font-bold text-white mb-4",
          2: "text-2xl font-bold text-white mb-3", 
          3: "text-xl font-bold text-white mb-3",
          4: "text-lg font-bold text-white mb-3",
          5: "text-base font-bold text-white mb-2",
          6: "text-sm font-bold text-white mb-2"
        };
        const className = headingClasses[level as keyof typeof headingClasses] || headingClasses[2];
        const content = node.content?.map((child: any, childIndex: number) => 
          renderProseMirrorInline(child, childIndex)
        );
        
        switch (level) {
          case 1:
            return <h1 key={key} className={className}>{content}</h1>;
          case 2:
            return <h2 key={key} className={className}>{content}</h2>;
          case 3:
            return <h3 key={key} className={className}>{content}</h3>;
          case 4:
            return <h4 key={key} className={className}>{content}</h4>;
          case 5:
            return <h5 key={key} className={className}>{content}</h5>;
          case 6:
            return <h6 key={key} className={className}>{content}</h6>;
          default:
            return <h2 key={key} className={className}>{content}</h2>;
        }
      
      case 'bulletList':
        return (
          <ul key={key} className="mb-4 text-gray-300 ml-6 list-disc">
            {node.content?.map((listItem: any, itemIndex: number) => (
              <li key={itemIndex} className="mb-1">
                {listItem.content?.map((child: any, childIndex: number) => 
                  renderProseMirrorNode(child, childIndex)
                )}
              </li>
            ))}
          </ul>
        );
      
      case 'orderedList':
        return (
          <ol key={key} className="mb-4 text-gray-300 ml-6 list-decimal">
            {node.content?.map((listItem: any, itemIndex: number) => (
              <li key={itemIndex} className="mb-1">
                {listItem.content?.map((child: any, childIndex: number) => 
                  renderProseMirrorNode(child, childIndex)
                )}
              </li>
            ))}
          </ol>
        );
      
      case 'listItem':
        return node.content?.map((child: any, childIndex: number) => 
          renderProseMirrorNode(child, childIndex)
        );
      
      default:
        return null;
    }
  };

  const renderProseMirrorInline = (node: any, key: number): React.ReactNode => {
    if (node.type === 'text') {
      let text = node.text;
      
      // Apply marks (formatting)
      if (node.marks && node.marks.length > 0) {
        return node.marks.reduce((acc: React.ReactNode, mark: any) => {
          switch (mark.type) {
            case 'bold':
              return <strong key={key}>{acc}</strong>;
            case 'italic':
              return <em key={key}>{acc}</em>;
            case 'strike':
              return <del key={key}>{acc}</del>;
            case 'underline':
              return <u key={key}>{acc}</u>;
            case 'code':
              return <code key={key} className="bg-gray-700 px-1 rounded text-sm">{acc}</code>;
            default:
              return acc;
          }
        }, text);
      }
      
      return text;
    }
    
    if (node.type === 'hardBreak') {
      return <br key={key} />;
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-600 rounded w-1/2 mb-4"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  // Collapsed widget when all posts are read
  if (isCollapsed && allowCollapse) {
    return (
      <div className={`w-full ${className}`}>
        <div 
          className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 hover:border-blue-500/50 transition-all duration-300 cursor-pointer"
          onClick={() => setIsCollapsed(false)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold">News Posts</h3>
                <p className="text-gray-400 text-sm">{posts.length} post{posts.length !== 1 ? 's' : ''} • All read</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-sm">Click to expand</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-400">No news posts available at the moment.</p>
      </div>
    );
  }

  if (heroLayout && posts.length > 0) {
    const featuredPost = posts[0];
    const sidebarPosts = posts.slice(1, 4);
    const isFeaturedExpanded = expandedPosts.has(featuredPost.id);

    return (
      <div className={`${className}`}>
        {/* Collapse all button when allowCollapse is enabled */}
        {allowCollapse && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-sm text-gray-300"
              title="Collapse news section"
            >
              <span>Collapse All</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Featured Post */}
          <div className="lg:flex-1">
            <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-blue-500/50 transition-all duration-300 ${
              showReadState ? (featuredPost.is_read ? 'news-post-read' : 'news-post-unread news-post-featured') : 'news-post-featured'
            }`}>
              {/* Header with badges and expand button */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                    FEATURED
                  </span>
                  <span className="text-gray-400 text-sm">
                    {new Date(featuredPost.published_at).toLocaleDateString()}
                  </span>
                  {showReadState && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      featuredPost.is_read 
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30' 
                        : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    }`}>
                      {featuredPost.is_read ? 'READ' : 'NEW'}
                    </span>
                  )}
                </div>
                
                <button
                  onClick={() => toggleExpanded(featuredPost.id)}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-sm text-gray-300"
                  title={isFeaturedExpanded ? 'Collapse content' : 'Expand content'}
                >
                  <span>{isFeaturedExpanded ? 'Collapse' : 'Expand'}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform duration-200 ${isFeaturedExpanded ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 hover:text-blue-400 transition-colors">
                <Link href={`/news/${featuredPost.id}`}>
                  {featuredPost.title}
                </Link>
              </h2>
              
              {featuredPost.subtitle && (
                <p className="text-gray-300 mb-4">{featuredPost.subtitle}</p>
              )}

              {isFeaturedExpanded && (
                <>
                  {featuredPost.featured_image_url && (
                    <img
                      src={featuredPost.featured_image_url}
                      alt={featuredPost.title}
                      className="w-full max-h-64 object-contain rounded-lg mb-4 bg-gray-800"
                    />
                  )}
                  
                  <div className="prose prose-invert max-w-none mb-4">
                    {renderContent(featuredPost.content)}
                  </div>
                </>
              )}

              {!isFeaturedExpanded && (
                <div className="text-gray-400 text-sm italic mb-4">
                  Click "Expand" to read the full content...
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  By {featuredPost.author_alias || featuredPost.author_name}
                </span>
                <div className="flex items-center gap-2">
                  {['like', 'heart', 'fire', 'shock'].map((reaction) => {
                    const count = featuredPost.reaction_counts?.[reaction] || 0;
                    const users = reactionDetails[featuredPost.id]?.[reaction] || [];
                    
                    let tooltipText = '';
                    if (users.length > 0) {
                      const userList = users.slice(0, 5).join(', ');
                      const extraCount = users.length > 5 ? ` and ${users.length - 5} more` : '';
                      tooltipText = `${userList}${extraCount}`;
                    } else if (count > 0) {
                      tooltipText = `${count} ${count === 1 ? 'person' : 'people'} reacted`;
                    } else {
                      tooltipText = `React with ${getReactionEmoji(reaction)}`;
                    }
                    
                    return (
                      <button
                        key={reaction}
                        onClick={() => toggleReaction(featuredPost.id, reaction)}
                        onMouseEnter={() => {
                          if (count > 0 && users.length === 0) {
                            fetchReactionDetails(featuredPost.id);
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600 active:scale-95 transition-all duration-150 text-sm"
                        title={tooltipText}
                      >
                        <span>{getReactionEmoji(reaction)}</span>
                        <span className="text-gray-300">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Posts */}
          <div className="lg:w-80 space-y-4">
            {sidebarPosts.map((post) => {
              const isPostExpanded = expandedPosts.has(post.id);
              
              return (
                <div
                  key={post.id}
                  className={`bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-blue-500/50 transition-all duration-300 ${
                    showReadState ? (post.is_read ? 'news-post-read' : 'news-post-unread') : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">
                        {new Date(post.published_at).toLocaleDateString()}
                      </span>
                      {showReadState && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          post.is_read 
                            ? 'bg-green-600/20 text-green-400 border border-green-600/30' 
                            : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                        }`}>
                          {post.is_read ? 'READ' : 'NEW'}
                        </span>
                      )}
                    </div>
                    
                    <button
                      onClick={() => toggleExpanded(post.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-xs text-gray-300"
                      title={isPostExpanded ? 'Collapse' : 'Expand'}
                    >
                      <span>{isPostExpanded ? 'Collapse' : 'Expand'}</span>
                      <svg 
                        className={`w-3 h-3 transition-transform duration-200 ${isPostExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  
                  <h3 className="font-semibold text-white mb-2 hover:text-blue-400 transition-colors">
                    <Link href={`/news/${post.id}`}>
                      {post.title}
                    </Link>
                  </h3>
                  
                  {post.subtitle && (
                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                      {post.subtitle}
                    </p>
                  )}

                  {isPostExpanded && (
                    <div className="prose prose-sm prose-invert max-w-none mb-3">
                      {renderContent(post.content)}
                    </div>
                  )}

                  {!isPostExpanded && (
                    <div className="text-gray-400 text-xs italic mb-3">
                      Click "Expand" to read content...
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      By {post.author_alias || post.author_name}
                    </span>
                    <div className="flex items-center gap-1">
                      {['like', 'heart'].map((reaction) => {
                        const count = post.reaction_counts?.[reaction] || 0;
                        if (count === 0) return null;
                        const users = reactionDetails[post.id]?.[reaction] || [];
                        
                        let tooltipText = '';
                        if (users.length > 0) {
                          const userList = users.slice(0, 3).join(', ');
                          const extraCount = users.length > 3 ? ` +${users.length - 3}` : '';
                          tooltipText = `${userList}${extraCount}`;
                        } else {
                          tooltipText = `${count} ${count === 1 ? 'person' : 'people'} reacted`;
                        }
                        
                        return (
                          <button
                            key={reaction}
                            onClick={() => toggleReaction(post.id, reaction)}
                            onMouseEnter={() => {
                              if (count > 0 && users.length === 0) {
                                fetchReactionDetails(post.id);
                              }
                            }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded text-xs hover:bg-gray-700 active:scale-95 transition-all duration-150"
                            title={tooltipText}
                          >
                            <span>{getReactionEmoji(reaction)}</span>
                            <span className="text-gray-400">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {posts.map((post) => {
        const isExpanded = expandedPosts.has(post.id);
        
        return (
          <article
            key={post.id}
            className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-blue-500/50 transition-all duration-300 ${
              showReadState ? (post.is_read ? 'news-post-read' : 'news-post-unread') : ''
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  {new Date(post.published_at).toLocaleDateString()}
                </span>
                {post.featured && (
                  <span className="bg-yellow-600 text-white px-2 py-1 rounded text-xs font-medium">
                    FEATURED
                  </span>
                )}
                {showReadState && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    post.is_read 
                      ? 'bg-green-600/20 text-green-400 border border-green-600/30' 
                      : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  }`}>
                    {post.is_read ? 'READ' : 'NEW'}
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-500">
                By {post.author_alias || post.author_name}
              </span>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-white hover:text-blue-400 transition-colors">
                <Link href={`/news/${post.id}`}>
                  {post.title}
                </Link>
              </h2>
              
              <button
                onClick={() => toggleExpanded(post.id)}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-sm text-gray-300"
                title={isExpanded ? 'Collapse content' : 'Expand content'}
              >
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {post.subtitle && (
              <p className="text-gray-300 mb-4">{post.subtitle}</p>
            )}

            {isExpanded && (
              <>
                {post.featured_image_url && (
                  <img
                    src={post.featured_image_url}
                    alt={post.title}
                    className="w-full max-h-64 object-contain rounded-lg mb-4 bg-gray-800"
                  />
                )}

                <div className="prose prose-invert max-w-none mb-4">
                  {renderContent(post.content)}
                </div>
              </>
            )}

            {!isExpanded && (
              <div className="text-gray-400 text-sm italic mb-4">
                Click "Expand" to read the full content...
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-2">
                {['like', 'heart', 'fire', 'shock'].map((reaction) => {
                  const count = post.reaction_counts?.[reaction] || 0;
                  const users = reactionDetails[post.id]?.[reaction] || [];
                  
                  let tooltipText = '';
                  if (users.length > 0) {
                    const userList = users.slice(0, 5).join(', ');
                    const extraCount = users.length > 5 ? ` and ${users.length - 5} more` : '';
                    tooltipText = `${userList}${extraCount}`;
                  } else if (count > 0) {
                    tooltipText = `${count} ${count === 1 ? 'person' : 'people'} reacted`;
                  } else {
                    tooltipText = `React with ${getReactionEmoji(reaction)}`;
                  }
                  
                  return (
                    <button
                      key={reaction}
                      onClick={() => toggleReaction(post.id, reaction)}
                      onMouseEnter={() => {
                        if (count > 0 && users.length === 0) {
                          fetchReactionDetails(post.id);
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-700 hover:bg-gray-600 active:scale-95 transition-all duration-150 text-sm"
                      title={tooltipText}
                    >
                      <span>{getReactionEmoji(reaction)}</span>
                      <span className="text-gray-300">{count}</span>
                    </button>
                  );
                })}
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {post.view_count || 0} views
                </span>
                <Link
                  href={`/news/${post.id}`}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                >
                  Read more →
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

// Collapsed News Widget Component - can be placed anywhere
export const CollapsedNewsWidget = ({ 
  onExpand, 
  postCount = 0,
  className = '' 
}: { 
  onExpand: () => void; 
  postCount?: number; 
  className?: string; 
}) => {
  return (
    <div className={`${className}`}>
      <div 
        className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 hover:border-blue-500/50 transition-all duration-300 cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold">News Posts</h3>
              <p className="text-gray-400 text-sm">{postCount} post{postCount !== 1 ? 's' : ''} • All read</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-sm">Click to expand</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsSection; 