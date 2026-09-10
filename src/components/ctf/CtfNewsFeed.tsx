'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { renderNewsContent, newsPlainText } from '@/lib/newsContent';

interface Post {
  id: string;
  title: string;
  subtitle: string | null;
  content: any;
  author_name: string | null;
  featured: boolean;
  published_at: string;
  created_at: string;
  is_read?: boolean;
  metadata?: any;
}

const CLAMP_PX = 260;

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * League news: the newest (or featured) post opened but clamped, the rest as
 * headlines. Click a headline to swap it in. Posts come from /api/news with
 * audience=ctf, so "Everyone" and "CTF only" posts both appear.
 */
export default function CtfNewsFeed({ limit = 4 }: { limit?: number }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/news?limit=${limit}&audience=ctf`, {
          headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {},
        });
        if (!res.ok) throw new Error(`news ${res.status}`);
        const json = await res.json();
        const list: Post[] = json.posts || [];
        if (cancelled) return;
        setPosts(list);
        setOpenId((list.find((p) => p.featured) || list[0])?.id ?? null);
      } catch (e) {
        console.error('CtfNewsFeed: failed to load', e);
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  const open = posts.find((p) => p.id === openId) || null;
  const others = posts.filter((p) => p.id !== openId);

  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      <div className="px-4 py-3 flex items-center justify-between">
        <h3 className="font-display text-xl text-[#E6EDF7]">News</h3>
        <Link href="/news" className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
          All news <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="px-4 pb-4 space-y-2 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-white/5" />
          <div className="h-3 w-1/3 rounded bg-white/5" />
          <div className="h-24 rounded bg-white/5" />
        </div>
      ) : posts.length === 0 ? (
        <div className="px-4 pb-5 text-sm text-[#8B98B0]">No league news yet.</div>
      ) : (
        <div className="px-4 pb-4 space-y-3">
          {open && (
            <article className="rounded-lg bg-[#1B2438] p-4">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#8B98B0] mb-1.5">
                {open.featured && (
                  <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] font-medium uppercase tracking-wide">Featured</span>
                )}
                {open.metadata?.audience === 'ctf' && (
                  <span className="px-1.5 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] font-medium uppercase tracking-wide">CTF</span>
                )}
                <span>{relDate(open.published_at || open.created_at)}</span>
                {open.author_name && <span>· {open.author_name}</span>}
              </div>
              <h4 className="font-display text-2xl leading-tight text-[#E6EDF7]">{open.title}</h4>
              {open.subtitle && <p className="text-sm text-[#8B98B0] mt-0.5">{open.subtitle}</p>}
              <div className="relative mt-3">
                <div
                  className="rules-prose text-sm overflow-hidden transition-[max-height] duration-300"
                  style={{ maxHeight: full ? 'none' : CLAMP_PX }}
                >
                  {renderNewsContent(open.content)}
                </div>
                {!full && (
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#1B2438] to-transparent pointer-events-none" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setFull((v) => !v)}
                className="mt-2 text-xs font-medium text-[#22D3EE] hover:text-[#67E8F9]"
              >
                {full ? 'Show less' : 'Read the full post'}
              </button>
            </article>
          )}

          {others.length > 0 && (
            <ul className="divide-y divide-white/[0.06]">
              {others.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { setOpenId(p.id); setFull(false); }}
                    className="w-full text-left flex items-start gap-3 py-2.5 group"
                  >
                    <span className="w-14 shrink-0 text-[11px] text-[#8B98B0] pt-0.5 tabular-nums">
                      {relDate(p.published_at || p.created_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[#E6EDF7] group-hover:text-[#22D3EE] transition-colors truncate">
                        {p.title}
                      </span>
                      <span className="block text-xs text-[#8B98B0] truncate">
                        {p.subtitle || newsPlainText(p.content, 110)}
                      </span>
                    </span>
                    {!p.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#22D3EE] shrink-0" title="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
