export interface ForumCategory {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  color: string;
  icon: string | null;
  position: number;
  is_active: boolean;
  requires_role: string | null;
  created_at: string;
  updated_at: string;
  thread_count?: number;
  latest_thread?: ForumThread;
}

export interface ForumThread {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  author_id: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  view_count: number;
  reply_count: number;
  last_reply_at: string;
  last_reply_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  category?: ForumCategory;
  author?: {
    id: string;
    email: string | null;
    in_game_alias: string | null;
  };
  last_reply_user?: {
    id: string;
    email: string | null;
    in_game_alias: string | null;
  };
}

export interface ForumPost {
  id: string;
  thread_id: string;
  content: string;
  author_id: string;
  parent_post_id: string | null;
  is_deleted: boolean;
  edited_at: string | null;
  edited_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  author?: {
    id: string;
    email: string | null;
    in_game_alias: string | null;
  };
  edited_by_user?: {
    id: string;
    email: string | null;
    in_game_alias: string | null;
  };
  replies?: ForumPost[];
}

export interface ForumUserPreferences {
  id: string;
  user_id: string;
  email_notifications: boolean;
  signature: string | null;
  posts_per_page: number;
  created_at: string;
  updated_at: string;
}

export interface ForumModerationLog {
  id: string;
  moderator_id: string;
  action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete' | 'edit' | 'move';
  target_type: 'thread' | 'post' | 'category';
  target_id: string;
  reason: string | null;
  details: Record<string, any> | null;
  created_at: string;
  // Joined data
  moderator?: {
    id: string;
    email: string | null;
    in_game_alias: string | null;
  };
}

export interface ForumSubscription {
  id: string;
  user_id: string;
  thread_id: string;
  created_at: string;
}

export interface CreateThreadData {
  category_id: string;
  title: string;
  content: string;
}

export interface CreatePostData {
  thread_id: string;
  content: string;
  parent_post_id?: string;
}

export interface UpdateThreadData {
  title?: string;
  content?: string;
  is_pinned?: boolean;
  is_locked?: boolean;
}

export interface UpdatePostData {
  content: string;
}

export interface ForumStats {
  total_threads: number;
  total_posts: number;
  total_users: number;
  recent_activity: {
    threads: number;
    posts: number;
  };
}

export interface ThreadsQuery {
  category_id?: string;
  page?: number;
  per_page?: number;
  sort?: 'latest' | 'oldest' | 'most_replies' | 'most_views';
  pinned_first?: boolean;
}

export interface PostsQuery {
  thread_id: string;
  page?: number;
  per_page?: number;
}

export interface SearchQuery {
  query: string;
  category_id?: string;
  type?: 'threads' | 'posts' | 'both';
  page?: number;
  per_page?: number;
}

export interface Profile {
  id: string;
  email: string | null;
  in_game_alias: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
} 