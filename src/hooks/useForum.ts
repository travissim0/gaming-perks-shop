import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type {
  ForumCategory,
  ForumThread,
  ForumPost,
  CreateThreadData,
  CreatePostData,
  UpdateThreadData,
  UpdatePostData,
  ThreadsQuery,
  PostsQuery,
  ForumStats,
  SearchQuery,
  ForumUserPreferences
} from '@/types/forum';

export function useForum() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories
  const getCategories = async (): Promise<ForumCategory[]> => {
    try {
      setLoading(true);
      
      // Get categories with thread counts
      const { data: categories, error: categoriesError } = await supabase
        .from('forum_categories')
        .select('*')
        .eq('is_active', true)
        .order('position');

      if (categoriesError) throw categoriesError;

      // Get thread counts for each category
      const categoriesWithCounts = await Promise.all(
        (categories || []).map(async (category) => {
          const { count, error: countError } = await supabase
            .from('forum_threads')
            .select('id', { count: 'exact' })
            .eq('category_id', category.id)
            .eq('is_deleted', false);

          if (countError) {
            console.warn(`Failed to count threads for category ${category.id}:`, countError);
          }

          return {
            ...category,
            thread_count: count || 0
          };
        })
      );

      return categoriesWithCounts;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBySlug = async (slug: string): Promise<ForumCategory | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_categories')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch category');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Threads
  const getThreads = async (query: ThreadsQuery = {}): Promise<{ threads: ForumThread[], total: number }> => {
    try {
      setLoading(true);
      const page = query.page || 1;
      const perPage = query.per_page || 20;
      const offset = (page - 1) * perPage;

      let queryBuilder = supabase
        .from('forum_threads')
        .select(`
          *,
          category:forum_categories(*),
          author:profiles!forum_threads_author_id_fkey(id, email, in_game_alias, avatar_url),
          last_reply_user:profiles!forum_threads_last_reply_user_id_fkey(id, email, in_game_alias, avatar_url)
        `, { count: 'exact' })
        .eq('is_deleted', false);

      if (query.category_id) {
        queryBuilder = queryBuilder.eq('category_id', query.category_id);
      }

      // Sorting
      switch (query.sort) {
        case 'oldest':
          queryBuilder = queryBuilder.order('created_at', { ascending: true });
          break;
        case 'most_replies':
          queryBuilder = queryBuilder.order('reply_count', { ascending: false });
          break;
        case 'most_views':
          queryBuilder = queryBuilder.order('view_count', { ascending: false });
          break;
        default: // 'latest'
          if (query.pinned_first) {
            queryBuilder = queryBuilder.order('is_pinned', { ascending: false });
          }
          queryBuilder = queryBuilder.order('last_reply_at', { ascending: false });
      }

      queryBuilder = queryBuilder.range(offset, offset + perPage - 1);

      const { data, error, count } = await queryBuilder;

      if (error) throw error;
      return { threads: data || [], total: count || 0 };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch threads');
      return { threads: [], total: 0 };
    } finally {
      setLoading(false);
    }
  };

  const getThreadBySlug = async (categorySlug: string, threadSlug: string): Promise<ForumThread | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_threads')
        .select(`
          *,
          category:forum_categories(*),
          author:profiles!forum_threads_author_id_fkey(id, email, in_game_alias, avatar_url)
        `)
        .eq('slug', threadSlug)
        .eq('is_deleted', false)
        .single();

      if (error) throw error;

      // Verify category matches
      if (data?.category?.slug !== categorySlug) {
        throw new Error('Thread not found in this category');
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch thread');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createThread = async (threadData: CreateThreadData): Promise<ForumThread | null> => {
    if (!user) {
      setError('You must be logged in to create a thread');
      return null;
    }

    try {
      setLoading(true);
      
      // Generate slug from title
      const slug = threadData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const { data, error } = await supabase
        .from('forum_threads')
        .insert({
          ...threadData,
          slug,
          author_id: user.id
        })
        .select(`
          *,
          category:forum_categories(*),
          author:profiles!forum_threads_author_id_fkey(id, email, in_game_alias, avatar_url)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateThread = async (threadId: string, updates: UpdateThreadData): Promise<boolean> => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_threads')
        .update(updates)
        .eq('id', threadId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update thread');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deleteThread = async (threadId: string): Promise<boolean> => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_threads')
        .update({ is_deleted: true })
        .eq('id', threadId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete thread');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Posts
  const getPosts = async (query: PostsQuery): Promise<{ posts: ForumPost[], total: number }> => {
    try {
      setLoading(true);
      const page = query.page || 1;
      const perPage = query.per_page || 20;
      const offset = (page - 1) * perPage;

      const { data, error, count } = await supabase
        .from('forum_posts')
        .select(`
          *,
          author:profiles!forum_posts_author_id_fkey(id, email, in_game_alias, avatar_url),
          edited_by_user:profiles!forum_posts_edited_by_fkey(id, email, in_game_alias, avatar_url)
        `, { count: 'exact' })
        .eq('thread_id', query.thread_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .range(offset, offset + perPage - 1);

      if (error) throw error;
      return { posts: data || [], total: count || 0 };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
      return { posts: [], total: 0 };
    } finally {
      setLoading(false);
    }
  };

  const createPost = async (postData: CreatePostData): Promise<ForumPost | null> => {
    if (!user) {
      setError('You must be logged in to create a post');
      return null;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_posts')
        .insert({
          ...postData,
          author_id: user.id
        })
        .select(`
          *,
          author:profiles!forum_posts_author_id_fkey(id, email, in_game_alias, avatar_url)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updatePost = async (postId: string, updates: UpdatePostData): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to update a post');
      return false;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_posts')
        .update({
          ...updates,
          edited_at: new Date().toISOString(),
          edited_by: user.id
        })
        .eq('id', postId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (postId: string): Promise<boolean> => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_deleted: true })
        .eq('id', postId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Thread views
  const incrementThreadViews = async (threadId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .rpc('increment_thread_views', {
          thread_uuid: threadId,
          user_uuid: user?.id || null,
          user_ip: null // You can get this from request headers if needed
        });

      if (error) throw error;
    } catch (err) {
      // Silent fail for view tracking
      console.warn('Failed to increment thread views:', err);
    }
  };

  // Subscriptions
  const subscribeToThread = async (threadId: string): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to subscribe');
      return false;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_subscriptions')
        .insert({
          user_id: user.id,
          thread_id: threadId
        });

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeFromThread = async (threadId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('thread_id', threadId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const isSubscribedToThread = async (threadId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase
        .from('forum_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('thread_id', threadId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (err) {
      return false;
    }
  };

  // User preferences
  const getUserPreferences = async (): Promise<ForumUserPreferences | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('forum_user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (err) {
      return null;
    }
  };

  const updateUserPreferences = async (preferences: Partial<ForumUserPreferences>): Promise<boolean> => {
    if (!user) return false;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('forum_user_preferences')
        .upsert({
          user_id: user.id,
          ...preferences
        });

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Search
  const searchForum = async (query: SearchQuery): Promise<{ threads: ForumThread[], posts: ForumPost[], total: number }> => {
    try {
      setLoading(true);
      const searchTerm = `%${query.query}%`;

      let threadsResult: { data: ForumThread[], count: number } = { data: [], count: 0 };
      let postsResult: { data: ForumPost[], count: number } = { data: [], count: 0 };

      if (query.type === 'threads' || query.type === 'both' || !query.type) {
        const { data, error, count } = await supabase
          .from('forum_threads')
          .select(`
            *,
            category:forum_categories(*),
            author:profiles!forum_threads_author_id_fkey(id, email, in_game_alias, avatar_url)
          `, { count: 'exact' })
          .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
          .eq('is_deleted', false)
          .order('last_reply_at', { ascending: false });
        
        if (error) throw error;
        threadsResult = { data: data || [], count: count || 0 };
      }

      if (query.type === 'posts' || query.type === 'both' || !query.type) {
        const { data, error, count } = await supabase
          .from('forum_posts')
          .select(`
            *,
            author:profiles!forum_posts_author_id_fkey(id, email, in_game_alias, avatar_url)
          `, { count: 'exact' })
          .ilike('content', searchTerm)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        postsResult = { data: data || [], count: count || 0 };
      }

      return {
        threads: threadsResult.data || [],
        posts: postsResult.data || [],
        total: (threadsResult.count || 0) + (postsResult.count || 0)
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search forum');
      return { threads: [], posts: [], total: 0 };
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const getForumStats = async (): Promise<ForumStats | null> => {
    try {
      const [threadsResult, postsResult, usersResult] = await Promise.all([
        supabase
          .from('forum_threads')
          .select('id', { count: 'exact' })
          .eq('is_deleted', false),
        supabase
          .from('forum_posts')
          .select('id', { count: 'exact' })
          .eq('is_deleted', false),
        supabase
          .from('profiles')
          .select('id', { count: 'exact' })
      ]);

      const recentThreads = await supabase
        .from('forum_threads')
        .select('id', { count: 'exact' })
        .eq('is_deleted', false)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const recentPosts = await supabase
        .from('forum_posts')
        .select('id', { count: 'exact' })
        .eq('is_deleted', false)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      return {
        total_threads: threadsResult.count || 0,
        total_posts: postsResult.count || 0,
        total_users: usersResult.count || 0,
        recent_activity: {
          threads: recentThreads.count || 0,
          posts: recentPosts.count || 0
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      return null;
    }
  };

  return {
    loading,
    error,
    setError,
    // Categories
    getCategories,
    getCategoryBySlug,
    // Threads
    getThreads,
    getThreadBySlug,
    createThread,
    updateThread,
    deleteThread,
    incrementThreadViews,
    // Posts
    getPosts,
    createPost,
    updatePost,
    deletePost,
    // Subscriptions
    subscribeToThread,
    unsubscribeFromThread,
    isSubscribedToThread,
    // Preferences
    getUserPreferences,
    updateUserPreferences,
    // Search
    searchForum,
    // Stats
    getForumStats
  };
} 