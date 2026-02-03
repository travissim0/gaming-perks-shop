'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, ExternalLink, Calendar, User, ChevronRight } from 'lucide-react';
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

// ─── ProseMirror Rendering ───────────────────────────────────────────────────

function renderProseMirrorNode(node: any, key: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className="mb-3 text-gray-300 leading-relaxed">
          {node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i))}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level || 2;
      const classes: Record<number, string> = {
        1: 'text-2xl font-bold text-white mb-3',
        2: 'text-xl font-bold text-white mb-2',
        3: 'text-lg font-semibold text-white mb-2',
        4: 'text-base font-semibold text-white mb-2',
      };
      const cls = classes[level] || classes[2];
      const content = node.content?.map((child: any, i: number) => renderProseMirrorInline(child, i));
      const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      return <Tag key={key} className={cls}>{content}</Tag>;
    }
    case 'bulletList':
      return (
        <ul key={key} className="mb-3 text-gray-300 ml-5 list-disc space-y-1">
          {node.content?.map((item: any, i: number) => (
            <li key={i}>
              {item.content?.map((child: any, ci: number) => renderProseMirrorNode(child, ci))}
            </li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mb-3 text-gray-300 ml-5 list-decimal space-y-1">
          {node.content?.map((item: any, i: number) => (
            <li key={i}>
              {item.content?.map((child: any, ci: number) => renderProseMirrorNode(child, ci))}
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-4 border-cyan-500/50 pl-4 mb-3 italic text-gray-400">
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

// ─── Content Renderer ────────────────────────────────────────────────────────

function renderFullContent(content: any): React.ReactNode {
  if (!content) return null;

  // HTML string
  if (typeof content === 'string') {
    return (
      <div
        className="text-gray-300 text-sm leading-relaxed prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // TipTap ProseMirror JSON
  if (content.type === 'doc' && content.content) {
    return (
      <div className="text-sm leading-relaxed">
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

  const fetchPosts = async () => {
    try {
      setIsLoading(true);
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
  const olderPosts = posts.slice(1, 5);
  const remainingPosts = posts.slice(5);

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            News & Updates
          </h2>
          <div className="mt-1 h-0.5 w-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
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
          {latestPost && <HeroPost post={latestPost} formatDate={formatDate} />}

          {/* ─── Secondary Posts (2-column grid) ─── */}
          {olderPosts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {olderPosts.map((post) => (
                <CompactPostCard key={post.id} post={post} formatDate={formatDate} />
              ))}
            </div>
          )}

          {/* ─── Remaining Posts (minimal list) ─── */}
          {remainingPosts.length > 0 && (
            <div className="bg-gray-800/20 rounded-xl border border-gray-700/20 overflow-hidden">
              {remainingPosts.map((post, i) => (
                <Link
                  key={post.id}
                  href={`/news/${post.id}`}
                  className={`flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors ${
                    i < remainingPosts.length - 1 ? 'border-b border-gray-700/20' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium truncate block">
                      {post.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs text-gray-500">
                      {formatDate(post.published_at || post.created_at)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* View All */}
          <div className="text-center">
            <Link
              href="/news"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors group"
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
    </div>
  );
}

// ─── Hero Post Component ─────────────────────────────────────────────────────

function HeroPost({ post, formatDate }: { post: NewsPost; formatDate: (d: string) => string }) {
  const videoUrl = post.metadata?.video_url;
  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm shadow-lg shadow-black/20">
      {/* Top gradient accent */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

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
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent" />
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
      <div className="p-6">
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex gap-2 mb-3">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-xs text-cyan-400 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h3 className="text-2xl font-bold text-white mb-1 leading-tight">
          <Link href={`/news/${post.id}`} className="hover:text-cyan-400 transition-colors">
            {post.title}
          </Link>
        </h3>

        {/* Subtitle */}
        {post.subtitle && (
          <p className="text-gray-400 text-base mb-4">{post.subtitle}</p>
        )}

        {/* Full Content */}
        <div className="prose prose-invert max-w-none mb-5">
          {renderFullContent(post.content)}
        </div>

        {/* External Link */}
        {post.metadata?.external_url && (
          <a
            href={post.metadata.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 text-sm transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Read more
          </a>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-700/30 pt-4">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(post.published_at || post.created_at)}
          </span>
          {(post.author_alias || post.author_name) && (
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {post.author_alias || post.author_name}
            </span>
          )}
          <Link
            href={`/news/${post.id}`}
            className="ml-auto text-cyan-500/70 hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            Permalink <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
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
      <article className="group h-full p-4 rounded-xl bg-gray-800/30 border border-gray-700/30 hover:border-cyan-500/20 hover:bg-gray-800/50 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/5">
        <div className="flex gap-3">
          {/* Thumbnail */}
          {thumbnailUrl && (
            <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-gray-900">
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
            <h4 className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors line-clamp-2 leading-snug">
              {post.title}
            </h4>
            {post.subtitle && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{post.subtitle}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600">
              <span>{formatDate(post.published_at || post.created_at)}</span>
              {(post.author_alias || post.author_name) && (
                <span>{post.author_alias || post.author_name}</span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
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
