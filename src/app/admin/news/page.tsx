'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/RichTextEditor';
import ImagePicker from '@/components/ImagePicker';
import NewsPreviewModal from '@/components/admin/NewsPreviewModal';
import Navbar from '@/components/Navbar';
import { isHtmlContent, prepareNewsHtml } from '@/lib/newsHtml';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

type ContentMode = 'rich' | 'html';

/** Best-effort HTML for an editor document (used when switching a rich-text post to HTML mode). */
function docToHtml(content: string): string {
  try {
    const doc = JSON.parse(content);
    if (doc?.type === 'doc') return generateHTML(doc, [StarterKit, Underline]);
  } catch { /* not a document */ }
  return content;
}

interface NewsPost {
  id: string;
  title: string;
  subtitle: string;
  content: any;
  featured_image_url: string;
  author_name: string;
  author_id?: string | null;
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
  // How the body is written: the rich-text editor (TipTap document) or pasted HTML
  // (a designed announcement; a whole .html file works, its styles and body are kept).
  const [mode, setMode] = useState<ContentMode>('rich');
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    content: '',
    featured_image_url: '',
    featured: false,
    priority: 0,
    tags: '',
    status: 'published' as 'draft' | 'published' | 'archived',
    // Who the post is for: 'all' = everywhere (homepage + zones), 'ctf' = CTF pages only.
    audience: 'all' as 'all' | 'ctf',
    // Byline. Empty = the signed-in poster; otherwise another account's profile id (alias shown).
    author_id: '',
    author_alias: '',
  });
  const EMPTY_FORM = {
    title: '', subtitle: '', content: '', featured_image_url: '', featured: false, priority: 0, tags: '',
    status: 'published' as 'draft' | 'published' | 'archived', audience: 'all' as 'all' | 'ctf', author_id: '', author_alias: '',
  };

  // Author picker
  const [authorSearch, setAuthorSearch] = useState('');
  const [authorResults, setAuthorResults] = useState<{ id: string; in_game_alias: string }[]>([]);
  const searchAuthors = async (term: string) => {
    setAuthorSearch(term);
    if (term.trim().length < 2) { setAuthorResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, in_game_alias')
      .ilike('in_game_alias', `%${term.trim()}%`)
      .not('in_game_alias', 'is', null)
      .order('in_game_alias')
      .limit(8);
    setAuthorResults((data || []) as { id: string; in_game_alias: string }[]);
  };
  const pickAuthor = (p: { id: string; in_game_alias: string }) => {
    setFormData((prev) => ({ ...prev, author_id: p.id, author_alias: p.in_game_alias }));
    setAuthorSearch('');
    setAuthorResults([]);
  };

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
      // /news/[id] links here with ?edit=<id>
      const editId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('edit') : null;
      if (editId && !editingPost) {
        const target = (data || []).find((p: NewsPost) => p.id === editId);
        if (target) handleEdit(target);
      }
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
      // Content can be: a rich-text JSON string (editor output), an already-parsed
      // document object (loaded from an existing post), or plain text.
      let richContent: any;
      const raw: any = formData.content;
      if (mode === 'html') {
        // Pasted HTML is stored as a string; every renderer drops it in as-is.
        richContent = prepareNewsHtml(typeof raw === 'string' ? raw : '');
        if (!richContent) throw new Error('Paste the post HTML first');
      } else if (raw && typeof raw === 'object') {
        richContent = raw;
      } else {
        const text = typeof raw === 'string' ? raw : '';
        try {
          richContent = JSON.parse(text);
        } catch {
          richContent = {
            type: 'doc',
            content: text.split('\n\n').filter(Boolean).map((paragraph) => ({
              type: 'paragraph',
              content: [{ type: 'text', text: paragraph }],
            })),
          };
        }
      }

      const postData = {
        title: formData.title,
        subtitle: formData.subtitle,
        content: richContent,
        featured_image_url: formData.featured_image_url || null,
        // Byline: the server derives author_name from this profile's in-game alias (never a real name).
        // Blank = credit the signed-in poster.
        author_id: formData.author_id || user?.id,
        status: formData.status,
        featured: formData.featured,
        priority: formData.priority,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        published_at: formData.status === 'published' ? new Date().toISOString() : null,
        metadata: { ...(editingPost?.metadata || {}), audience: formData.audience },
      };

      // Saves go through the server (service role + permission check) so
      // row-level security can't block them, and real errors surface.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in again.');
      const res = await fetch('/api/admin/news', {
        method: editingPost ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(editingPost ? { id: editingPost.id, post: postData } : { post: postData }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      toast.success(editingPost ? 'Post updated' : 'Post created');

      // Reset form and refresh posts
      setFormData({ ...EMPTY_FORM });
      setMode('rich');
      setShowCreateForm(false);
      setEditingPost(null);
      fetchPosts();
    } catch (error: any) {
      console.error('Error saving post:', error);
      toast.error(error?.message ? `Failed to save post: ${error.message}` : 'Failed to save post');
    }
  };

  const handleEdit = (post: NewsPost) => {
    console.log('Editing post:', post);
    console.log('Post content:', post.content);
    
    setEditingPost(post);
    const html = isHtmlContent(post.content);
    setMode(html ? 'html' : 'rich');
    setFormData({
      title: post.title,
      subtitle: post.subtitle,
      // The editor works with the JSON string form; stored posts hold the parsed document.
      // Pasted-HTML posts are a plain string and open in HTML mode.
      content: typeof post.content === 'string' ? post.content : JSON.stringify(post.content ?? { type: 'doc', content: [] }),
      featured_image_url: post.featured_image_url || '',
      featured: post.featured,
      audience: post.metadata?.audience === 'ctf' ? 'ctf' : 'all',
      priority: post.priority,
      tags: post.tags.join(', '),
      status: post.status as 'draft' | 'published' | 'archived',
      // Keep the existing byline unless it's already the editor's own.
      author_id: post.author_id && post.author_id !== user?.id ? post.author_id : '',
      author_alias: post.author_id && post.author_id !== user?.id ? post.author_name : '',
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      await newsApi('DELETE', { id: postId });
      toast.success('Post deleted');
      fetchPosts();
    } catch (error: any) {
      console.error('Error deleting post:', error);
      toast.error(error?.message ? `Failed to delete post: ${error.message}` : 'Failed to delete post');
    }
  };

  /** Server-side news writes (service role + permission check); throws with the real error message. */
  const newsApi = async (method: 'POST' | 'PUT' | 'DELETE', body: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session expired. Sign in again.');
    const res = await fetch('/api/admin/news', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  };

  const handleStatusChange = async (postId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'published') {
        updateData.published_at = new Date().toISOString();
      }

      await newsApi('PUT', { id: postId, post: updateData });
      toast.success(`Post ${newStatus}`);
      fetchPosts();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(error?.message ? `Failed to update status: ${error.message}` : 'Failed to update status');
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
      <Navbar user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-yellow-400">📰 News Management</h1>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setEditingPost(null);
              setMode('rich');
              setFormData({ ...EMPTY_FORM });
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
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-medium">Content *</label>
                  <div className="flex items-center gap-1 rounded-lg bg-gray-700 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'rich') return;
                        if (!confirm('Switching to rich text keeps only basic formatting (headings, lists, bold). Designed blocks and styles are dropped. Continue?')) return;
                        setMode('rich');
                      }}
                      className={`rounded-md px-2.5 py-1 transition-colors ${mode === 'rich' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      Rich text
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'html') return;
                        setFormData((prev) => ({ ...prev, content: docToHtml(typeof prev.content === 'string' ? prev.content : '') }));
                        setMode('html');
                      }}
                      className={`rounded-md px-2.5 py-1 transition-colors ${mode === 'html' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}
                      title="Paste a designed post as HTML"
                    >
                      HTML
                    </button>
                  </div>
                </div>

                {mode === 'rich' ? (
                  <>
                    <RichTextEditor
                      content={formData.content}
                      onChange={(content) => setFormData(prev => ({ ...prev, content }))}
                      placeholder="Write your news post content here..."
                      className="w-full"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Use the toolbar above to format your content with headings, lists, quotes, and more. For a designed announcement (cards, tables, buttons), switch to HTML.
                    </p>
                  </>
                ) : (
                  <>
                    <textarea
                      value={typeof formData.content === 'string' ? formData.content : ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                      spellCheck={false}
                      placeholder={'Paste the post HTML here. A whole .html file works too: its <style> block and body content are kept, scripts are removed.'}
                      className="w-full min-h-[22rem] rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <label className="cursor-pointer rounded-md bg-gray-700 px-2.5 py-1.5 text-gray-200 hover:bg-gray-600">
                        Load .html file…
                        <input
                          type="file"
                          accept=".html,.htm,text/html"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const text = await f.text();
                            setFormData((prev) => ({ ...prev, content: prepareNewsHtml(text) }));
                            e.target.value = '';
                            toast.success(`Loaded ${f.name}`);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, content: prepareNewsHtml(typeof prev.content === 'string' ? prev.content : '') }))}
                        className="rounded-md bg-gray-700 px-2.5 py-1.5 text-gray-200 hover:bg-gray-600"
                        title="Strip page wrappers, scripts and inline handlers; point fonts at the site's faces"
                      >
                        Clean up
                      </button>
                      <span>Styles inside a &lt;style&gt; block are kept. Fonts named Barlow Condensed and Inter map to the site&apos;s. Scripts, forms and page-level CSS are dropped.</span>
                    </div>
                  </>
                )}
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
                  <label className="block text-sm font-medium mb-2">Audience</label>
                  <select
                    value={formData.audience}
                    onChange={(e) => setFormData(prev => ({ ...prev, audience: e.target.value as 'all' | 'ctf' }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    title="Everyone = homepage and every zone. CTF = only the CTF pages."
                  >
                    <option value="all">Everyone (homepage + CTF)</option>
                    <option value="ctf">CTF only</option>
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
                      className="h-4 w-4 accent-blue-500"
                      style={{ WebkitAppearance: 'checkbox', appearance: 'auto' }}
                    />
                    <span className="text-sm font-medium">Featured Post</span>
                  </label>
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium mb-2">Author</label>
                {formData.author_id ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-white">{formData.author_alias}</span>
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, author_id: '', author_alias: '' }))} className="text-sm text-gray-400 hover:text-white">Post as me instead</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={authorSearch}
                      onChange={(e) => searchAuthors(e.target.value)}
                      placeholder="You. Type an alias to credit someone else (e.g. a post pasted from Discord)"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    {authorResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 shadow-xl">
                        {authorResults.map((p) => (
                          <button key={p.id} type="button" onClick={() => pickAuthor(p)} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700">{p.in_game_alias}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <p className="text-xs text-gray-400 mt-1">The byline always shows an in-game alias, never a real name.</p>
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

              <div className="flex flex-wrap gap-4">
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  {editingPost ? 'Update Post' : 'Create Post'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="bg-cyan-700 hover:bg-cyan-600 px-6 py-2 rounded-lg font-medium transition-colors"
                  title="See the post as readers will, before saving"
                >
                  Preview
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

        {showPreview && (
          <NewsPreviewModal
            title={formData.title}
            subtitle={formData.subtitle}
            content={mode === 'html' ? prepareNewsHtml(typeof formData.content === 'string' ? formData.content : '') : formData.content}
            featuredImageUrl={formData.featured_image_url || undefined}
            author={formData.author_alias || editingPost?.author_name || 'You'}
            tags={formData.tags.split(',').map((t) => t.trim()).filter(Boolean)}
            audience={formData.audience}
            featured={formData.featured}
            onClose={() => setShowPreview(false)}
          />
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
                      {post.metadata?.audience === 'ctf' && (
                        <span className="ml-2 rounded bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300" title="Shown on CTF pages only">CTF</span>
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