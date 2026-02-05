'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Orbitron } from 'next/font/google';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, ExternalLink, Calendar, User, ChevronRight, Pencil } from 'lucide-react';
import NewPostModal from './NewPostModal';

const InlinePostEditor = dynamic(() => import('./InlinePostEditor'), { ssr: false });

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

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

// ─── ProseMirror Rendering ───────────────────────────────────────────────────

function renderProseMirrorNode(node: any, key: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className="mb-4 text-gray-200 text-base sm:text-lg leading-relaxed">
          {node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i))}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level || 2;
      const classes: Record<number, string> = {
        1: 'text-2xl sm:text-3xl font-bold text-cyan-300 mb-3',
        2: 'text-xl sm:text-2xl font-bold text-cyan-300/90 mb-2',
        3: 'text-lg sm:text-xl font-semibold text-cyan-300/80 mb-2',
        4: 'text-base sm:text-lg font-semibold text-cyan-300/70 mb-2',
      };
      const cls = classes[level] || classes[2];
      const content = node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i));
      const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      return <Tag key={key} className={cls}>{content}</Tag>;
    }
    case 'bulletList':
      return (
        <ul key={key} className="mb-4 text-gray-200 ml-2 list-none space-y-1.5 text-base sm:text-lg leading-relaxed">
          {node.content?.map((item: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2.5">
              <span className="text-cyan-500/60 flex-shrink-0">›</span>
              <span>{renderListItemContent(item)}</span>
            </li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mb-4 text-gray-200 ml-2 list-none space-y-1.5 text-base sm:text-lg leading-relaxed">
          {node.content?.map((item: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2.5">
              <span className="text-cyan-500/60 flex-shrink-0 font-mono text-sm">{i + 1}.</span>
              <span>{renderListItemContent(item)}</span>
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-2 border-cyan-400/40 pl-4 mb-3 italic text-gray-300 text-base sm:text-lg leading-relaxed">
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
    case 'image':
      return (
        <div key={key} className="my-4">
          <img src={node.attrs?.src} alt={node.attrs?.alt || ''} className="max-w-full rounded-lg border border-cyan-500/20" />
        </div>
      );
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
          case 'link':
            return <a key={`${key}-l-${i}`} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">{acc}</a>;
          case 'textStyle': {
            const style: any = {};
            if (mark.attrs?.fontSize) style.fontSize = mark.attrs.fontSize;
            if (mark.attrs?.fontFamily) style.fontFamily = mark.attrs.fontFamily;
            return <span key={`${key}-ts-${i}`} style={style}>{acc}</span>;
          }
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

// Extract inline content from list items, avoiding nested <p> wrappers
function renderListItemContent(item: any): React.ReactNode {
  if (!item.content) return null;
  return item.content.map((child: any, ci: number) => {
    // If the child is a paragraph, render its inline content directly (no <p> wrapper)
    if (child.type === 'paragraph') {
      return <React.Fragment key={ci}>{child.content?.map((inline: any, ii: number) => renderProseMirrorInline(inline, ii))}</React.Fragment>;
    }
    // Otherwise render normally (e.g. nested lists)
    return renderProseMirrorNode(child, ci);
  });
}

// ─── Content Renderer ────────────────────────────────────────────────────────

function renderFullContent(content: any): React.ReactNode {
  if (!content) return null;

  // HTML string
  if (typeof content === 'string') {
    return (
      <div
        className="text-gray-200 text-base sm:text-lg leading-relaxed prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // TipTap ProseMirror JSON
  if (content.type === 'doc' && content.content) {
    return (
      <div className="text-base leading-relaxed">
        {content.content.map((node: any, i: number) => renderProseMirrorNode(node, i))}
      </div>
    );
  }

  // Try parsing stringified JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'doc') return renderFullContent(parsed);
    } catch {
      // not JSON, render as text
    }
  }

  // Safety: if content is an object we can't handle, render as JSON string
  if (typeof content === 'object') {
    return (
      <div className="text-gray-200 text-base sm:text-lg leading-relaxed">
        {JSON.stringify(content)}
      </div>
    );
  }

  return null;
}

// ─── YouTube helper ──────────────────────────────────────────────────────────

function getYouTubeId(url: string): string | null {
  const match = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HomeNewsSection() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);

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

  const fetchPosts = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const { data, error } = await supabase
        .from('news_posts')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const authorIds = [...new Set(data.map((p: any) => p.author_id).filter(Boolean))];
        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, in_game_alias')
            .in('id', authorIds);
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.in_game_alias]));
          setPosts(data.map((post: any) => ({
            ...post,
            author_alias: profileMap.get(post.author_id) || post.author_name
          })));
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

  useEffect(() => { fetchPosts(); }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const handlePostCreated = () => { fetchPosts(); };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton />
      </div>
    );
  }

  const latestPost = posts[0] || null;
  const olderPosts = posts.slice(1);

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-5xl font-black tracking-wide text-gray-200 ${orbitron.className}`}>
            News & Updates
          </h2>
          <div className="mt-2 h-0.5 w-32 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full" />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewPostModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600/30 to-emerald-600/30 hover:from-green-600/40 hover:to-emerald-600/40 border border-green-500/40 text-green-400 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-green-500/10"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="p-12 text-center bg-gray-800/30 rounded-2xl border border-gray-700/30">
          <div className="text-4xl mb-3 opacity-40">📰</div>
          <p className="text-gray-500">No news posts yet</p>
          {isAdmin && (
            <button
              onClick={() => setShowNewPostModal(true)}
              className="mt-4 text-green-400 hover:text-green-300 text-sm"
            >
              Create the first post
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ─── Hero Post (Latest) ─── */}
          {latestPost && <HeroPost post={latestPost} formatDate={formatDate} isAdmin={isAdmin} onEdit={() => setEditingPost(latestPost)} />}

          {/* ─── Older Posts (list with hover-expand) ─── */}
          {olderPosts.length > 0 && (
            <div className="rounded-xl border border-gray-600/15 overflow-hidden">
              {olderPosts.map((post, i) => (
                <ExpandablePostRow
                  key={post.id}
                  post={post}
                  formatDate={formatDate}
                  isExpanded={expandedPostId === post.id}
                  onToggle={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                  isLast={i === olderPosts.length - 1}
                  isAdmin={isAdmin}
                  onEdit={() => setEditingPost(post)}
                />
              ))}
            </div>
          )}

          {/* View All */}
          <div className="text-center pt-2">
            <Link
              href="/news"
              className="inline-flex items-center gap-1.5 text-sm text-cyan-400/70 hover:text-cyan-300 transition-colors group font-medium"
            >
              View all news
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </>
      )}

      {/* New Post Modal */}
      {showNewPostModal && (
        <NewPostModal
          onClose={() => setShowNewPostModal(false)}
          onPostCreated={handlePostCreated}
        />
      )}

      {/* Inline Post Editor */}
      {editingPost && (
        <InlinePostEditor
          post={editingPost}
          onSave={(updatedFields) => {
            // Optimistically update the post in local state immediately
            if (updatedFields) {
              setPosts(prev => prev.map(p =>
                p.id === editingPost.id ? { ...p, ...updatedFields } : p
              ));
            }
            setEditingPost(null);
            // Background refresh from database (no loading skeleton)
            fetchPosts(false);
          }}
          onClose={() => setEditingPost(null)}
        />
      )}
    </div>
  );
}

// ─── Hero Post Component ─────────────────────────────────────────────────────

function HeroPost({ post, formatDate, isAdmin, onEdit }: { post: NewsPost; formatDate: (d: string) => string; isAdmin: boolean; onEdit: () => void }) {
  const videoUrl = post.metadata?.video_url;
  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;

  const publishDate = new Date(post.published_at || post.created_at);
  const stardate = `${publishDate.getFullYear()}.${String(publishDate.getMonth() + 1).padStart(2, '0')}.${String(publishDate.getDate()).padStart(2, '0')}`;
  const timestamp = publishDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
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
            <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-[0.2em]">Live Transmission</span>
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
        <div className="relative w-full max-h-72 overflow-hidden bg-gray-900">
          <img
            src={post.featured_image_url}
            alt={post.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
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
        {/* Title + Author + Tags row */}
        <div className="flex items-start gap-3 mb-2">
          <div className="flex items-baseline gap-3 flex-1 min-w-0 flex-wrap">
            <h3 className="text-2xl md:text-3xl font-black leading-tight">
              <Link href={`/news/${post.id}`} className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-cyan-200 hover:from-cyan-300 hover:to-blue-300 transition-all duration-300">
                {post.title}
              </Link>
            </h3>
            {(post.author_alias || post.author_name) && (
              <span className="text-sm text-cyan-400/60 whitespace-nowrap">by {post.author_alias || post.author_name}</span>
            )}
          </div>
          {post.tags && post.tags.length > 0 && (
            <div className="flex gap-1.5 flex-shrink-0 pt-1.5">
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
        </div>

        {/* Subtitle */}
        {post.subtitle && (
          <p className="text-cyan-100/50 text-base mb-5 font-medium italic">{post.subtitle}</p>
        )}

        {/* Content Frame */}
        <div className="relative mb-5 rounded border border-cyan-500/15 overflow-hidden bg-gray-950/80">
          {/* Subtle inner glow at top */}
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
            className="inline-flex items-center gap-1.5 mb-4 px-4 py-2 bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/20 text-sm font-mono font-medium transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Access External Link
          </a>
        )}

        {/* Footer meta bar */}
        <div className="flex items-center gap-4 text-xs border-t border-cyan-500/20 pt-4 mt-2 font-mono">
          <span className="flex items-center gap-1.5 text-cyan-400/70">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(post.published_at || post.created_at)}
          </span>
          {(post.author_alias || post.author_name) && (
            <span className="flex items-center gap-1.5 text-cyan-300/50">
              <User className="w-3.5 h-3.5" />
              <span className="text-cyan-400/70">{post.author_alias || post.author_name}</span>
            </span>
          )}
          {isAdmin && (
            <button
              onClick={onEdit}
              className="text-amber-400/60 hover:text-amber-300 transition-colors flex items-center gap-1 font-medium cursor-pointer"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          <Link
            href={`/news/${post.id}`}
            className="ml-auto text-cyan-400/60 hover:text-cyan-300 transition-colors flex items-center gap-1 font-medium"
          >
            Permalink <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Bottom glow line */}
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    </article>
  );
}

// ─── Compact Post Card ───────────────────────────────────────────────────────

function CompactPostCard({ post, formatDate }: { post: NewsPost; formatDate: (d: string) => string }) {
  const videoUrl = post.metadata?.video_url;
  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const thumbnailUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    : post.featured_image_url || null;

  return (
    <Link href={`/news/${post.id}`}>
      <article className="group h-full flex overflow-hidden rounded-xl bg-gray-800/30 border border-gray-600/20 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
        {/* Left accent bar */}
        <div className="w-1 bg-gradient-to-b from-cyan-500/40 to-blue-500/20 group-hover:from-cyan-400 group-hover:to-blue-500 transition-all duration-300 shrink-0" />

        <div className="flex gap-3 p-4 flex-1">
          {/* Thumbnail */}
          {thumbnailUrl && (
            <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-gray-900 ring-1 ring-white/5">
              <img
                src={thumbnailUrl}
                alt={post.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-gray-100 group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
              {post.title}
            </h4>
            {post.subtitle && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{post.subtitle}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs">
              <span className="text-cyan-500/60">{formatDate(post.published_at || post.created_at)}</span>
              {(post.author_alias || post.author_name) && (
                <span className="text-purple-400/50">{post.author_alias || post.author_name}</span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// ─── Expandable Post Row ─────────────────────────────────────────────────────

function ExpandablePostRow({
  post,
  formatDate,
  isExpanded,
  onToggle,
  isLast,
  isAdmin,
  onEdit,
}: {
  post: NewsPost;
  formatDate: (d: string) => string;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const videoUrl = post.metadata?.video_url;
  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;

  return (
    <div className={`${!isLast ? 'border-b border-gray-700/20' : ''}`}>
      {/* Row: title links to post, arrow area triggers expand */}
      <div className="flex items-center">
        <Link
          href={`/news/${post.id}`}
          className="group flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-cyan-500/5 transition-all duration-200"
        >
          <div className={`w-1.5 h-1.5 rounded-full transition-colors shrink-0 ${isExpanded ? 'bg-cyan-400' : 'bg-cyan-500/40 group-hover:bg-cyan-400'}`} />
          <span className="text-sm text-gray-200 font-medium truncate group-hover:text-cyan-300 transition-colors">
            {post.title}
          </span>
        </Link>
        <div className="flex items-center gap-2 shrink-0 pr-2">
          <span className="text-xs text-cyan-500/50 font-medium">
            {formatDate(post.published_at || post.created_at)}
          </span>
          {/* Expand trigger — click to toggle */}
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-all duration-300 cursor-pointer ${isExpanded ? 'bg-cyan-500/15' : 'hover:bg-cyan-500/10'}`}
          >
            <ChevronRight className={`w-4 h-4 transition-all duration-300 ${isExpanded ? 'rotate-90 text-cyan-400' : 'text-gray-600 hover:text-cyan-400'}`} />
          </button>
        </div>
      </div>

      {/* Expanded content — smooth grid-rows animation */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="overflow-hidden">
          <article
            className="bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm"
            style={{
              opacity: isExpanded ? 1 : 0,
              transition: 'opacity 300ms ease-in-out',
              transitionDelay: isExpanded ? '150ms' : '0ms',
            }}
          >
            <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />

            {/* YouTube Embed — only load when expanded */}
            {isExpanded && youtubeId && (
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

            {/* Featured Image */}
            {post.featured_image_url && !youtubeId && (
              <div className="relative w-full max-h-60 overflow-hidden bg-gray-900">
                <img
                  src={post.featured_image_url}
                  alt={post.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent" />
              </div>
            )}

            <div className="p-6">
              {/* Title + Author + Tags row */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex items-baseline gap-3 flex-1 min-w-0 flex-wrap">
                  <h3 className="text-xl md:text-2xl font-black leading-tight">
                    <Link href={`/news/${post.id}`} className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-cyan-200 hover:from-cyan-300 hover:to-blue-300 transition-all duration-300">
                      {post.title}
                    </Link>
                  </h3>
                  {(post.author_alias || post.author_name) && (
                    <span className="text-sm text-cyan-400/60 whitespace-nowrap">by {post.author_alias || post.author_name}</span>
                  )}
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-shrink-0 pt-1">
                    {post.tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-full text-[11px] text-cyan-300 font-semibold uppercase tracking-wider">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {post.subtitle && (
                <p className="text-cyan-100/60 text-sm mb-4 font-medium">{post.subtitle}</p>
              )}

              {/* Content Frame */}
              <div className="relative mb-4 rounded border border-cyan-500/15 overflow-hidden bg-gray-950/80">
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-cyan-500/[0.02] to-transparent pointer-events-none" />
                <div className="relative px-8 py-5 sm:px-10">
                  <div className="max-w-none">
                    {renderFullContent(post.content)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs border-t border-cyan-500/10 pt-3 mt-2">
                <span className="flex items-center gap-1.5 text-cyan-400/70">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(post.published_at || post.created_at)}
                </span>
                {(post.author_alias || post.author_name) && (
                  <span className="flex items-center gap-1.5 text-purple-400/70">
                    <User className="w-3.5 h-3.5" />
                    {post.author_alias || post.author_name}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={onEdit}
                    className="text-amber-400/60 hover:text-amber-300 transition-colors flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
                <Link
                  href={`/news/${post.id}`}
                  className="ml-auto text-cyan-400/60 hover:text-cyan-300 transition-colors flex items-center gap-1 font-medium"
                >
                  Permalink <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-gray-700/50 rounded animate-pulse" />
          <div className="mt-2 h-0.5 w-16 bg-gray-700/50 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="rounded-2xl border border-gray-700/30 bg-gray-800/30 overflow-hidden animate-pulse">
        <div className="h-1 bg-gray-700/50" />
        <div className="h-48 bg-gray-700/30" />
        <div className="p-6 space-y-3">
          <div className="h-6 bg-gray-700/50 rounded w-3/4" />
          <div className="h-4 bg-gray-700/40 rounded w-1/2" />
          <div className="space-y-2 pt-2">
            <div className="h-3 bg-gray-700/30 rounded w-full" />
            <div className="h-3 bg-gray-700/30 rounded w-5/6" />
            <div className="h-3 bg-gray-700/30 rounded w-2/3" />
          </div>
        </div>
      </div>

      {/* Card skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-gray-700/20 bg-gray-800/20 p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-20 h-14 bg-gray-700/30 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-700/40 rounded w-3/4" />
                <div className="h-3 bg-gray-700/30 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
