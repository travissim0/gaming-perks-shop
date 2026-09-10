'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { renderNewsContent, newsPlainText } from '@/lib/newsContent';
import { displayFont, bodyFont } from '@/lib/fonts';

interface NewsPost {
  id: string;
  title: string;
  subtitle: string | null;
  content: any;
  featured_image_url: string | null;
  author_name: string | null;
  author_alias?: string | null;
  featured: boolean;
  view_count: number;
  created_at: string;
  published_at: string;
  tags: string[] | null;
  metadata: any;
  reaction_counts: Record<string, number> | null;
  is_read: boolean;
}

const PAGE = 20;
const NEW_DAYS = 30;
const REACTION: Record<string, string> = { like: '👍', heart: '❤️', fire: '🔥', shock: '😲', love: '❤️', laugh: '😂', wow: '😮' };

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};
const isNew = (p: NewsPost) => !p.is_read && Date.now() - new Date(p.published_at || p.created_at).getTime() < NEW_DAYS * 86_400_000;
const audienceOf = (p: NewsPost): 'all' | 'ctf' => (p.metadata?.audience === 'ctf' ? 'ctf' : 'all');

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}
    >
      {children}
    </button>
  );
}

function Meta({ p }: { p: NewsPost }) {
  const author = p.author_alias || p.author_name;
  const reactions = Object.entries(p.reaction_counts || {}).filter(([, n]) => n > 0);
  return (
    <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[11px] text-[#8B98B0]">
      <span>{when(p.published_at || p.created_at)}</span>
      {author && <span>· {author}</span>}
      {(p.tags || []).map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-white/5">{t}</span>)}
      {reactions.length > 0 && (
        <span className="ml-auto flex gap-2">
          {reactions.map(([k, n]) => <span key={k}>{REACTION[k] || '👍'} {n}</span>)}
        </span>
      )}
    </div>
  );
}

export default function NewsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [audience, setAudience] = useState<'all' | 'ctf'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (offset: number) => {
    offset === 0 ? setLoading(true) : setMore(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/news?limit=${PAGE}&offset=${offset}`, {
        headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error(`news ${res.status}`);
      const json = await res.json();
      const list: NewsPost[] = json.posts || [];
      setPosts((prev) => (offset === 0 ? list : [...prev, ...list.filter((p) => !prev.some((q) => q.id === p.id))]));
      setTotal(json.total || 0);
    } catch (e) {
      console.error('news: load failed', e);
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, []);

  useEffect(() => { load(0); }, [load, user]);

  const markRead = async (id: string) => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'mark_read', postId: id, readingTime: 30 }),
      });
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, is_read: true } : p)));
    } catch { /* ignore */ }
  };

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else { next.add(id); markRead(id); }
      return next;
    });
  };

  const tags = useMemo(() => Array.from(new Set(posts.flatMap((p) => p.tags || []))).sort(), [posts]);
  const filtered = posts.filter((p) => (audience === 'all' || audienceOf(p) === 'ctf') && (!tag || (p.tags || []).includes(tag)));
  const lead = !tag && audience === 'all' ? filtered.find((p) => p.featured) || null : null;
  const rest = filtered.filter((p) => p.id !== lead?.id);
  const unread = posts.filter(isNew).length;

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">News</h1>
              <div className="mt-2 text-sm text-[#8B98B0]">
                {loading ? 'Loading…' : `${total} post${total === 1 ? '' : 's'}`}
                {unread > 0 && <span className="text-[#22D3EE]"> · {unread} new</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 lg:justify-end">
              <Chip active={audience === 'all' && !tag} onClick={() => { setAudience('all'); setTag(null); }}>Everything</Chip>
              <Chip active={audience === 'ctf' && !tag} onClick={() => { setAudience('ctf'); setTag(null); }}>CTF only</Chip>
              {tags.length > 0 && <span className="w-px bg-white/10 mx-1 self-stretch" />}
              {tags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Chip>
              ))}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-5 animate-pulse space-y-3">
            <div className="h-6 w-2/3 rounded bg-white/5" />
            <div className="h-3 w-1/3 rounded bg-white/5" />
            <div className="h-24 rounded bg-white/5" />
          </section>
        ) : filtered.length === 0 ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-6 text-sm text-[#8B98B0]">
            {tag ? `No posts tagged “${tag}”.` : audience === 'ctf' ? 'No CTF-only posts yet.' : 'No posts yet.'}
          </section>
        ) : (
          <>
            {/* Lead */}
            {lead && (
              <article className="rounded-xl overflow-hidden bg-[#131A2B]">
                <div className="flex flex-col md:flex-row">
                  {lead.featured_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lead.featured_image_url} alt="" className="md:w-72 h-44 md:h-auto object-cover shrink-0" />
                  )}
                  <div className="p-5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-[11px] mb-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] font-medium uppercase tracking-wide">Featured</span>
                      {audienceOf(lead) === 'ctf' && <span className="px-1.5 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] font-medium uppercase tracking-wide">CTF</span>}
                      {isNew(lead) && <span className="px-1.5 py-0.5 rounded bg-[#34D399]/15 text-[#34D399] font-medium uppercase tracking-wide">New</span>}
                    </div>
                    <h2 className="font-display text-3xl leading-tight text-[#E6EDF7]">{lead.title}</h2>
                    {lead.subtitle && <p className="text-sm text-[#8B98B0] mt-1">{lead.subtitle}</p>}
                    <div className="mt-3">
                      <Meta p={lead} />
                    </div>
                    <div className="relative mt-3">
                      <div className="rules-prose text-sm overflow-hidden" style={{ maxHeight: openIds.has(lead.id) ? 'none' : 180 }}>
                        {renderNewsContent(lead.content)}
                      </div>
                      {!openIds.has(lead.id) && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#131A2B] to-transparent pointer-events-none" />}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <button type="button" onClick={() => toggle(lead.id)} className="font-medium text-[#22D3EE] hover:text-[#67E8F9]">
                        {openIds.has(lead.id) ? 'Show less' : 'Read the full post'}
                      </button>
                      <Link href={`/news/${lead.id}`} className="inline-flex items-center gap-1 text-[#8B98B0] hover:text-[#22D3EE]">
                        Open post <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* List */}
            {rest.length > 0 && (
              <section className="rounded-xl overflow-hidden bg-[#131A2B]">
                <ul className="divide-y divide-white/[0.06]">
                  {rest.map((p) => {
                    const open = openIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => toggle(p.id)} className="w-full text-left px-4 py-3 flex items-start gap-3 group">
                          <span className="w-16 shrink-0 text-[11px] text-[#8B98B0] pt-1 tabular-nums">{when(p.published_at || p.created_at)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className={`text-base ${open ? 'text-[#22D3EE]' : 'text-[#E6EDF7] group-hover:text-[#22D3EE]'} transition-colors`}>{p.title}</span>
                              {p.featured && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] uppercase tracking-wide">Featured</span>}
                              {audienceOf(p) === 'ctf' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] uppercase tracking-wide">CTF</span>}
                              {isNew(p) && <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" title="New" />}
                            </span>
                            {!open && (
                              <span className="block text-xs text-[#8B98B0] truncate mt-0.5">{p.subtitle || newsPlainText(p.content, 140)}</span>
                            )}
                            <span className="block mt-1"><Meta p={p} /></span>
                          </span>
                          <ChevronRight className={`w-4 h-4 mt-1.5 shrink-0 text-[#8B98B0] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                        </button>
                        {open && (
                          <div className="px-4 pb-4 pl-[5.25rem]">
                            {p.featured_image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.featured_image_url} alt="" className="rounded-lg max-h-72 object-cover mb-3" />
                            )}
                            <div className="rules-prose text-sm">{renderNewsContent(p.content)}</div>
                            <Link href={`/news/${p.id}`} className="inline-flex items-center gap-1 mt-2 text-xs text-[#8B98B0] hover:text-[#22D3EE]">
                              Open post to react <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {posts.length < total && !tag && audience === 'all' && (
              <div className="flex justify-center">
                <button type="button" onClick={() => load(posts.length)} disabled={more} className="px-4 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50 transition-colors">
                  {more ? 'Loading…' : `Show older posts (${total - posts.length} more)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
