'use client';

import { useState, useEffect } from 'react';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import type { ForumCategory, ForumStats } from '@/types/forum';

const ForumIcon = ({ icon, color }: { icon: string | null, color: string }) => {
  const iconMap: Record<string, string> = {
    chat: '💬',
    shield: '🛡️',
    users: '👥',
    trophy: '🏆',
    wrench: '🔧',
    megaphone: '📢'
  };

  return (
    <div 
      className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold shadow-lg border border-gray-600/50"
      style={{ 
        backgroundColor: color,
        boxShadow: `0 0 15px ${color}40, inset 0 0 15px ${color}20`
      }}
    >
      {icon && iconMap[icon] ? iconMap[icon] : '📁'}
    </div>
  );
};

const CategoryCard = ({ category }: { category: ForumCategory }) => {
  return (
    <Link 
      href={`/forum/c/${category.slug}`}
      className="block bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg hover:border-cyan-400/50 hover:shadow-cyan-500/20 hover:shadow-lg transition-all duration-300 group"
    >
      <div className="p-6">
        <div className="flex items-start space-x-4">
          <ForumIcon icon={category.icon} color={category.color} />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-cyan-400 mb-2 tracking-wider group-hover:text-shadow-glow">
              {category.name}
            </h3>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              {category.description}
            </p>
            <div className="flex items-center text-sm text-gray-400 space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-400">📝</span>
                <span>{category.thread_count || 0} threads</span>
              </div>
              {category.latest_thread && (
                <div className="flex items-center space-x-2">
                  <span className="text-green-400">🕒</span>
                  <span>
                    Latest: {new Date(category.latest_thread.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const StatsCard = ({ stats }: { stats: ForumStats }) => {
  return (
    <div className="bg-gradient-to-r from-cyan-600 to-purple-600 rounded-lg p-6 text-white border border-cyan-500/30 shadow-2xl">
      <h3 className="text-xl font-bold mb-6 tracking-wider text-shadow-glow">🎖️ Community Stats</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">{stats.total_threads.toLocaleString()}</div>
          <div className="text-cyan-100 text-sm font-medium">Total Threads</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">{stats.total_posts.toLocaleString()}</div>
          <div className="text-cyan-100 text-sm font-medium">Total Posts</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">{stats.total_users.toLocaleString()}</div>
          <div className="text-cyan-100 text-sm font-medium">Members</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">
            {(stats.recent_activity.threads + stats.recent_activity.posts).toLocaleString()}
          </div>
          <div className="text-cyan-100 text-sm font-medium">This Week</div>
        </div>
      </div>
    </div>
  );
};

export default function ForumIndexPage() {
  const { user, loading: authLoading } = useAuth();
  const { getCategories, getForumStats, loading, error } = useForum();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [stats, setStats] = useState<ForumStats | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [categoriesData, statsData] = await Promise.all([
        getCategories(),
        getForumStats()
      ]);
      
      setCategories(categoriesData);
      setStats(statsData);
    };

    loadData();
  }, []);

  if (authLoading || (loading && categories.length === 0)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-6">
                  <div className="flex space-x-4">
                    <div className="w-16 h-16 bg-gray-700 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-700 rounded mb-3"></div>
                      <div className="h-4 bg-gray-700 rounded mb-3"></div>
                      <div className="h-4 bg-gray-700 rounded w-32"></div>
                    </div>
                  </div>
                </div>
              ))}
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
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-cyan-400 mb-3 tracking-wider text-shadow-glow">
                💬 Community Forum
              </h1>
              <p className="text-xl text-gray-300 leading-relaxed">
                Connect with fellow players, share strategies, and stay updated
              </p>
            </div>
            {user && (
              <Link
                href="/forum/new"
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 hover:shadow-cyan-500/25"
              >
                📝 New Thread
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Categories */}
          <div className="lg:col-span-3">
            <h2 className="text-2xl font-bold text-cyan-400 mb-8 tracking-wider">📂 Categories</h2>
            
            {categories.length === 0 ? (
              <div className="text-center py-16 bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl">
                <div className="text-6xl text-gray-500 mb-6">📡</div>
                <div className="text-xl text-cyan-400 font-bold mb-3 tracking-wider">No Categories Found</div>
                <p className="text-gray-300 max-w-md mx-auto leading-relaxed">
                  Forum categories will appear here once they're created by administrators.
                </p>
                <div className="mt-6 text-yellow-400 font-bold">
                  🔄 Check Back Soon
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.map((category) => (
                  <CategoryCard key={category.id} category={category} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats */}
            {stats && <StatsCard stats={stats} />}

            {/* Quick Actions */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-cyan-400 mb-6 tracking-wider">⚡ Quick Actions</h3>
              <div className="space-y-4">
                <Link
                  href="/forum/search"
                  className="flex items-center space-x-3 text-cyan-400 hover:text-cyan-300 transition-colors duration-300 p-2 rounded hover:bg-gray-700/50"
                >
                  <span className="text-xl">🔍</span>
                  <span className="font-medium">Search Forums</span>
                </Link>
                {user && (
                  <>
                    <Link
                      href="/forum/subscriptions"
                      className="flex items-center space-x-3 text-cyan-400 hover:text-cyan-300 transition-colors duration-300 p-2 rounded hover:bg-gray-700/50"
                    >
                      <span className="text-xl">🔔</span>
                      <span className="font-medium">My Subscriptions</span>
                    </Link>
                    <Link
                      href="/forum/preferences"
                      className="flex items-center space-x-3 text-cyan-400 hover:text-cyan-300 transition-colors duration-300 p-2 rounded hover:bg-gray-700/50"
                    >
                      <span className="text-xl">⚙️</span>
                      <span className="font-medium">Forum Preferences</span>
                    </Link>
                  </>
                )}
                <Link
                  href="/forum/rules"
                  className="flex items-center space-x-3 text-cyan-400 hover:text-cyan-300 transition-colors duration-300 p-2 rounded hover:bg-gray-700/50"
                >
                  <span className="text-xl">📋</span>
                  <span className="font-medium">Forum Rules</span>
                </Link>
              </div>
            </div>

            {/* Recent Activity */}
            {stats && (
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-cyan-400 mb-6 tracking-wider">📊 This Week</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 flex items-center space-x-2">
                      <span className="text-green-400">📝</span>
                      <span>New threads</span>
                    </span>
                    <span className="font-bold text-yellow-400 text-lg">{stats.recent_activity.threads}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 flex items-center space-x-2">
                      <span className="text-blue-400">💬</span>
                      <span>New posts</span>
                    </span>
                    <span className="font-bold text-yellow-400 text-lg">{stats.recent_activity.posts}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 