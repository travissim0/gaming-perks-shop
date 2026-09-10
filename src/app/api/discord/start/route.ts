import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authorizeUrl, discordEnv, signState } from '@/lib/discord-server';

/**
 * GET /api/discord/start  (Bearer token)  → { url }
 * The browser then navigates to Discord. The signed state carries the user id
 * back to /api/discord/callback, so no cookie or session is needed there.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!discordEnv().configured) {
    return NextResponse.json({ error: 'Discord linking isn’t set up yet (missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).' }, { status: 503 });
  }

  const returnTo = request.nextUrl.searchParams.get('return') || '/profile';
  const redirectUri = `${request.nextUrl.origin}/api/discord/callback`;
  return NextResponse.json({ url: authorizeUrl(redirectUri, signState(user.id, returnTo)) });
}
