'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { displayFont, bodyFont } from '@/lib/fonts';
import { renderNewsContent, newsProseClass } from '@/lib/newsContent';

/**
 * "What will this look like?" for the news editor: the post rendered the way
 * freeinf.org/news and the /league news card show it (CTF theme). The body
 * HTML is identical on the homepage and /news/[id]; only the frame around it
 * differs there.
 */
export default function NewsPreviewModal({
  title, subtitle, content, featuredImageUrl, author, tags, audience, featured, onClose,
}: {
  title: string;
  subtitle: string;
  content: any;
  featuredImageUrl?: string;
  author: string;
  tags: string[];
  audience: 'all' | 'ctf';
  featured: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Post preview">
      <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} mx-auto my-4 sm:my-8 w-[min(100%-1.5rem,64rem)] rounded-xl overflow-hidden shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[#0B0F1A]/95 px-4 py-2.5 backdrop-blur">
          <div className="min-w-0 text-xs text-[#8B98B0]">
            <span className="font-display text-base text-[#E6EDF7]">Preview</span>
            <span className="ml-2">as shown on freeinf.org/news and the league page{audience === 'all' ? ' · also on the homepage' : ''}</span>
          </div>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-[#E6EDF7] hover:bg-white/10">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Close
          </button>
        </div>

        <div className="px-3 py-4 sm:px-6 sm:py-6">
          <article className="rounded-xl overflow-hidden bg-[#131A2B]">
            {featuredImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={featuredImageUrl} alt="" className="w-full max-h-72 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                {featured && <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 font-medium uppercase tracking-wide text-[#F59E0B]">Featured</span>}
                {audience === 'ctf' && <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 font-medium uppercase tracking-wide text-[#22D3EE]">CTF</span>}
                <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 font-medium uppercase tracking-wide text-[#34D399]">New</span>
              </div>
              <h2 className="font-display text-3xl leading-tight text-[#E6EDF7]">{title || <span className="text-[#8B98B0]">Untitled post</span>}</h2>
              {subtitle && <p className="mt-1 text-sm text-[#8B98B0]">{subtitle}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#8B98B0]">
                <span>{today}</span>
                {author && <span>· {author}</span>}
                {tags.map((t) => <span key={t} className="rounded bg-white/5 px-1.5 py-0.5">{t}</span>)}
              </div>
              <div className={`${newsProseClass(content)} mt-3 text-sm`}>
                {content ? renderNewsContent(content) : <p className="text-[#8B98B0]">Nothing written yet.</p>}
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
