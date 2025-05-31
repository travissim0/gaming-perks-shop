'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import type { ForumThread, ForumPost, ForumCategory } from '@/types/forum';

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { 
    getCategoryBySlug, 
    getThreadBySlug, 
    getPosts, 
    createPost,
    loading, 
    error 
  } = useForum();
  
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  
  const categorySlug = params.slug as string;
  const threadSlug = params.threadSlug as string;

  useEffect(() => {
    const loadData = async () => {
      if (!categorySlug || !threadSlug) return;
      
      // Load category
      const categoryData = await getCategoryBySlug(categorySlug);
      if (!categoryData) {
        router.push('/forum');
        return;
      }
      setCategory(categoryData);

      // Load thread
      const threadData = await getThreadBySlug(categorySlug, threadSlug);
      if (!threadData) {
        router.push(`/forum/c/${categorySlug}`);
        return;
      }
      setThread(threadData);

      // Load posts
      const postsData = await getPosts({ thread_id: threadData.id });
      setPosts(postsData?.posts || []);
    };

    loadData();
  }, [categorySlug, threadSlug, router]);

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !replyContent.trim() || !user) return;
    
    setSubmittingReply(true);
    setReplyError(null);
    
    try {
      const newPost = await createPost({
        thread_id: thread.id,
        content: replyContent.trim()
      });
      
      if (newPost) {
        setPosts(prev => [...prev, newPost]);
        setReplyContent('');
        setShowReplyForm(false);
        // Refresh thread to update stats
        const updatedThread = await getThreadBySlug(categorySlug, threadSlug);
        if (updatedThread) {
          setThread(updatedThread);
        }
      } else {
        setReplyError('Failed to post reply. Please try again.');
      }
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || !category || !thread) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-8 mb-6">
              <div className="h-8 bg-gray-700 rounded mb-4 w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded mb-2 w-1/2"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-start space-x-4 mb-4">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg border border-gray-600/50 flex-shrink-0"
              style={{ 
                backgroundColor: category.color,
                boxShadow: `0 0 10px ${category.color}40, inset 0 0 10px ${category.color}20`
              }}
            >
              {category.icon === 'chat' && '💬'}
              {category.icon === 'shield' && '🛡️'}
              {category.icon === 'users' && '👥'}
              {category.icon === 'trophy' && '🏆'}
              {category.icon === 'wrench' && '🔧'}
              {category.icon === 'megaphone' && '📢'}
              {!category.icon && '📁'}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow mb-2 break-words">
                {thread.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span>👁️ {thread.view_count} views</span>
                <span>💬 {thread.reply_count} replies</span>
                <span>📅 {formatDate(thread.created_at)}</span>
                {thread.is_pinned && (
                  <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded border border-yellow-500/30">
                    📌 Pinned
                  </span>
                )}
                {thread.is_locked && (
                  <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30">
                    🔒 Locked
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <Link href={`/forum/c/${category.slug}`} className="text-cyan-400 hover:text-cyan-300 transition-colors">
              {category.name}
            </Link>
            <span className="mx-2">→</span>
            <span className="truncate">{thread.title}</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {(error || replyError) && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error || replyError}
          </div>
        )}

        {/* Original Thread Post */}
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl mb-6">
          <div className="flex items-start space-x-4">
            <div className="flex flex-col items-center space-y-2">
              <UserAvatar user={thread.author || {}} size="xl" />
              <div className="bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded text-xs font-bold border border-cyan-500/30">
                OP
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-cyan-400 text-lg">{thread.author?.in_game_alias || 'Anonymous'}</h3>
                  <p className="text-sm text-gray-400">{formatDate(thread.created_at)}</p>
                </div>
              </div>
              <div className="prose prose-invert max-w-none">
                <div className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                  {thread.content}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Posts/Replies */}
        {posts.map((post, index) => (
          <div key={post.id} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl mb-4">
            <div className="flex items-start space-x-4">
              <div className="flex flex-col items-center space-y-2">
                <UserAvatar user={post.author || {}} size="lg" />
                <div className="bg-gray-600/20 text-gray-400 px-2 py-1 rounded text-xs font-bold border border-gray-600/30">
                  #{index + 1}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-gray-300">{post.author?.in_game_alias || 'Anonymous'}</h4>
                    <p className="text-sm text-gray-400">{formatDate(post.created_at)}</p>
                  </div>
                </div>
                <div className="prose prose-invert max-w-none">
                  <div className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                    {post.content}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Reply Form */}
        {user && !thread.is_locked && (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
            {showReplyForm ? (
              <form onSubmit={handleReplySubmit}>
                <div className="flex items-start space-x-4 mb-4">
                  <UserAvatar user={user} size="md" />
                  <div className="flex-1">
                    <label htmlFor="reply" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wider">
                      💬 Post Reply
                    </label>
                    <textarea
                      id="reply"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write your reply here..."
                      rows={8}
                      className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300 resize-vertical"
                      required
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplyForm(false);
                      setReplyContent('');
                      setReplyError(null);
                    }}
                    className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105"
                  >
                    ❌ Cancel
                  </button>
                  
                  <button
                    type="submit"
                    disabled={submittingReply || !replyContent.trim()}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
                  >
                    {submittingReply ? '🔄 Posting...' : '🚀 Post Reply'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center space-x-4">
                <UserAvatar user={user} size="md" />
                <button
                  onClick={() => setShowReplyForm(true)}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-4 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 text-center"
                >
                  💬 Reply to Thread
                </button>
              </div>
            )}
          </div>
        )}

        {/* Login prompt for non-authenticated users */}
        {!user && !authLoading && (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">🔐 Login Required</h3>
            <p className="text-gray-300 mb-6">You need to be logged in to reply to this thread.</p>
            <Link 
              href={`/auth/login?redirect=${encodeURIComponent(`/forum/c/${categorySlug}/${threadSlug}`)}`}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 inline-block"
            >
              🚀 Login to Reply
            </Link>
          </div>
        )}

        {/* Locked thread notice */}
        {thread.is_locked && (
          <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-red-400 mb-2">🔒 Thread Locked</h3>
            <p className="text-gray-300">This thread has been locked and no longer accepts new replies.</p>
          </div>
        )}
      </div>
    </div>
  );
} 