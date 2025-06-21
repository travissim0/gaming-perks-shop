'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function SiteAdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalNews: 0,
    totalVideos: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // Check if user is site admin
    const checkSiteAdmin = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('site_admin, is_admin')
          .eq('id', user.id)
          .single();

        if (error || !data || (!data.site_admin && !data.is_admin)) {
          router.push('/dashboard');
          toast.error('Unauthorized: Site admin access required');
          return;
        }

        setIsSiteAdmin(true);
        fetchStats();
      }
    };

    checkSiteAdmin();
  }, [user, loading, router]);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);

      // Fetch user count
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch news count  
      const { count: newsCount } = await supabase
        .from('news_posts')
        .select('*', { count: 'exact', head: true });

      // Fetch videos count
      const { count: videoCount } = await supabase
        .from('featured_videos')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalUsers: userCount || 0,
        totalNews: newsCount || 0,
        totalVideos: videoCount || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Error loading dashboard stats');
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading || !isSiteAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-400 font-mono">
            {loading ? 'Loading...' : 'Checking permissions...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Site Administration</h1>
          <p className="text-gray-400">Manage users, news, and media content</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-lg p-6 border border-blue-700">
            <div className="flex items-center">
              <div className="text-blue-300 text-2xl mr-4">👥</div>
              <div>
                <p className="text-blue-200 text-sm font-medium">Total Users</p>
                <p className="text-white text-2xl font-bold">
                  {loadingStats ? '...' : stats.totalUsers.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-lg p-6 border border-green-700">
            <div className="flex items-center">
              <div className="text-green-300 text-2xl mr-4">📰</div>
              <div>
                <p className="text-green-200 text-sm font-medium">News Posts</p>
                <p className="text-white text-2xl font-bold">
                  {loadingStats ? '...' : stats.totalNews.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-900 to-purple-800 rounded-lg p-6 border border-purple-700">
            <div className="flex items-center">
              <div className="text-purple-300 text-2xl mr-4">🎬</div>
              <div>
                <p className="text-purple-200 text-sm font-medium">Featured Videos</p>
                <p className="text-white text-2xl font-bold">
                  {loadingStats ? '...' : stats.totalVideos.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Management Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Users Management */}
          <Link href="/admin/users" className="group">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 hover:border-blue-500 transition-all duration-200 group-hover:shadow-xl group-hover:shadow-blue-500/20">
              <div className="flex items-center mb-4">
                <div className="text-blue-400 text-3xl mr-4">👥</div>
                <h3 className="text-xl font-bold text-white">User Management</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Manage user accounts, roles, and permissions
              </p>
              <div className="flex items-center text-blue-400 group-hover:text-blue-300">
                <span className="text-sm font-medium">Manage Users</span>
                <span className="ml-2">→</span>
              </div>
            </div>
          </Link>

          {/* News Management */}
          <Link href="/admin/news" className="group">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 hover:border-green-500 transition-all duration-200 group-hover:shadow-xl group-hover:shadow-green-500/20">
              <div className="flex items-center mb-4">
                <div className="text-green-400 text-3xl mr-4">📰</div>
                <h3 className="text-xl font-bold text-white">News Management</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Create and manage news posts and announcements
              </p>
              <div className="flex items-center text-green-400 group-hover:text-green-300">
                <span className="text-sm font-medium">Manage News</span>
                <span className="ml-2">→</span>
              </div>
            </div>
          </Link>

          {/* Videos Management */}
          <Link href="/admin/videos" className="group">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-all duration-200 group-hover:shadow-xl group-hover:shadow-purple-500/20">
              <div className="flex items-center mb-4">
                <div className="text-purple-400 text-3xl mr-4">🎬</div>
                <h3 className="text-xl font-bold text-white">Media Management</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Manage featured videos and media content
              </p>
              <div className="flex items-center text-purple-400 group-hover:text-purple-300">
                <span className="text-sm font-medium">Manage Videos</span>
                <span className="ml-2">→</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/admin/users"
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-center transition-colors"
            >
              <div className="text-blue-400 text-xl mb-1">👤</div>
              <div className="text-sm font-medium">View All Users</div>
            </Link>
            
            <Link
              href="/admin/news"
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-center transition-colors"
            >
              <div className="text-green-400 text-xl mb-1">✏️</div>
              <div className="text-sm font-medium">Create News Post</div>
            </Link>
            
            <Link
              href="/admin/videos"
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-center transition-colors"
            >
              <div className="text-purple-400 text-xl mb-1">📹</div>
              <div className="text-sm font-medium">Add Video</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 