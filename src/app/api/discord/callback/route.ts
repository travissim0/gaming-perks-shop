import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDiscordConfig, exchangeCode, fetchGuildNick, fetchUser, verifyState } from '@/lib/discord-server';

/**
 * GET /api/discord/callback?code&state
 * Finishes the link: exchanges the code, reads the Discord account and the
 * CTFPL nickname, stores them on the profile, and sends the player back with
 * ?discord=linked (or ?discord=error&reason=…).
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string, returnTo = '/profile') =>
    NextResponse.redirect(`${origin}${returnTo}?discord=error&reason=${encodeURIComponent(reason)}`);

  const state = verifyState(request.nextUrl.searchParams.get('state'));
  if (!state) return fail('expired');
  const { userId, returnTo } = state;

  if (request.nextUrl.searchParams.get('error')) return fail('denied', returnTo);
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return fail('missing-code', returnTo);

  const cfg = await getDiscordConfig();
  const token = await exchangeCode(cfg, code, `${origin}/api/discord/callback`);
  if (!token?.access_token) return fail('exchange', returnTo);

  const me = await fetchUser(token.access_token);
  if (!me?.id) return fail('profile', returnTo);
  const guild = await fetchGuildNick(token.access_token, cfg.guildId);

  // One Discord account per site account.
  const { data: taken } = await supabaseAdmin.from('profiles').select('id').eq('discord_id', me.id).neq('id', userId).maybeSingle();
  if (taken) return fail('already-linked', returnTo);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      discord_id: me.id,
      discord_username: me.username,
      discord_global_name: me.global_name ?? null,
      discord_avatar: me.avatar ?? null,
      discord_guild_nick: guild.nick,
      discord_in_guild: guild.inGuild,
      discord_linked_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) {
    console.error('discord link: profile update failed', error);
    return fail(/column .*does not exist/i.test(error.message) ? 'sql-pending' : 'save', returnTo);
  }

  // Fill the Discord field on any current registration that's still blank.
  await supabaseAdmin
    .from('free_agents')
    .update({ contact_info: me.username })
    .eq('player_id', userId)
    .eq('is_active', true)
    .or('contact_info.is.null,contact_info.eq.');

  return NextResponse.redirect(`${origin}${returnTo}?discord=linked`);
}
