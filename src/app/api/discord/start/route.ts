import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authorizeUrl, discordEnv, signState } from '@/lib/discord-server';

/**
 * GET /api/discord/start  (Bearer token)  → { url }
 * The browser then navigates to Discord. The signed state carries the user id
 * back to /api/discord/callback, so no cookie or session is needed there.
 */
export async function GET(request: NextRequest) {
  // ?check=1 → which settings the deployment can see (booleans only, no values).
  if (request.nextUrl.searchParams.get('check') === '1') {
    const env = discordEnv();
    return NextResponse.json({
      DISCORD_CLIENT_ID: !!env.clientId,
      DISCORD_CLIENT_SECRET: !!env.clientSecret,
      DISCORD_GUILD_ID: !!env.guildId,
      vercel_env: process.env.VERCEL_ENV || null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const env = discordEnv();
  if (!env.configured) {
    const missing = [!env.clientId && 'DISCORD_CLIENT_ID', !env.clientSecret && 'DISCORD_CLIENT_SECRET'].filter(Boolean).join(' and ');
    return NextResponse.json({ error: `Discord linking isn’t set up yet: ${missing} not visible to this deployment (${process.env.VERCEL_ENV || 'unknown'} environment).` }, { status: 503 });
  }

  const returnTo = request.nextUrl.searchParams.get('return') || '/profile';
  const redirectUri = `${request.nextUrl.origin}/api/discord/callback`;
  return NextResponse.json({ url: authorizeUrl(redirectUri, signState(user.id, returnTo)) });
}
