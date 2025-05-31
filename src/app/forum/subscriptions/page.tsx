'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import type { ForumThread } from '@/types/forum';

interface SubscribedThread extends ForumThread {
  subscription_date: string;
}

export default function ForumSubscriptionsPage() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscribedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchSubscriptions();
    }
  }, [user]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_subscriptions')
        .select(`
          created_at,
          forum_threads!inner(
            id,
            title,
            slug,
            view_count,
            reply_count,
            last_reply_at,
            created_at,
            forum_categories!inner(name, slug),
            profiles!forum_threads_author_id_fkey(id, in_game_alias, avatar_url)
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = data?.map((sub: any) => ({
        ...sub.forum_threads,
        subscription_date: sub.created_at,
        category: sub.forum_threads.forum_categories,
        author: sub.forum_threads.profiles
      })) || [];

      setSubscriptions(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (threadId: string) => {
    try {
      const { error } = await supabase
        .from('forum_subscriptions')
        .delete()
        .eq('user_id', user?.id)
        .eq('thread_id', threadId);

      if (error) throw error;

      // Remove from local state
      setSubscriptions(prev => prev.filter(sub => sub.id !== threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
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

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-8 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">🔐 Login Required</h3>
            <p className="text-gray-300 mb-6">You need to be logged in to view your subscriptions.</p>
            <Link 
              href="/auth/login?redirect=/forum/subscriptions"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 inline-block"
            >
              🚀 Login
            </Link>
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
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-xl font-bold shadow-lg border border-purple-500/50">
              ⚙️
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                My Subscriptions
              </h1>
              <p className="text-gray-400 text-sm mt-1">Manage your thread notifications</p>
            </div>
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <span>My Subscriptions</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="w-12 h-12 bg-gray-700 rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : subscriptions.length > 0 ? (
          <div className="space-y-4">
            <div className="text-center text-gray-400 text-sm mb-6">
              You're subscribed to {subscriptions.length} thread{subscriptions.length !== 1 ? 's' : ''}
            </div>

            {subscriptions.map((thread) => (
              <div key={thread.id} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                <div className="flex items-start space-x-4">
                  <UserAvatar user={thread.author || {}} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <Link
                          href={`/forum/c/${thread.category?.slug}/${thread.slug}`}
                          className="text-cyan-400 font-bold text-lg hover:text-cyan-300 transition-colors block mb-2"
                        >
                          {thread.title}
                        </Link>
                        <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
                          <span>by {thread.author?.in_game_alias || 'Anonymous'}</span>
                          <span>in {thread.category?.name}</span>
                          <span>👁️ {thread.view_count}</span>
                          <span>💬 {thread.reply_count}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          <span>Last activity: {formatDate(thread.last_reply_at)}</span>
                          <span className="mx-2">•</span>
                          <span>Subscribed: {formatDate(thread.subscription_date)}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => unsubscribe(thread.id)}
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg transform hover:scale-105"
                      >
                        🔕 Unsubscribe
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl text-center">
            <div className="text-gray-500 text-6xl mb-4">📭</div>
            <div className="text-gray-500 text-lg mb-2">No Subscriptions</div>
            <div className="text-gray-600 text-sm mb-6">
              You haven't subscribed to any threads yet. Subscribe to threads to get notified of new replies.
            </div>
            <Link 
              href="/forum"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 inline-block"
            >
              🚀 Browse Forum
            </Link>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-6 shadow-xl">
          <h3 className="text-lg font-bold text-blue-400 mb-4 tracking-wider">
            💡 About Subscriptions
          </h3>
          <div className="space-y-2 text-gray-300 text-sm">
            <div>• Get notified when someone replies to subscribed threads</div>
            <div>• Subscribe by clicking the bell icon in any thread</div>
            <div>• Unsubscribe anytime from this page or within the thread</div>
            <div>• Manage email preferences in your forum settings</div>
          </div>
        </div>
      </div>
    </div>
  );
} 