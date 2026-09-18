'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/RichTextEditor';
import ImagePicker from '@/components/ImagePicker';
import NewsPreviewModal from '@/components/admin/NewsPreviewModal';
import Link from 'next/link';
import { StaffShell, HeaderStrip, Panel, Chip, Spinner, Empty, th, td, pill } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';
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
      <StaffShell user={user} maxWidth="max-w-6xl">
        <Spinner label="Loading posts…" />
      </StaffShell>
    );
  }

  const published = posts.filter((p) => p.status === 'published').length;
  const drafts = posts.filter((p) => p.status === 'draft').length;
  const openNew = () => {
    setEditingPost(null);
    setMode('rich');
    setFormData({ ...EMPTY_FORM });
    setShowCreateForm(true);
  };
  const closeForm = () => {
    setShowCreateForm(false);
    setEditingPost(null);
  };
  const statusTone: Record<string, string> = {
    published: 'bg-[#34D399]/15 text-[#34D399]',
    draft: 'bg-[#F59E0B]/15 text-[#F59E0B]',
    archived: 'bg-white/5 text-[#8B98B0]',
  };

  return (
    <StaffShell user={user} maxWidth="max-w-6xl">
      <HeaderStrip
        title="News"
        meta={
          <>
            <span>{posts.length} post{posts.length === 1 ? '' : 's'}</span>
            <span>· {published} published</span>
            {drafts > 0 && <span>· {drafts} draft{drafts === 1 ? '' : 's'}</span>}
            <Link href="/news" className="text-[#22D3EE] hover:text-[#67E8F9]">View the news page →</Link>
          </>
        }
        actions={
          showCreateForm ? (
            <button type="button" onClick={closeForm} className={btnQuiet}>Close editor</button>
          ) : (
            <button type="button" onClick={openNew} className={btnPrimary}>+ New post</button>
          )
        }
      />

      {/* Create / edit */}
      {showCreateForm && (
        <Panel
          title={editingPost ? `Editing: ${editingPost.title}` : 'New post'}
          hint={editingPost ? `Created ${new Date(editingPost.created_at).toLocaleDateString()} · ${editingPost.view_count} views` : 'Write it in the editor, or paste a designed post as HTML.'}
          actions={<button type="button" onClick={() => setShowPreview(true)} className={btnQuiet} title="See the post as readers will, before saving">Preview</button>}
        >
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Title *</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Subtitle</label>
                <input type="text" value={formData.subtitle} onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))} className={inputCls} placeholder="One line under the title" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Banner image</label>
              <ImagePicker
                selectedImage={formData.featured_image_url}
                onImageSelect={(url) => setFormData((prev) => ({ ...prev, featured_image_url: url }))}
                bucket="avatars"
                folder="news-banners"
                allowUpload={true}
              />
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className={`${labelCls} mb-0`}>Content *</label>
                <div className="flex items-center gap-1">
                  <Chip
                    active={mode === 'rich'}
                    onClick={() => {
                      if (mode === 'rich') return;
                      if (!confirm('Switching to rich text keeps only basic formatting (headings, lists, bold). Designed blocks and styles are dropped. Continue?')) return;
                      setMode('rich');
                    }}
                  >
                    Rich text
                  </Chip>
                  <Chip
                    active={mode === 'html'}
                    title="Paste a designed post as HTML"
                    onClick={() => {
                      if (mode === 'html') return;
                      setFormData((prev) => ({ ...prev, content: docToHtml(typeof prev.content === 'string' ? prev.content : '') }));
                      setMode('html');
                    }}
                  >
                    HTML
                  </Chip>
                </div>
              </div>

              {mode === 'rich' ? (
                <>
                  <RichTextEditor
                    content={formData.content}
                    onChange={(content) => setFormData((prev) => ({ ...prev, content }))}
                    placeholder="Write your news post content here..."
                    className="w-full"
                  />
                  <p className="mt-1.5 text-xs text-[#8B98B0]">
                    Headings, lists, quotes and links from the toolbar. For a designed announcement (cards, tables, buttons), switch to HTML.
                  </p>
                </>
              ) : (
                <>
                  <textarea
                    value={typeof formData.content === 'string' ? formData.content : ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                    spellCheck={false}
                    placeholder={'Paste the post HTML here. A whole .html file works too: its <style> block and body content are kept, scripts are removed.'}
                    className={`${inputCls} min-h-[22rem] font-mono text-xs leading-relaxed`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#8B98B0]">
                    <label className={`${btnQuiet} cursor-pointer !py-1.5 !text-xs`}>
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
                      className={`${btnQuiet} !py-1.5 !text-xs`}
                      title="Strip page wrappers, scripts and inline handlers; point fonts at the site's faces"
                    >
                      Clean up
                    </button>
                    <span className="basis-full sm:basis-auto">Styles in a &lt;style&gt; block are kept. Barlow Condensed and Inter map to the site&apos;s fonts. Scripts, forms and page-level CSS are dropped.</span>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Status</label>
                <select value={formData.status} onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))} className={inputCls}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Audience</label>
                <select
                  value={formData.audience}
                  onChange={(e) => setFormData((prev) => ({ ...prev, audience: e.target.value as 'all' | 'ctf' }))}
                  className={inputCls}
                  title="Everyone = homepage and every zone. CTF = only the CTF pages."
                >
                  <option value="all">Everyone</option>
                  <option value="ctf">CTF pages only</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <input type="number" value={formData.priority} onChange={(e) => setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))} className={inputCls} min="0" max="100" />
              </div>
              <div>
                <label className={labelCls}>Featured</label>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, featured: !prev.featured }))}
                  className={`${pill(formData.featured, 'bg-[#F59E0B]/15 text-[#F59E0B]')} mt-1.5`}
                  title="Featured posts lead the news page and the league card"
                >
                  {formData.featured ? '★ Featured' : 'Not featured'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className={labelCls}>Author</label>
                {formData.author_id ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#1B2438] px-3 py-2 text-sm text-[#E6EDF7]">{formData.author_alias}</span>
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, author_id: '', author_alias: '' }))} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">Post as me instead</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={authorSearch}
                      onChange={(e) => searchAuthors(e.target.value)}
                      placeholder="You. Type an alias to credit someone else"
                      className={inputCls}
                    />
                    {authorResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-white/10 bg-[#1B2438] shadow-xl">
                        {authorResults.map((p) => (
                          <button key={p.id} type="button" onClick={() => pickAuthor(p)} className="block w-full px-3 py-2 text-left text-sm text-[#E6EDF7] hover:bg-white/5">{p.in_game_alias}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <p className="mt-1 text-[11px] text-[#8B98B0]">The byline always shows an in-game alias, never a real name.</p>
              </div>
              <div>
                <label className={labelCls}>Tags</label>
                <input type="text" value={formData.tags} onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))} className={inputCls} placeholder="Announcement, CTFDL, event" />
                <p className="mt-1 text-[11px] text-[#8B98B0]">Comma-separated. Readers can filter the news page by tag.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
              <button type="submit" className={btnPrimary}>{editingPost ? 'Save changes' : formData.status === 'published' ? 'Publish' : 'Create post'}</button>
              <button type="button" onClick={() => setShowPreview(true)} className={btnQuiet}>Preview</button>
              <button type="button" onClick={closeForm} className={btnQuiet}>Cancel</button>
              {editingPost && (
                <button type="button" onClick={() => handleDelete(editingPost.id)} className={`${btnDanger} ml-auto`}>Delete post</button>
              )}
            </div>
          </form>
        </Panel>
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

      {/* Posts */}
      <Panel title="All posts" hint="Change a post's status straight from the list.">
        {posts.length === 0 ? (
          <Empty>No posts yet. Create the first one above.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={th}>Post</th>
                  <th className={th}>Status</th>
                  <th className={th}>Flags</th>
                  <th className={`${th} text-right`}>Views</th>
                  <th className={th}>Created</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {posts.map((post) => (
                  <tr key={post.id} className={`hover:bg-white/[0.03] ${editingPost?.id === post.id ? 'bg-[#22D3EE]/5' : ''}`}>
                    <td className={td}>
                      <div className="text-[#E6EDF7]">{post.title}</div>
                      <div className="text-xs text-[#8B98B0]">
                        {post.subtitle ? <span>{post.subtitle}</span> : null}
                        {post.author_name && <span>{post.subtitle ? ' · ' : ''}by {post.author_name}</span>}
                      </div>
                    </td>
                    <td className={td}>
                      <select
                        value={post.status}
                        onChange={(e) => handleStatusChange(post.id, e.target.value)}
                        className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium focus:outline-none ${statusTone[post.status] || statusTone.archived}`}
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {post.featured && <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#F59E0B]">Featured</span>}
                        {post.metadata?.audience === 'ctf' && <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#22D3EE]" title="Shown on CTF pages only">CTF</span>}
                        {isHtmlContent(post.content) && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8B98B0]" title="Pasted HTML post">HTML</span>}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums text-[#8B98B0]`}>{post.view_count}</td>
                    <td className={`${td} text-[#8B98B0]`}>{new Date(post.created_at).toLocaleDateString()}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <Link href={`/news/${post.id}`} className="text-xs text-[#8B98B0] hover:text-[#22D3EE] mr-3">View</Link>
                      <button type="button" onClick={() => { handleEdit(post); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-xs text-[#22D3EE] hover:text-[#67E8F9] mr-3">Edit</button>
                      <button type="button" onClick={() => handleDelete(post.id)} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </StaffShell>
  );
}
