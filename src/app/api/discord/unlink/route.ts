import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** POST /api/discord/unlink (Bearer) — clears the Discord link on the caller's profile. */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // A profile picture that came from Discord goes with the link.
  const { data: prof } = await supabaseAdmin.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
  const avatarFromDiscord = typeof (prof as any)?.avatar_url === 'string' && (prof as any).avatar_url.startsWith('https://cdn.discordapp.com/avatars/');

  const { error: updErr } = await supabaseAdmin
    .from('profiles')
    .update({
      ...(avatarFromDiscord ? { avatar_url: null } : {}),
      discord_id: null,
      discord_username: null,
      discord_global_name: null,
      discord_avatar: null,
      discord_guild_nick: null,
      discord_in_guild: false,
      discord_linked_at: null,
    })
    .eq('id', user.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
