'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, Play, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import type { MatchReportWithDetails, MatchPlayerRating, MatchReportComment } from '@/types/database';
import { getRatingColor, getStarDisplay } from '@/utils/ratingUtils';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/** One match report: highlights, the write-up, each rated player with their clip, and comments. */

type Report = MatchReportWithDetails & { league_slug?: string | null; squad_a_id?: string | null; squad_b_id?: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** iframe src from an embed snippet or a YouTube URL. */
function embedSrc(input?: string | null): string | null {
  if (!input) return null;
  const iframe = input.match(/<iframe[^>]*src="([^"]*)"/i);
  if (iframe) return iframe[1];
  const m = input.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
  if (m && m[1].length === 11) return `https://www.youtube.com/embed/${m[1]}?controls=1&modestbranding=1&rel=0`;
  return null;
}

function TeamMark({ name, banner, size = 'md' }: { name: string; banner?: string | null; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-14 h-14 text-base' : 'w-8 h-8 text-[11px]';
  if (banner) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={banner} alt="" className={`${cls} rounded-lg object-cover shrink-0`} />;
  }
  return <span className={`${cls} rounded-lg bg-[#1B2438] text-[#22D3EE] font-medium flex items-center justify-center shrink-0`}>{name.slice(0, 4).toUpperCase()}</span>;
}

function Card({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#E6EDF7]">{title}</h2>
        {action}
      </div>
      <div className="px-4 sm:px-5 pb-4">{children}</div>
    </section>
  );
}

export default function MatchReportPage() {
  const params = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [players, setPlayers] = useState<MatchPlayerRating[]>([]);
  const [comments, setComments] = useState<MatchReportComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [clip, setClip] = useState<{ src: string; title: string } | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const [r, c] = await Promise.all([fetch(`/api/match-reports/${params.id}`), fetch(`/api/match-reports/${params.id}/comments`)]);
        const rj = await r.json();
        if (!r.ok) throw new Error(rj.error || 'Could not load this report');
        setReport(rj.report);
        setPlayers((rj.playerRatings || []).sort((a: MatchPlayerRating, b: MatchPlayerRating) => a.display_order - b.display_order));
        if (c.ok) setComments((await c.json()).comments || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  useEffect(() => {
    if (!user) { setCanEdit(false); return; }
    supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle().then(({ data: p }) => {
      const role = (p as any)?.ctf_role || '';
      setCanEdit(!!p && ((p as any).is_admin === true || role === 'ctf_admin' || role.includes('analyst')));
    });
  }, [user]);

  useEffect(() => {
    if (!clip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setClip(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clip]);

  const postComment = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/match-reports/${params.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const j = await res.json();
      if (res.ok) { setComments((c) => [...c, j.comment]); setDraft(''); }
    } finally {
      setPosting(false);
    }
  };
  const deleteComment = async (id: string) => {
    if (!confirm('Delete your comment?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/match-reports/${params.id}/comments?commentId=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setComments((c) => c.filter((x) => x.id !== id));
  };

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-4">
        <Link href="/league/match-reports" className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE]"><ChevronLeft className="w-3.5 h-3.5" /> Match reports</Link>
        {children}
      </main>
    </div>
  );

  if (loading) return shell(<section className="rounded-xl bg-[#131A2B] px-6 py-8 animate-pulse space-y-3"><div className="h-3 w-40 rounded bg-white/5" /><div className="h-12 w-2/3 rounded bg-white/5" /><div className="h-40 rounded bg-white/5" /></section>);
  if (error || !report) return shell(<section className="rounded-xl bg-[#131A2B] px-6 py-8"><h1 className="font-display text-4xl text-[#E6EDF7]">Report not found</h1><p className="text-sm text-[#8B98B0] mt-2">{error || 'It may have been removed.'}</p></section>);

  const highlights = embedSrc(report.match_highlights_video_url);

  return shell(
    <>
      {/* Header strip */}
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-[11px] mb-1">
              <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] uppercase tracking-wide font-medium">Match report</span>
              {report.league_slug && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[#8B98B0] uppercase tracking-wide">{report.league_slug}</span>}
              {report.season_name && <span className="text-[#8B98B0]">{report.season_name}</span>}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">{report.title}</h1>
            <div className="mt-2 text-sm text-[#8B98B0]">
              {fmt(report.match_date)} · by <span className="text-[#E6EDF7]">{report.creator_alias}</span> · written {formatRelativeTime(report.created_at, { addSuffix: true })}
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 lg:justify-end">
              <Link href={`/league/match-reports/${report.id}/add-player`} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Add player</Link>
              <Link href={`/league/match-reports/${report.id}/edit`} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Edit report</Link>
            </div>
          )}
        </div>
      </section>

      {/* Face-off + summary */}
      <section className="rounded-xl bg-[#131A2B] px-5 sm:px-6 py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center gap-3 flex-row-reverse text-right min-w-0">
            <TeamMark name={report.squad_a_name} banner={report.squad_a_banner_url} size="lg" />
            {report.squad_a_id ? <Link href={`/squads/${report.squad_a_id}`} className="font-display text-2xl leading-tight text-[#E6EDF7] hover:text-[#22D3EE] truncate">{report.squad_a_name}</Link> : <span className="font-display text-2xl leading-tight text-[#E6EDF7] truncate">{report.squad_a_name}</span>}
          </div>
          <span className="font-display text-3xl text-white/20">VS</span>
          <div className="flex items-center gap-3 min-w-0">
            <TeamMark name={report.squad_b_name} banner={report.squad_b_banner_url} size="lg" />
            {report.squad_b_id ? <Link href={`/squads/${report.squad_b_id}`} className="font-display text-2xl leading-tight text-[#E6EDF7] hover:text-[#22D3EE] truncate">{report.squad_b_name}</Link> : <span className="font-display text-2xl leading-tight text-[#E6EDF7] truncate">{report.squad_b_name}</span>}
          </div>
        </div>
        {report.match_summary && <div className="rules-prose mt-4 whitespace-pre-line">{report.match_summary}</div>}
      </section>

      {highlights && (
        <Card title="Highlights">
          <div className="aspect-video rounded-lg overflow-hidden bg-black">
            <iframe src={highlights} className="w-full h-full" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Match highlights" />
          </div>
        </Card>
      )}

      {players.length > 0 && (
        <Card title="Players" action={<span className="text-xs text-[#8B98B0]">Rating before → after · out of 6</span>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {players.map((p) => {
              const src = embedSrc(p.highlight_clip_url);
              const up = p.rating_adjustment > 0;
              const down = p.rating_adjustment < 0;
              return (
                <article key={p.id} className="rounded-lg bg-[#1B2438] overflow-hidden flex flex-col">
                  {src ? (
                    <button type="button" onClick={() => setClip({ src, title: `${p.player_alias} · ${p.class_position}` })} className="relative aspect-video bg-black group">
                      <iframe src={src} className="w-full h-full pointer-events-none" title={`${p.player_alias} clip`} loading="lazy" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
                        <span className="w-10 h-10 rounded-full bg-[#22D3EE] text-[#0B0F1A] flex items-center justify-center"><Play className="w-4 h-4 ml-0.5" /></span>
                      </span>
                    </button>
                  ) : p.highlight_clip_url ? (
                    <a href={p.highlight_clip_url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-xs text-[#22D3EE] hover:text-[#67E8F9] inline-flex items-center gap-1">Watch clip <ExternalLink className="w-3 h-3" /></a>
                  ) : null}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/stats/player/${encodeURIComponent(p.player_alias)}`} className="font-display text-xl leading-tight text-[#E6EDF7] hover:text-[#22D3EE]">{p.player_alias}</Link>
                        <div className="text-xs text-[#8B98B0]">{p.class_position}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 justify-end text-sm tabular-nums">
                          <span className="text-[#8B98B0]">{p.rating_before.toFixed(1)}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${up ? 'bg-[#34D399]/15 text-[#34D399]' : down ? 'bg-[#F87171]/15 text-[#F87171]' : 'bg-white/5 text-[#8B98B0]'}`}>{up ? '+' : ''}{p.rating_adjustment.toFixed(1)}</span>
                          <span className={`font-medium ${getRatingColor(p.rating_after)}`}>{p.rating_after.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-end mt-0.5">{getStarDisplay(p.rating_after)}</div>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-[#8B98B0]">
                      <span><span className="text-[#34D399] tabular-nums">{p.kills}</span> kills</span>
                      <span><span className="text-[#F87171] tabular-nums">{p.deaths}</span> deaths</span>
                      {p.turret_damage != null && p.turret_damage > 0 && <span><span className="text-[#E6EDF7] tabular-nums">{p.turret_damage}</span> turret</span>}
                    </div>
                    {p.performance_description && <p className="text-sm text-[#E6EDF7]/90 leading-snug whitespace-pre-line">{p.performance_description}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={<>Comments <span className="text-sm font-body text-[#8B98B0]">· {comments.length}</span></>}>
        {user ? (
          <div className="mb-3">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={3} placeholder="Write a comment…" className="w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none resize-none" />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[11px] text-[#8B98B0]">{draft.length}/2000</span>
              <button type="button" onClick={postComment} disabled={!draft.trim() || posting} className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50">{posting ? 'Posting…' : 'Post'}</button>
            </div>
          </div>
        ) : (
          <p className="mb-3 text-sm text-[#8B98B0]"><Link href="/auth/login" className="text-[#22D3EE]">Sign in</Link> to comment.</p>
        )}
        {comments.length === 0 ? (
          <p className="text-sm text-[#8B98B0]">No comments yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {comments.map((c) => (
              <li key={c.id} className="py-2.5 flex gap-3">
                {c.author_avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.author_avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[#1B2438] text-[#8B98B0] text-xs font-medium flex items-center justify-center shrink-0">{(c.author_alias || 'A').slice(0, 1).toUpperCase()}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs"><span className="text-[#E6EDF7] font-medium">{c.author_alias || 'Anonymous'}</span> <span className="text-[#8B98B0]">· {formatRelativeTime(c.created_at, { addSuffix: true })}</span></div>
                  <p className="text-sm text-[#E6EDF7]/90 whitespace-pre-wrap break-words mt-0.5">{c.content}</p>
                </div>
                {user?.id === c.user_id && <button type="button" onClick={() => deleteComment(c.id)} className="text-[#8B98B0] hover:text-[#F87171] shrink-0" aria-label="Delete comment"><X className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {clip && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setClip(null); }}>
          <div className="w-full max-w-5xl">
            <div className="flex items-center justify-between mb-2 text-sm text-[#E6EDF7]"><span>{clip.title}</span><button type="button" onClick={() => setClip(null)} className="text-[#8B98B0] hover:text-[#E6EDF7]">Close</button></div>
            <div className="aspect-video rounded-xl overflow-hidden bg-black"><iframe src={`${clip.src}&autoplay=1`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={clip.title} /></div>
          </div>
        </div>
      )}
    </>,
  );
}
