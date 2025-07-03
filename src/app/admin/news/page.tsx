'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/RichTextEditor';
import ImagePicker from '@/components/ImagePicker';

interface NewsPost {
  id: string;
  title: string;
  subtitle: string;
  content: any;
  featured_image_url: string;
  author_name: string;
  status: string;
  featured: boolean;
  priority: number;
  view_count: number;
  created_at: string;
  published_at: string;
  tags: string[];
  metadata: any;
}

export default function AdminNewsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    content: '',
    featured_image_url: '',
    featured: false,
    priority: 0,
    tags: '',
    status: 'published' as 'draft' | 'published' | 'archived'
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    if (user) {
      checkAdminStatus();
      fetchPosts();
    }
  }, [user, loading]);

  const checkAdminStatus = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, is_media_manager, ctf_role')
        .eq('id', user?.id)
        .single();

      const hasPermission = profile?.is_admin || 
                           profile?.is_media_manager || 
                           profile?.ctf_role === 'ctf_admin';

      if (!hasPermission) {
        toast.error('Access denied: Content management privileges required');
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      router.push('/');
    }
  };

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('news_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast.error('Failed to fetch posts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Parse the rich text content if it's a JSON string, otherwise create simple structure
      let richContent;
      try {
        richContent = JSON.parse(formData.content);
      } catch {
        // If content is not valid JSON, convert plain text to rich content format
        richContent = {
          type: 'doc',
          content: formData.content.split('\n\n').map(paragraph => ({
            type: 'paragraph',
            content: [{ type: 'text', text: paragraph }]
          }))
        };
      }

      const postData = {
        title: formData.title,
        subtitle: formData.subtitle,
        content: richContent,
        featured_image_url: formData.featured_image_url || null,
        author_name: user?.user_metadata?.full_name || user?.email || 'Admin',
        author_id: user?.id,
        status: formData.status,
        featured: formData.featured,
        priority: formData.priority,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        published_at: formData.status === 'published' ? new Date().toISOString() : null
      };

      if (editingPost) {
        // Update existing post
        const { error } = await supabase
          .from('news_posts')
          .update(postData)
          .eq('id', editingPost.id);

        if (error) throw error;
        toast.success('Post updated successfully');
      } else {
        // Create new post
        const { error } = await supabase
          .from('news_posts')
          .insert([postData]);

        if (error) throw error;
        toast.success('Post created successfully');
      }

      // Reset form and refresh posts
      setFormData({
        title: '',
        subtitle: '',
        content: '',
        featured_image_url: '',
        featured: false,
        priority: 0,
        tags: '',
        status: 'published'
      });
      setShowCreateForm(false);
      setEditingPost(null);
      fetchPosts();
    } catch (error) {
      console.error('Error saving post:', error);
      toast.error('Failed to save post');
    }
  };

  const handleEdit = (post: NewsPost) => {
    console.log('Editing post:', post);
    console.log('Post content:', post.content);
    
    setEditingPost(post);
    setFormData({
      title: post.title,
      subtitle: post.subtitle,
      content: post.content,
      featured_image_url: post.featured_image_url || '',
      featured: post.featured,
      priority: post.priority,
      tags: post.tags.join(', '),
      status: post.status as 'draft' | 'published' | 'archived'
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const { error } = await supabase
        .from('news_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      toast.success('Post deleted successfully');
      fetchPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    }
  };

  const handleStatusChange = async (postId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'published') {
        updateData.published_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('news_posts')
        .update(updateData)
        .eq('id', postId);

      if (error) throw error;
      toast.success(`Post ${newStatus} successfully`);
      fetchPosts();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-yellow-400">📰 News Management</h1>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setEditingPost(null);
              setFormData({
                title: '',
                subtitle: '',
                content: '',
                featured_image_url: '',
                featured: false,
                priority: 0,
                tags: '',
                status: 'published'
              });
            }}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {showCreateForm ? 'Cancel' : '+ Create Post'}
          </button>
        </div>

        {/* Create/Edit Form */}
        {showCreateForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-bold mb-6 text-yellow-400">
              {editingPost ? 'Edit Post' : 'Create New Post'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Subtitle</label>
                  <input
                    type="text"
                    value={formData.subtitle}
                    onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <ImagePicker
                selectedImage={formData.featured_image_url}
                onImageSelect={(url) => setFormData(prev => ({ ...prev, featured_image_url: url }))}
                bucket="avatars"
                folder="news-banners"
                allowUpload={true}
              />

              <div>
                <label className="block text-sm font-medium mb-2">Content *</label>
                <RichTextEditor
                  content={formData.content}
                  onChange={(content) => setFormData(prev => ({ ...prev, content }))}
                  placeholder="Write your news post content here..."
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Use the toolbar above to format your content with headings, lists, quotes, and more.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Priority</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    min="0"
                    max="100"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center space-x-2 mt-6">
                    <input
                      type="checkbox"
                      checked={formData.featured}
                      onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
                      className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">Featured Post</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="announcement, update, event"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  {editingPost ? 'Update Post' : 'Create Post'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingPost(null);
                  }}
                  className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Posts List */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold">All Posts ({posts.length})</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Featured</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Views</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {posts.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-medium text-white">{post.title}</div>
                        {post.subtitle && (
                          <div className="text-sm text-gray-400">{post.subtitle}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={post.status}
                        onChange={(e) => handleStatusChange(post.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full bg-gray-700 border-0 ${
                          post.status === 'published' ? 'text-green-400' :
                          post.status === 'draft' ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      {post.featured ? (
                        <span className="text-purple-400">⭐ Yes</span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-400">
                      {post.view_count}
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-sm">
                      {new Date(post.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(post)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {posts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No posts found. Create your first post to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 