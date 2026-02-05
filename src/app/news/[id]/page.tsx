'use client';

import React, { useState, useEffect, use } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { Calendar, User, ChevronLeft, Eye, Pencil } from 'lucide-react';

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
  [reactionType: string]: string[];
}

// ─── ProseMirror Rendering (matches home page style) ────────────────────────

function renderProseMirrorNode(node: any, key: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className="mb-4 text-gray-200 text-xl sm:text-2xl leading-loose">
          {node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i))}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level || 2;
      const classes: Record<number, string> = {
        1: 'text-2xl font-bold text-cyan-300 mb-3 font-mono uppercase tracking-[0.15em]',
        2: 'text-xl font-bold text-cyan-300/90 mb-2 font-mono uppercase tracking-[0.12em]',
        3: 'text-lg font-semibold text-cyan-300/80 mb-2 font-mono uppercase tracking-[0.1em]',
        4: 'text-base font-semibold text-cyan-300/70 mb-2 font-mono tracking-[0.08em]',
      };
      const cls = classes[level] || classes[2];
      const content = node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i));
      const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      return <Tag key={key} className={cls}>{content}</Tag>;
    }
    case 'bulletList':
      return (
        <ul key={key} className="mb-3 text-gray-200 ml-5 list-none space-y-1.5 text-xl sm:text-2xl leading-loose">
          {node.content?.map((item: any, i: number) => (
            <li key={i} className="before:content-['›_'] before:text-cyan-500/60">
              {item.content?.map((child: any, ci: number) => renderProseMirrorNode(child, ci))}
            </li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mb-3 text-gray-200 ml-5 list-decimal space-y-1.5 text-xl sm:text-2xl leading-loose marker:text-cyan-500/60">
          {node.content?.map((item: any, i: number) => (
            <li key={i}>
              {item.content?.map((child: any, ci: number) => renderProseMirrorNode(child, ci))}
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-2 border-cyan-400/40 pl-4 mb-3 italic text-gray-300 text-xl sm:text-2xl leading-loose">
          {node.content?.map((child: any, i: number) => renderProseMirrorNode(child, i))}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="bg-gray-900/80 rounded-lg p-3 mb-3 overflow-x-auto text-sm text-green-400 font-mono">
          <code>{node.content?.map((c: any) => c.text).join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} className="border-gray-700/50 my-4" />;
    case 'listItem':
      return node.content?.map((child: any, i: number) => renderProseMirrorNode(child, i));
    default:
      return null;
  }
}

function renderProseMirrorInline(node: any, key: number): React.ReactNode {
  if (node.type === 'text') {
    let result: React.ReactNode = node.text;
    if (node.marks && node.marks.length > 0) {
      result = node.marks.reduce((acc: React.ReactNode, mark: any, i: number) => {
        switch (mark.type) {
          case 'bold':
            return <strong key={`${key}-b-${i}`}>{acc}</strong>;
          case 'italic':
            return <em key={`${key}-i-${i}`}>{acc}</em>;
          case 'underline':
            return <u key={`${key}-u-${i}`}>{acc}</u>;
          case 'strike':
            return <del key={`${key}-s-${i}`}>{acc}</del>;
          case 'code':
            return <code key={`${key}-c-${i}`} className="bg-gray-700/60 px-1 rounded text-sm text-cyan-300">{acc}</code>;
          default:
            return acc;
        }
      }, node.text);
    }
    return result;
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  return null;
}

function renderFullContent(content: any): React.ReactNode {
  if (!content) return null;

  if (typeof content === 'string') {
    return (
      <div
        className="text-gray-200 text-lg sm:text-xl leading-loose prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  if (content.type === 'doc' && content.content) {
    return (
      <div className="text-base leading-relaxed">
        {content.content.map((node: any, i: number) => renderProseMirrorNode(node, i))}
      </div>
    );
  }

  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'doc') return renderFullContent(parsed);
    } catch {
      // not JSON
    }
  }

  // Legacy EditorJS format
  if (content.blocks) {
    return content.blocks.map((block: any, index: number) => {
      switch (block.type) {
        case 'paragraph':
          return (
            <p key={index} className="mb-4 text-gray-200 text-xl sm:text-2xl leading-loose">
              {block.data.text}
            </p>
          );
        case 'header': {
          const level = block.data.level || 2;
          const classes: Record<number, string> = {
            1: 'text-2xl font-bold text-cyan-300 mb-3 font-mono uppercase tracking-[0.15em]',
            2: 'text-xl font-bold text-cyan-300/90 mb-2 font-mono uppercase tracking-[0.12em]',
            3: 'text-lg font-semibold text-cyan-300/80 mb-2 font-mono uppercase tracking-[0.1em]',
          };
          const cls = classes[level] || classes[2];
          const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
          return <Tag key={index} className={cls}>{block.data.text}</Tag>;
        }
        case 'list': {
          const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
          return (
            <ListTag key={index} className="mb-3 text-gray-200 ml-5 list-none space-y-1.5 text-xl sm:text-2xl leading-loose">
              {block.data.items.map((item: string, itemIndex: number) => (
                <li key={itemIndex} className="before:content-['›_'] before:text-cyan-500/60">{item}</li>
              ))}
            </ListTag>
          );
        }
        default:
          return null;
      }
    });
  }

  if (typeof content === 'object') {
    return (
      <div className="text-gray-200 text-lg sm:text-xl leading-loose">
        {JSON.stringify(content)}
      </div>
    );
  }

  return null;
}

function getYouTubeId(url: string): string | null {
  const match = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactionDetails, setReactionDetails] = useState<ReactionDetail>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin, site_admin')
        .eq('id', user.id)
        .single();
      setIsAdmin(data?.is_admin || data?.site_admin || false);
    };
    checkAdmin();
  }, [user]);

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
        if (response.status === 404) throw new Error('Post not found');
        throw new Error('Failed to fetch post');
      }

      const data = await response.json();
      setPost(data.post);

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
        if (result.reactionDetails) setReactionDetails(result.reactionDetails);
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
      toast.success(action === 'added' ? `Reacted with ${emoji}!` : `Removed ${emoji} reaction`);

      fetchPost();
      fetchReactionDetails();
    } catch (error) {
      console.error('Error toggling reaction:', error);
      toast.error('Failed to react to post');
    }
  };

  useEffect(() => { fetchPost(); }, [resolvedParams.id]);
  useEffect(() => { if (post && user) fetchReactionDetails(); }, [post, user]);

  const getReactionEmoji = (type: string) => {
    const emojis: Record<string, string> = { like: '👍', heart: '❤️', fire: '🔥', shock: '😲' };
    return emojis[type] || '👍';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 pt-20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-800 rounded w-32" />
            <div className="rounded-lg border border-cyan-500/20 bg-gray-900/80 p-8 space-y-4">
              <div className="h-8 bg-gray-800 rounded w-3/4" />
              <div className="h-4 bg-gray-800/60 rounded w-1/2" />
              <div className="h-64 bg-gray-800/40 rounded" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-800/30 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-950 pt-20">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4 font-mono">Post Not Found</h1>
          <p className="text-gray-400 mb-6 font-mono">The news post you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1.5 justify-center">
            <ChevronLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const videoUrl = post.metadata?.video_url;
  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const publishDate = new Date(post.published_at || post.created_at);
  const stardate = `${publishDate.getFullYear()}.${String(publishDate.getMonth() + 1).padStart(2, '0')}.${String(publishDate.getDate()).padStart(2, '0')}`;
  const timestamp = publishDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="min-h-screen bg-gray-950 pt-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-cyan-400/70 hover:text-cyan-300 font-mono text-sm mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Home
        </Link>

        <article className="relative overflow-hidden rounded-lg border border-cyan-500/30 bg-gray-950/90 shadow-2xl shadow-cyan-500/10">
          {/* Scan line overlay */}
          <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
            }}
          />

          {/* Top HUD bar */}
          <div className="relative z-20 flex items-center justify-between px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-[0.2em]">Transmission</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-cyan-500/30" />
              <span className="hidden sm:block text-[10px] font-mono text-cyan-500/60 tracking-wider">FREQ 7.7.42</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-cyan-500/60 tracking-wider">SD {stardate}</span>
              <div className="w-px h-3 bg-cyan-500/30" />
              <span className="text-[10px] font-mono text-cyan-400/80 tracking-wider">{timestamp} UTC</span>
            </div>
          </div>

          {/* Corner brackets */}
          <div className="absolute top-10 left-0 w-4 h-8 border-l-2 border-t-2 border-cyan-400/40 z-20 rounded-tl-sm" />
          <div className="absolute top-10 right-0 w-4 h-8 border-r-2 border-t-2 border-cyan-400/40 z-20 rounded-tr-sm" />
          <div className="absolute bottom-0 left-0 w-4 h-8 border-l-2 border-b-2 border-cyan-400/40 z-20 rounded-bl-sm" />
          <div className="absolute bottom-0 right-0 w-4 h-8 border-r-2 border-b-2 border-cyan-400/40 z-20 rounded-br-sm" />

          {/* Featured Image */}
          {post.featured_image_url && !youtubeId && (
            <div className="relative w-full max-h-96 overflow-hidden bg-gray-900">
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
            </div>
          )}

          {/* YouTube Embed */}
          {youtubeId && (
            <div className="relative w-full aspect-video bg-gray-900">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title={post.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          )}

          {/* Content */}
          <div className="relative z-20 p-6 sm:p-8">
            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 bg-cyan-400/10 border border-cyan-400/40 text-[11px] text-cyan-300 font-mono font-bold uppercase tracking-[0.15em]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-black mb-2 leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-cyan-200">
              {post.title}
            </h1>

            {/* Subtitle */}
            {post.subtitle && (
              <p className="text-cyan-100/50 text-lg mb-5 font-medium italic">{post.subtitle}</p>
            )}

            {/* Meta bar */}
            <div className="flex items-center flex-wrap gap-4 text-xs font-mono mb-6 pb-4 border-b border-cyan-500/20">
              <span className="flex items-center gap-1.5 text-cyan-400/70">
                <Calendar className="w-3.5 h-3.5" />
                {publishDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {(post.author_alias || post.author_name) && (
                <span className="flex items-center gap-1.5 text-cyan-300/50">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-cyan-400/70">{post.author_alias || post.author_name}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-cyan-400/50">
                <Eye className="w-3.5 h-3.5" />
                {post.view_count || 0} views
              </span>
              {isAdmin && (
                <Link
                  href={`/admin/news?edit=${post.id}`}
                  className="flex items-center gap-1 text-amber-400/60 hover:text-amber-300 transition-colors font-medium"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Link>
              )}
            </div>

            {/* Content Frame */}
            <div className="relative mb-6 rounded border border-cyan-500/15 overflow-hidden bg-gray-950/80">
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-cyan-500/[0.02] to-transparent pointer-events-none" />

              <div className="relative px-8 py-6 sm:px-10">
                <div className="max-w-none">
                  {renderFullContent(post.content)}
                </div>
              </div>
            </div>

            {/* External Link */}
            {post.metadata?.external_url && (
              <a
                href={post.metadata.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mb-6 px-4 py-2 bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/20 text-sm font-mono font-medium transition-all"
              >
                Access External Link
              </a>
            )}

            {/* Reactions */}
            <div className="border-t border-cyan-500/20 pt-6">
              <div className="flex items-center gap-3 flex-wrap">
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
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/60 border border-cyan-500/15 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all font-mono"
                      title={tooltipText}
                    >
                      <span className="text-xl">{getReactionEmoji(reaction)}</span>
                      <span className="text-cyan-300/70 text-sm">{count}</span>
                    </button>
                  );
                })}
              </div>

              {!user && (
                <p className="text-sm text-cyan-500/50 mt-4 font-mono">
                  <Link href="/auth/login" className="text-cyan-400 hover:text-cyan-300">
                    Login
                  </Link> to react to this post
                </p>
              )}
            </div>
          </div>

          {/* Bottom glow line */}
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        </article>
      </div>
    </div>
  );
}
