'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { ForumThread, ForumPost, ForumCategory } from '@/types/forum';
import UserMentionInput from '@/components/UserMentionInput';
import { supabase } from '@/lib/supabase';

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { 
    getCategoryBySlug, 
    getThreadBySlug, 
    getPosts, 
    createPost,
    updatePost,
    deletePost,
    incrementThreadViews,
    subscribeToThread,
    unsubscribeFromThread,
    isSubscribedToThread,
    loading, 
    error,
    deleteThread
  } = useForum();
  
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyingToPost, setReplyingToPost] = useState<ForumPost | null>(null);
  const [quotedContent, setQuotedContent] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [userPostCounts, setUserPostCounts] = useState<Record<string, number>>({});
  
  const categorySlug = params.slug as string;
  const threadSlug = params.threadSlug as string;

  // Function to get user post counts
  const getUserPostCounts = async (userIds: string[]) => {
    if (userIds.length === 0) return {};
    
    try {
      const { data, error } = await supabase
        .from('forum_posts')
        .select('author_id')
        .in('author_id', userIds)
        .eq('is_deleted', false);

      if (error) throw error;

      const counts: Record<string, number> = {};
      userIds.forEach(id => counts[id] = 0);
      
      data?.forEach(post => {
        if (post.author_id) {
          counts[post.author_id] = (counts[post.author_id] || 0) + 1;
        }
      });

      return counts;
    } catch (err) {
      console.error('Error fetching post counts:', err);
      return {};
    }
  };

  // Single consolidated useEffect for all data loading
  useEffect(() => {
    let isCancelled = false;

    const loadAllData = async () => {
      if (!categorySlug || !threadSlug) return;
      
      try {
        setPageLoading(true);
        
        // Load category first
        const categoryData = await getCategoryBySlug(categorySlug);
        if (isCancelled) return;
        
        if (!categoryData) {
          router.push('/forum');
          return;
        }
        setCategory(categoryData);

        // Load thread
        const threadData = await getThreadBySlug(categorySlug, threadSlug);
        if (isCancelled) return;
        
        if (!threadData) {
          router.push(`/forum/c/${categorySlug}`);
          return;
        }
        setThread(threadData);

        // Load posts
        const postsData = await getPosts({ thread_id: threadData.id });
        if (isCancelled) return;
        
        setPosts(postsData?.posts || []);

        // Get unique user IDs and fetch post counts
        const allUserIds = [threadData.author?.id, ...(postsData?.posts || []).map(p => p.author?.id)].filter(Boolean) as string[];
        const uniqueUserIds = [...new Set(allUserIds)];
        
        if (uniqueUserIds.length > 0) {
          const postCounts = await getUserPostCounts(uniqueUserIds);
          if (!isCancelled) {
            setUserPostCounts(postCounts);
          }
        }

        // Increment view count (only once)
        if (!initialLoadComplete) {
          await incrementThreadViews(threadData.id);
        }

        // Check subscription status if user is logged in
        if (user && !checkingSubscription) {
          setCheckingSubscription(true);
          try {
            const subscribed = await isSubscribedToThread(threadData.id);
            if (!isCancelled) {
              setIsSubscribed(subscribed);
            }
          } catch (err) {
            console.error('Error checking subscription:', err);
          } finally {
            if (!isCancelled) {
              setCheckingSubscription(false);
            }
          }
        }

        if (!isCancelled) {
          setInitialLoadComplete(true);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Error loading thread data:', err);
        }
      } finally {
        if (!isCancelled) {
          setPageLoading(false);
        }
      }
    };

    loadAllData();

    // Cleanup function to cancel pending operations
    return () => {
      isCancelled = true;
    };
  }, [categorySlug, threadSlug, user?.id]);

  // Show loading state to prevent flickering
  if (pageLoading || authLoading || !category || !thread) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-8 mb-6">
              <div className="h-8 bg-gray-700 rounded mb-4 w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded mb-2 w-1/2"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-8">
              <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
              <div className="h-20 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubscriptionToggle = async () => {
    if (!user || !thread) return;
    
    setUpdatingSubscription(true);
    try {
      if (isSubscribed) {
        const success = await unsubscribeFromThread(thread.id);
        if (success) {
          setIsSubscribed(false);
          toast.success('Unsubscribed from thread');
        } else {
          toast.error('Failed to unsubscribe');
        }
      } else {
        const success = await subscribeToThread(thread.id);
        if (success) {
          setIsSubscribed(true);
          toast.success('Subscribed to thread! You\'ll be notified of new replies.');
        } else {
          toast.error('Failed to subscribe');
        }
      }
    } catch (err) {
      toast.error('Failed to update subscription');
    } finally {
      setUpdatingSubscription(false);
    }
  };

  const handleReplyToPost = (post: ForumPost) => {
    const quotedText = `> **${post.author?.in_game_alias || 'Anonymous'}** wrote:\n> ${post.content.split('\n').join('\n> ')}\n\n`;
    setQuotedContent(quotedText);
    setReplyingToPost(post);
    setReplyContent(quotedText);
    setShowReplyForm(true);
    
    // Scroll to reply form
    setTimeout(() => {
      const replyForm = document.getElementById('reply-form');
      if (replyForm) {
        replyForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleReplyToThread = () => {
    setReplyingToPost(null);
    setQuotedContent('');
    setReplyContent('');
    setShowReplyForm(true);
    
    // Scroll to reply form
    setTimeout(() => {
      const replyForm = document.getElementById('reply-form');
      if (replyForm) {
        replyForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !replyContent.trim()) return;
    
    setSubmittingReply(true);
    setReplyError(null);
    
    try {
      const newPost = await createPost({
        thread_id: thread.id,
        content: replyContent.trim(),
        parent_post_id: replyingToPost?.id || undefined
      });
      
      if (newPost) {
        setPosts(prev => [...prev, newPost]);
        setReplyContent('');
        setQuotedContent('');
        setReplyingToPost(null);
        setShowReplyForm(false);
        // Refresh thread to update stats
        const updatedThread = await getThreadBySlug(categorySlug, threadSlug);
        if (updatedThread) {
          setThread(updatedThread);
        }
        toast.success('Reply posted successfully!');
      } else {
        setReplyError('Failed to post reply. Please try again.');
      }
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleEditPost = (post: ForumPost) => {
    setEditingPost(post);
    setEditContent(post.content);
  };

  const handleSaveEdit = async (postId: string) => {
    if (!editContent.trim()) return;
    
    try {
      const success = await updatePost(postId, { content: editContent.trim() });
      if (success) {
        // Update the post in state
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? { ...post, content: editContent.trim(), edited_at: new Date().toISOString() }
            : post
        ));
        setEditingPost(null);
        setEditContent('');
        toast.success('Post updated successfully!');
      } else {
        toast.error('Failed to update post');
      }
    } catch (err) {
      toast.error('Failed to update post');
    }
  };

  const handleDeletePost = async (postId: string) => {
    const postToDelete = posts.find(p => p.id === postId);
    if (!postToDelete) return;

    const confirmMessage = `Are you sure you want to delete this post by ${postToDelete.author?.in_game_alias || 'Anonymous'}?\n\nThis action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    console.log('Attempting to delete post:', { 
      postId, 
      userId: user?.id, 
      postAuthorId: postToDelete.author_id,
      isOwner: user?.id === postToDelete.author_id,
      userAdmin: (user as any)?.is_admin,
      userCtfAdmin: (user as any)?.ctf_admin 
    });

    setDeletingPostId(postId);
    try {
      const success = await deletePost(postId);
      if (success) {
        // Remove the post from state
        setPosts(prev => prev.filter(post => post.id !== postId));
        toast.success('Post deleted successfully!');
        
        // Update thread reply count
        if (thread) {
          setThread(prev => prev ? { ...prev, reply_count: Math.max(0, prev.reply_count - 1) } : null);
        }
      } else {
        console.error('Delete failed - function returned false');
        toast.error('Failed to delete post - insufficient permissions or server error');
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(`Failed to delete post: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleDeleteThread = async () => {
    if (!thread || !user) return;

    const confirmMessage = `Are you sure you want to delete the entire thread "${thread.title}"?\n\nThis will delete the thread and all its posts. This action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    setDeletingThread(true);
    try {
      const success = await deleteThread(thread.id);
      if (success) {
        toast.success('Thread deleted successfully!');
        // Redirect to category page
        router.push(`/forum/c/${categorySlug}`);
      } else {
        toast.error('Failed to delete thread - insufficient permissions or server error');
      }
    } catch (err) {
      console.error('Delete thread error:', err);
      toast.error(`Failed to delete thread: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingThread(false);
    }
  };

  const canEditPost = (post: ForumPost) => {
    if (!user) return false;
    const isOwner = user.id === post.author_id;
    const isAdmin = (user as any)?.is_admin === true;
    const isCtfAdmin = (user as any)?.ctf_admin === true;
    
    console.log('Edit permission check:', { 
      userId: user.id, 
      postAuthorId: post.author_id, 
      isOwner, 
      isAdmin, 
      isCtfAdmin 
    });
    
    return isOwner || isAdmin || isCtfAdmin;
  };

  const canDeletePost = (post: ForumPost) => {
    if (!user) return false;
    const isOwner = user.id === post.author_id;
    const isAdmin = (user as any)?.is_admin === true;
    const isCtfAdmin = (user as any)?.ctf_admin === true;
    
    return isOwner || isAdmin || isCtfAdmin;
  };

  const canDeleteThread = () => {
    if (!user || !thread) return false;
    const isOwner = user.id === thread.author_id;
    const isAdmin = (user as any)?.is_admin === true;
    const isCtfAdmin = (user as any)?.ctf_admin === true;
    
    return isOwner || isAdmin || isCtfAdmin;
  };

  const getUserSquadImage = (user: any) => {
    // This would come from the user's squad/team data
    // For now, returning a placeholder based on common squad names
    const squadName = user?.squad_name?.toLowerCase() || '';
    if (squadName.includes('titan')) return '/images/squads/titan.png';
    if (squadName.includes('collective')) return '/images/squads/collective.png';
    if (squadName.includes('marines')) return '/images/squads/marines.png';
    if (squadName.includes('rebels')) return '/images/squads/rebels.png';
    return null;
  };

  const renderSignature = (signature: string | null) => {
    if (!signature) return null;
    
    // Parse signature for images and text
    const imageRegex = /\[img\](.*?)\[\/img\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = imageRegex.exec(signature)) !== null) {
      // Add text before image
      if (match.index > lastIndex) {
        parts.push(signature.slice(lastIndex, match.index));
      }
      // Add image
      parts.push(`<img src="${match[1]}" alt="Signature" class="max-w-full h-auto max-h-16 inline-block" />`);
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < signature.length) {
      parts.push(signature.slice(lastIndex));
    }
    
    return parts.join('');
  };

  const getPostPermalink = (postIndex: number) => {
    return `${window.location.origin}${window.location.pathname}#post-${postIndex + 1}`;
  };

  const copyPostLink = (postIndex: number) => {
    const link = getPostPermalink(postIndex);
    navigator.clipboard.writeText(link);
    toast.success('Post link copied to clipboard!');
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
    return `${Math.floor(diffInSeconds / 31536000)}y ago`;
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

  const formatPostContent = (content: string) => {
    // Convert quoted text to styled quotes
    const lines = content.split('\n');
    const formattedLines = lines.map((line, index) => {
      if (line.startsWith('>')) {
        return `<div class="quote-block">${line.substring(1).trim()}</div>`;
      }
      return line || (index < lines.length - 1 ? '<br>' : '');
    });
    
    return formattedLines.join('\n');
  };

  // Group posts by their parent relationships
  const organizeThreadedPosts = (posts: ForumPost[]) => {
    const topLevelPosts = posts.filter(post => !post.parent_post_id);
    const repliesMap = posts.reduce((acc, post) => {
      if (post.parent_post_id) {
        if (!acc[post.parent_post_id]) acc[post.parent_post_id] = [];
        acc[post.parent_post_id].push(post);
      }
      return acc;
    }, {} as Record<string, ForumPost[]>);
    
    return { topLevelPosts, repliesMap };
  };

  const { topLevelPosts, repliesMap } = organizeThreadedPosts(posts);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start space-x-4 flex-1">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg border border-gray-600/50 flex-shrink-0"
                style={{ 
                  backgroundColor: category?.color || '#6366f1',
                  boxShadow: `0 0 10px ${category?.color || '#6366f1'}40, inset 0 0 10px ${category?.color || '#6366f1'}20`
                }}
              >
                {category?.icon === 'chat' && '💬'}
                {category?.icon === 'shield' && '🛡️'}
                {category?.icon === 'users' && '👥'}
                {category?.icon === 'trophy' && '🏆'}
                {category?.icon === 'wrench' && '🔧'}
                {category?.icon === 'megaphone' && '📢'}
                {!category?.icon && '📁'}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow mb-2 break-words">
                  {thread.title}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                  <span>👁️ {thread.view_count} views</span>
                  <span>💬 {thread.reply_count} replies</span>
                  <span 
                    title={formatDate(thread.created_at)}
                    className="cursor-help hover:text-gray-300 transition-colors"
                  >
                    📅 {getRelativeTime(thread.created_at)}
                  </span>
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

            {/* Subscription Button */}
            {user && (
              <div className="flex-shrink-0 ml-4">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleSubscriptionToggle}
                    disabled={updatingSubscription || checkingSubscription}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50 ${
                      isSubscribed
                        ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white'
                        : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white'
                    }`}
                  >
                    {updatingSubscription ? (
                      '🔄 Updating...'
                    ) : checkingSubscription ? (
                      '⏳ Checking...'
                    ) : isSubscribed ? (
                      '🔕 Unsubscribe'
                    ) : (
                      '🔔 Subscribe'
                    )}
                  </button>

                  {/* Delete Thread Button */}
                  {canDeleteThread() && (
                    <button
                      onClick={handleDeleteThread}
                      disabled={deletingThread}
                      className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
                    >
                      {deletingThread ? '🔄 Deleting...' : '🗑️ Delete Thread'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <Link href={`/forum/c/${category?.slug || ''}`} className="text-cyan-400 hover:text-cyan-300 transition-colors">
              {category?.name || 'Category'}
            </Link>
            <span className="mx-2">→</span>
            <span className="truncate">{thread?.title || 'Thread'}</span>
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
        <div id="post-0" className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl mb-6 scroll-mt-4 relative overflow-hidden">
          {/* Mobile Layout - Stack vertically */}
          <div className="block md:hidden">
            {/* Mobile Header with Avatar and User Info */}
            <div className="flex items-center space-x-4 p-4 bg-gradient-to-b from-gray-700/50 to-gray-800/50 border-b border-gray-600/30">
              <UserAvatar user={thread.author || {}} size="lg" className="ring-3 ring-cyan-500/30" />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-cyan-400 text-lg truncate">{thread.author?.in_game_alias || 'Anonymous'}</h3>
                <div className="bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded text-xs font-bold border border-cyan-500/30 inline-block">
                  🏆 THREAD STARTER
                </div>
              </div>
              <div className="text-xs text-gray-400 text-right">
                <div>Posts: {userPostCounts[thread.author?.id || ''] ?? 'Loading...'}</div>
                <div>Member: {formatDate(thread.created_at)}</div>
              </div>
            </div>
            {/* Mobile Content */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span 
                  title={formatDate(thread.created_at)}
                  className="cursor-help hover:text-gray-300 transition-colors text-sm text-gray-400"
                >
                  📅 {getRelativeTime(thread.created_at)}
                </span>
                {user && !thread.is_locked && (
                  <button
                    onClick={handleReplyToThread}
                    className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded text-sm font-medium transition-all"
                  >
                    💬 Reply
                  </button>
                )}
              </div>
              <div className="prose prose-invert max-w-none">
                <div 
                  className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatPostContent(thread.content) }}
                />
              </div>
            </div>
          </div>

          {/* Desktop Layout - Side by side */}
          <div className="hidden md:flex items-start space-x-6 p-6">
            {/* Left User Info Panel - Much Larger */}
            <div className="flex flex-col items-center space-y-3 min-w-[220px] bg-gradient-to-b from-gray-700/50 to-gray-800/50 rounded-lg p-6 border border-gray-600/30">
              <UserAvatar user={thread.author || {}} size="3xl" className="ring-4 ring-cyan-500/30" />
              <div className="text-center space-y-2">
                <h3 className="font-bold text-cyan-400 text-xl tracking-wide">{thread.author?.in_game_alias || 'Anonymous'}</h3>
                <div className="bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded-lg text-sm font-bold border border-cyan-500/30">
                  🏆 THREAD STARTER
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>Posts: {userPostCounts[thread.author?.id || ''] ?? 'Loading...'}</div>
                  <div>Member since: {formatDate(thread.created_at)}</div>
                </div>
              </div>
              
              {/* Signature Area */}
              {(thread.author as any)?.signature && (
                <div className="w-full border-t border-gray-600/50 pt-3 mt-3">
                  <div className="bg-gradient-to-b from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-lg p-3 text-xs">
                    <div 
                      className="text-gray-300 text-center"
                      dangerouslySetInnerHTML={{ __html: renderSignature((thread.author as any)?.signature) || '' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span 
                    title={formatDate(thread.created_at)}
                    className="cursor-help hover:text-gray-300 transition-colors text-sm text-gray-400"
                  >
                    📅 {getRelativeTime(thread.created_at)}
                  </span>
                  <button
                    onClick={() => copyPostLink(-1)}
                    className="hover:text-cyan-400 transition-colors text-sm"
                    title="Copy link to this post"
                  >
                    #OP 🔗
                  </button>
                </div>
                {user && !thread.is_locked && (
                  <button
                    onClick={handleReplyToThread}
                    className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105"
                  >
                    💬 Reply
                  </button>
                )}
              </div>
              
              <div className="prose prose-invert prose-lg max-w-none">
                <div 
                  className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatPostContent(thread.content) }}
                />
              </div>
            </div>

            {/* Squad Image - Right Side */}
            {getUserSquadImage(thread.author) && (
              <div className="flex-shrink-0">
                <div className="w-24 h-24 bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-600/30 rounded-lg p-2 flex items-center justify-center">
                  <img 
                    src={getUserSquadImage(thread.author) || ''}
                    alt="Squad"
                    className="w-full h-full object-contain opacity-60 hover:opacity-80 transition-opacity"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Posts/Replies with Threading */}
        {topLevelPosts.map((post, index) => (
          <div key={post.id}>
            {/* Main Post */}
            <div 
              id={`post-${index + 1}`} 
              className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg shadow-xl mb-4 scroll-mt-4 relative overflow-hidden"
            >
              {/* Mobile Layout - Stack vertically */}
              <div className="block md:hidden">
                {/* Mobile Header with Avatar and User Info */}
                <div className="flex items-center space-x-4 p-4 bg-gradient-to-b from-gray-700/30 to-gray-800/30 border-b border-gray-600/20">
                  <UserAvatar user={post.author || {}} size="md" className="ring-2 ring-gray-500/30" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-200 text-base truncate">{post.author?.in_game_alias || 'Anonymous'}</h4>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    <div>Posts: {userPostCounts[post.author?.id || ''] ?? 'Loading...'}</div>
                    <div>Member: {formatDate(post.created_at)}</div>
                  </div>
                </div>
                {/* Mobile Content */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span 
                        title={formatDate(post.created_at)}
                        className="cursor-help hover:text-gray-300 transition-colors text-sm text-gray-400"
                      >
                        {getRelativeTime(post.created_at)}
                      </span>
                      <button
                        onClick={() => copyPostLink(index)}
                        className="hover:text-cyan-400 transition-colors text-sm"
                        title="Copy link to this post"
                      >
                        #{index + 1} 🔗
                      </button>
                      {post.edited_at && (
                        <span className="text-xs text-yellow-400" title={`Edited: ${formatDate(post.edited_at)}`}>
                          ✏️ Edited
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {user && !thread.is_locked && (
                        <button
                          onClick={() => handleReplyToPost(post)}
                          className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 text-cyan-400 px-2 py-1 rounded text-xs font-medium transition-all"
                        >
                          💬
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="prose prose-invert max-w-none">
                    {editingPost?.id === post.id ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-32 bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300 resize-vertical"
                        placeholder="Edit your post..."
                      />
                    ) : (
                      <div 
                        className="text-gray-200 break-words leading-relaxed"
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                        dangerouslySetInnerHTML={{ __html: formatPostContent(post.content) }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop Layout - Side by side */}
              <div className="hidden md:flex items-start space-x-6 p-6">
                {/* Left User Info Panel */}
                <div className="flex flex-col items-center space-y-3 min-w-[200px] bg-gradient-to-b from-gray-700/30 to-gray-800/30 rounded-lg p-5 border border-gray-600/20">
                  <UserAvatar user={post.author || {}} size="2xl" className="ring-3 ring-gray-500/30" />
                  <div className="text-center space-y-2">
                    <h4 className="font-bold text-gray-200 text-lg">{post.author?.in_game_alias || 'Anonymous'}</h4>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div>Posts: {userPostCounts[post.author?.id || ''] ?? 'Loading...'}</div>
                      <div>Member: {formatDate(post.created_at)}</div>
                    </div>
                  </div>
                  
                  {/* Signature Area */}
                  {(post.author as any)?.signature && (
                    <div className="w-full border-t border-gray-600/50 pt-3 mt-3">
                      <div className="bg-gradient-to-b from-indigo-900/15 to-purple-900/15 border border-indigo-500/15 rounded-lg p-2 text-xs">
                        <div 
                          className="text-gray-400 text-center"
                          dangerouslySetInnerHTML={{ __html: renderSignature((post.author as any)?.signature) || '' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span 
                        title={formatDate(post.created_at)}
                        className="cursor-help hover:text-gray-300 transition-colors text-sm text-gray-400"
                      >
                        {getRelativeTime(post.created_at)}
                      </span>
                      <button
                        onClick={() => copyPostLink(index)}
                        className="hover:text-cyan-400 transition-colors text-sm"
                        title="Copy link to this post"
                      >
                        #{index + 1} 🔗
                      </button>
                      {post.edited_at && (
                        <span className="text-xs text-yellow-400" title={`Edited: ${formatDate(post.edited_at)}`}>
                          ✏️ Edited
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {user && !thread.is_locked && (
                        <button
                          onClick={() => handleReplyToPost(post)}
                          className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded text-sm font-medium transition-all duration-300 transform hover:scale-105"
                        >
                          💬 Reply
                        </button>
                      )}
                      
                      {/* Edit/Delete Buttons */}
                      {canEditPost(post) && (
                        <div className="flex items-center space-x-1">
                          {editingPost?.id === post.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(post.id)}
                                className="bg-green-600/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 px-2 py-1 rounded text-xs transition-all"
                              >
                                ✓ Save
                              </button>
                              <button
                                onClick={() => {setEditingPost(null); setEditContent('');}}
                                className="bg-gray-600/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-400 px-2 py-1 rounded text-xs transition-all"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleEditPost(post)}
                              className="bg-yellow-600/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-400 px-2 py-1 rounded text-xs transition-all"
                            >
                              ✏️ Edit
                            </button>
                          )}
                        </div>
                      )}
                      
                      {canDeletePost(post) && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          disabled={deletingPostId === post.id}
                          className="bg-red-600/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 px-2 py-1 rounded text-xs transition-all disabled:opacity-50"
                        >
                          {deletingPostId === post.id ? '🔄' : '🗑️'} Delete
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="prose prose-invert max-w-none">
                    {editingPost?.id === post.id ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-32 bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300 resize-vertical"
                        placeholder="Edit your post..."
                      />
                    ) : (
                      <div 
                        className="text-gray-200 break-words leading-relaxed"
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                        dangerouslySetInnerHTML={{ __html: formatPostContent(post.content) }}
                      />
                    )}
                  </div>
                </div>

                {/* Squad Image - Right Side */}
                {getUserSquadImage(post.author) && (
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-gradient-to-br from-gray-700/30 to-gray-800/30 border border-gray-600/20 rounded-lg p-2 flex items-center justify-center">
                      <img 
                        src={getUserSquadImage(post.author) || ''}
                        alt="Squad"
                        className="w-full h-full object-contain opacity-50 hover:opacity-70 transition-opacity"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nested Replies */}
            {repliesMap[post.id] && (
              <div className="ml-8 space-y-3 mb-4">
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <div className="w-6 h-px bg-cyan-500/30"></div>
                  <span>Replies to #{index + 1}</span>
                </div>
                {repliesMap[post.id].map((reply, replyIndex) => (
                  <div 
                    key={reply.id}
                    className="bg-gradient-to-b from-gray-700/50 to-gray-800/50 border border-cyan-500/20 rounded-lg shadow-lg ml-4 relative overflow-hidden"
                  >
                    {/* Thread connection line */}
                    <div className="absolute -left-2 top-0 bottom-0 w-px bg-cyan-500/30"></div>
                    <div className="absolute -left-4 top-6 w-3 h-px bg-cyan-500/30"></div>
                    
                    {/* Mobile Reply Layout */}
                    <div className="block md:hidden">
                      <div className="flex items-center space-x-3 p-3 bg-gradient-to-b from-gray-600/30 to-gray-700/30 border-b border-gray-500/20">
                        <UserAvatar user={reply.author || {}} size="sm" className="ring-1 ring-cyan-500/20" />
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-gray-200 text-sm truncate">{reply.author?.in_game_alias || 'Anonymous'}</h5>
                        </div>
                        <div className="text-xs text-gray-500">
                          Posts: {userPostCounts[reply.author?.id || ''] ?? 'Loading...'}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span 
                              title={formatDate(reply.created_at)}
                              className="cursor-help hover:text-gray-400 transition-colors"
                            >
                              {getRelativeTime(reply.created_at)}
                            </span>
                            <span>•</span>
                            <span>replying to #{index + 1}</span>
                          </div>
                        </div>
                        
                        <div className="prose prose-invert prose-sm max-w-none">
                          {editingPost?.id === reply.id ? (
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full h-24 bg-gradient-to-b from-gray-600 to-gray-700 border border-cyan-500/30 rounded px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all resize-vertical"
                              placeholder="Edit your reply..."
                            />
                          ) : (
                            <div 
                              className="text-gray-300 break-words leading-relaxed text-sm"
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              dangerouslySetInnerHTML={{ __html: formatPostContent(reply.content) }}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop Reply Layout */}
                    <div className="hidden md:flex items-start space-x-4 p-4">
                      {/* Left User Info Panel - Smaller for replies */}
                      <div className="flex flex-col items-center space-y-2 min-w-[140px] bg-gradient-to-b from-gray-600/30 to-gray-700/30 rounded-lg p-3 border border-gray-500/20">
                        <UserAvatar user={reply.author || {}} size="lg" className="ring-2 ring-cyan-500/20" />
                        <div className="text-center space-y-1">
                          <h5 className="font-medium text-gray-200 text-sm">{reply.author?.in_game_alias || 'Anonymous'}</h5>
                          <div className="text-xs text-gray-500 space-y-1">
                            <div>Posts: {userPostCounts[reply.author?.id || ''] ?? 'Loading...'}</div>
                          </div>
                        </div>
                        
                        {/* Signature Area for replies */}
                        {(reply.author as any)?.signature && (
                          <div className="w-full border-t border-gray-500/50 pt-2 mt-2">
                            <div className="bg-gradient-to-b from-indigo-900/10 to-purple-900/10 border border-indigo-500/10 rounded p-1 text-xs">
                              <div 
                                className="text-gray-400 text-center"
                                dangerouslySetInnerHTML={{ __html: renderSignature((reply.author as any)?.signature) || '' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Reply Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span 
                              title={formatDate(reply.created_at)}
                              className="cursor-help hover:text-gray-400 transition-colors"
                            >
                              {getRelativeTime(reply.created_at)}
                            </span>
                            <span>•</span>
                            <span>replying to #{index + 1}</span>
                            {reply.edited_at && (
                              <>
                                <span>•</span>
                                <span className="text-yellow-400" title={`Edited: ${formatDate(reply.edited_at)}`}>
                                  ✏️ Edited
                                </span>
                              </>
                            )}
                          </div>
                          
                          {/* Reply Edit/Delete Buttons */}
                          <div className="flex items-center space-x-1">
                            {canEditPost(reply) && (
                              <div className="flex items-center space-x-1">
                                {editingPost?.id === reply.id ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEdit(reply.id)}
                                      className="bg-green-600/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded text-xs transition-all"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => {setEditingPost(null); setEditContent('');}}
                                      className="bg-gray-600/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-400 px-1.5 py-0.5 rounded text-xs transition-all"
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleEditPost(reply)}
                                    className="bg-yellow-600/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-400 px-1.5 py-0.5 rounded text-xs transition-all"
                                  >
                                    ✏️
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {canDeletePost(reply) && (
                              <button
                                onClick={() => handleDeletePost(reply.id)}
                                disabled={deletingPostId === reply.id}
                                className="bg-red-600/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 px-1.5 py-0.5 rounded text-xs transition-all disabled:opacity-50"
                              >
                                {deletingPostId === reply.id ? '🔄' : '🗑️'}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <div className="prose prose-invert prose-sm max-w-none">
                          {editingPost?.id === reply.id ? (
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full h-24 bg-gradient-to-b from-gray-600 to-gray-700 border border-cyan-500/30 rounded px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all resize-vertical"
                              placeholder="Edit your reply..."
                            />
                          ) : (
                            <div 
                              className="text-gray-300 break-words leading-relaxed text-sm"
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              dangerouslySetInnerHTML={{ __html: formatPostContent(reply.content) }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Squad Image for replies - smaller */}
                      {getUserSquadImage(reply.author) && (
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-gradient-to-br from-gray-600/30 to-gray-700/30 border border-gray-500/20 rounded p-1.5 flex items-center justify-center">
                            <img 
                              src={getUserSquadImage(reply.author) || ''}
                              alt="Squad"
                              className="w-full h-full object-contain opacity-40 hover:opacity-60 transition-opacity"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Reply Form */}
        {user && !thread.is_locked && (
          <div id="reply-form" className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl scroll-mt-4">
            {showReplyForm ? (
              <form onSubmit={handleReplySubmit}>
                <div className="flex items-start space-x-4 mb-4">
                  <UserAvatar user={user} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <label htmlFor="reply" className="block text-lg font-bold text-cyan-400 tracking-wider">
                        {replyingToPost ? (
                          <>💬 Replying to #{posts.indexOf(replyingToPost) + 1} - {replyingToPost.author?.in_game_alias}</>
                        ) : (
                          <>💬 Post Reply</>
                        )}
                      </label>
                      {replyingToPost && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingToPost(null);
                            setQuotedContent('');
                            setReplyContent('');
                          }}
                          className="text-gray-400 hover:text-gray-300 text-sm"
                        >
                          ❌ Clear quote
                        </button>
                      )}
                    </div>
                    <UserMentionInput
                      id="reply"
                      value={replyContent}
                      onChange={(value) => setReplyContent(value)}
                      placeholder={replyingToPost ? "Write your reply..." : "Write your reply here... (type @ to mention users)"}
                      rows={8}
                      className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300 resize-vertical"
                      required
                    />
                    <div className="text-xs text-gray-500 mt-2">
                      💡 Tip: Use <code>&gt;</code> at the start of a line to create quotes, or type <code>@</code> to mention users
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplyForm(false);
                      setReplyContent('');
                      setQuotedContent('');
                      setReplyingToPost(null);
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
                    {submittingReply ? '🔄 Posting...' : replyingToPost ? '🚀 Post Reply' : '🚀 Post Reply'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center space-x-4">
                <UserAvatar user={user} size="md" />
                <button
                  onClick={handleReplyToThread}
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