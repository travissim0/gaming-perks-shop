'use client';

import React, { useState, useEffect, use } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

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
}

interface ReactionDetail {
  [reactionType: string]: string[]; // Array of user aliases
}

export default function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactionDetails, setReactionDetails] = useState<ReactionDetail>({});
  const { user } = useAuth();

  const fetchPost = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/news?postId=${resolvedParams.id}`, {
        headers: session?.access_token ? {
          'authorization': `Bearer ${session.access_token}`
        } : {}
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Post not found');
        }
        throw new Error('Failed to fetch post');
      }
      
      const data = await response.json();
      setPost(data.post);
      
      // Mark as read
      if (user && session?.access_token) {
        await fetch('/api/news', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'mark_read',
            postId: resolvedParams.id,
            readingTime: 30,
          }),
        });
      }
      
    } catch (error) {
      console.error('Error fetching post:', error);
      toast.error('Failed to load post');
    } finally {
      setLoading(false);
    }
  };

  const fetchReactionDetails = async () => {
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
          postId: resolvedParams.id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.reactionDetails) {
          setReactionDetails(result.reactionDetails);
        }
      }
    } catch (error) {
      console.error('Error fetching reaction details:', error);
    }
  };

  const toggleReaction = async (reactionType: string) => {
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

      const response = await fetch('/api/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'react',
          postId: resolvedParams.id,
          reactionType,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.error || 'Failed to react to post');
        return;
      }
      
      const action = result.action || 'added';
      const emoji = getReactionEmoji(reactionType);
      if (action === 'added') {
        toast.success(`Reacted with ${emoji}!`);
      } else {
        toast.success(`Removed ${emoji} reaction`);
      }
      
      fetchPost();
      fetchReactionDetails();
      
    } catch (error) {
      console.error('Error toggling reaction:', error);
      toast.error('Failed to react to post');
    }
  };

  useEffect(() => {
    fetchPost();
  }, [resolvedParams.id]);

  useEffect(() => {
    if (post && user) {
      fetchReactionDetails();
    }
  }, [post, user]);

  const getReactionEmoji = (type: string) => {
    const emojis: Record<string, string> = {
      like: '👍',
      heart: '❤️',
      fire: '🔥',
      shock: '😲'
    };
    return emojis[type] || '👍';
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
      console.warn('Unknown content format:', content);
      return (
        <div className="bg-yellow-900/20 border border-yellow-600 rounded p-4 mb-4">
          <p className="text-yellow-400 font-semibold mb-2">Debug: Unknown content format</p>
          <pre className="text-xs text-gray-300 overflow-auto">
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
      <div className="min-h-screen bg-gray-900 pt-20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-600 rounded w-1/2 mb-6"></div>
            <div className="h-64 bg-gray-700 rounded mb-6"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-900 pt-20">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Post Not Found</h1>
          <p className="text-gray-400 mb-6">The news post you're looking for doesn't exist or has been removed.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 pt-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back button */}
        <Link href="/" className="text-blue-400 hover:text-blue-300 mb-6 inline-block">
          ← Back to Home
        </Link>

        <article className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-gray-400">
                {new Date(post.published_at).toLocaleDateString()}
              </span>
              {post.featured && (
                <span className="bg-yellow-600 text-white px-2 py-1 rounded text-xs font-medium">
                  FEATURED
                </span>
              )}
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-3">{post.title}</h1>
            
            {post.subtitle && (
              <p className="text-xl text-gray-300 mb-4">{post.subtitle}</p>
            )}
            
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>By {post.author_alias || post.author_name}</span>
              <span>{post.view_count || 0} views</span>
            </div>
          </div>

          {/* Featured Image */}
          {post.featured_image_url && (
            <div className="mb-8">
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full h-64 object-cover rounded-lg"
              />
            </div>
          )}

          {/* Content */}
          <div className="prose prose-invert max-w-none mb-8">
            {renderContent(post.content)}
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {post.tags.map((tag, index) => (
                <span
                  key={index}
                  className="bg-blue-600/20 text-blue-300 px-3 py-1 rounded-full text-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Reactions */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Reactions</h3>
            <div className="flex items-center gap-3">
              {['like', 'heart', 'fire', 'shock'].map((reaction) => {
                const count = post.reaction_counts?.[reaction] || 0;
                const users = reactionDetails[reaction] || [];
                
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
                    onClick={() => toggleReaction(reaction)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                    title={tooltipText}
                  >
                    <span className="text-xl">{getReactionEmoji(reaction)}</span>
                    <span className="text-gray-300">{count}</span>
                  </button>
                );
              })}
            </div>
            
            {!user && (
              <p className="text-sm text-gray-500 mt-4">
                <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">
                  Login
                </Link> to react to this post
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
} 