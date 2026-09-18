import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isHtmlContent, prepareNewsHtml } from '@/lib/newsHtml';

/**
 * News post management via service role.
 *
 * The admin news page used to write news_posts directly from the browser,
 * which made saves subject to row-level security (and hid the real error
 * behind "Failed to save post"). This route checks the caller's rights the
 * same way the page does — site admin, media manager, or CTF admin — and
 * then writes with the service role.
 *
 * POST   { post }            → create
 * PUT    { id, post }        → update
 * DELETE { id }              → delete
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function gate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin, is_media_manager, ctf_role, in_game_alias').eq('id', user.id).maybeSingle();
  const ok = !!profile && (profile.is_admin === true || profile.is_media_manager === true || profile.ctf_role === 'ctf_admin');
  if (!ok) return { error: NextResponse.json({ error: 'Content management privileges required' }, { status: 403 }) };
  // Posts are bylined with the in-game alias only — never the account's real name or email.
  return { user, alias: (profile!.in_game_alias as string | null)?.trim() || 'Staff' };
}

// author_name is always derived server-side from a profile's in-game alias, never taken from the client.
// The byline can be credited to another account via post.author_id (e.g. a post pasted from Discord on
// someone's behalf); the server looks the alias up so the real name never leaks.
const ALLOWED = ['title', 'subtitle', 'content', 'featured_image_url', 'status', 'featured', 'priority', 'tags', 'published_at', 'metadata'] as const;

function pick(post: any) {
  const out: Record<string, any> = {};
  for (const k of ALLOWED) if (post && k in post) out[k] = post[k];
  // Pasted-HTML posts are cleaned here too (scripts, handlers, page-level CSS), whatever the client sent.
  if (isHtmlContent(out.content)) out.content = prepareNewsHtml(out.content);
  return out;
}

/** Resolve a credited author: { author_id, author_name } for a profile id, or an error response. */
async function creditedAuthor(authorId: unknown) {
  if (typeof authorId !== 'string' || !authorId) return { error: NextResponse.json({ error: 'author_id must be a profile id' }, { status: 400 }) };
  const { data: p } = await supabaseAdmin.from('profiles').select('id, in_game_alias').eq('id', authorId).maybeSingle();
  const alias = (p?.in_game_alias as string | null)?.trim();
  if (!p || !alias) return { error: NextResponse.json({ error: 'That author has no in-game alias' }, { status: 400 }) };
  return { author_id: p.id as string, author_name: alias };
}

export async function POST(request: NextRequest) {
  const g = await gate(request);
  if ('error' in g) return g.error;
  const body = await request.json().catch(() => null);
  let byline: { author_id: string; author_name: string } = { author_id: g.user.id, author_name: g.alias };
  if (body?.post && 'author_id' in body.post && body.post.author_id) {
    const a = await creditedAuthor(body.post.author_id);
    if ('error' in a) return a.error;
    byline = a;
  }
  const post: Record<string, any> = { ...pick(body?.post), ...byline };
  if (!post.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('news_posts').insert([post]).select('id').single();
  if (error) return NextResponse.json({ error: `${error.message}${error.details ? ` (${error.details})` : ''}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PUT(request: NextRequest) {
  const g = await gate(request);
  if ('error' in g) return g.error;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const post: Record<string, any> = pick(body.post);
  if (body.post && 'author_id' in body.post && body.post.author_id) {
    const a = await creditedAuthor(body.post.author_id);
    if ('error' in a) return a.error;
    post.author_id = a.author_id;
    post.author_name = a.author_name;
  }
  const { data, error } = await supabaseAdmin.from('news_posts').update(post).eq('id', body.id).select('id');
  if (error) return NextResponse.json({ error: `${error.message}${error.details ? ` (${error.details})` : ''}` }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const g = await gate(request);
  if ('error' in g) return g.error;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('news_posts').delete().eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
