import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authorizeUrl, getDiscordConfig, signState } from '@/lib/discord-server';

/**
 * GET /api/discord/start  (Bearer token)  → { url }
 * The browser then navigates to Discord. The signed state carries the user id
 * back to /api/discord/callback, so no cookie or session is needed there.
 * GET /api/discord/start?check=1 → which settings are present (booleans only).
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('check') === '1') {
    const cfg = await getDiscordConfig();
    return NextResponse.json({
      DISCORD_CLIENT_ID: !!cfg.clientId,
      DISCORD_CLIENT_SECRET: !!cfg.clientSecret,
      DISCORD_GUILD_ID: !!cfg.guildId,
      vercel_env: process.env.VERCEL_ENV || null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cfg = await getDiscordConfig();
  if (!cfg.configured) {
    const missing = [!cfg.clientId && 'Client ID', !cfg.clientSecret && 'Client Secret'].filter(Boolean).join(' and ');
    return NextResponse.json({ error: `Discord linking isn’t set up yet: ${missing} missing. Staff can add them in CTF management.` }, { status: 503 });
  }

  const returnTo = request.nextUrl.searchParams.get('return') || '/profile';
  const redirectUri = `${request.nextUrl.origin}/api/discord/callback`;
  return NextResponse.json({ url: authorizeUrl(cfg, redirectUri, signState(user.id, returnTo)) });
}
