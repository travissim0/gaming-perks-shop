import { createHmac, timingSafeEqual } from 'crypto';
import { getSetting } from './site-settings';

/**
 * Server-side helpers for the Discord account link (our own OAuth flow —
 * sign-in is untouched). Scopes are the minimum needed: `identify` for the
 * account, `guilds.members.read` for the player's nickname in the CTFPL server.
 *
 * Settings come from environment variables or, when those aren't set, from the
 * site_settings table that staff edit in CTF management.
 */

export const DISCORD_SCOPES = 'identify guilds.members.read';

export interface DiscordConfig { clientId: string; clientSecret: string; guildId: string; configured: boolean }

export async function getDiscordConfig(): Promise<DiscordConfig> {
  const [clientId, clientSecret, guildId] = await Promise.all([
    getSetting('DISCORD_CLIENT_ID'),
    getSetting('DISCORD_CLIENT_SECRET'),
    getSetting('DISCORD_GUILD_ID'),
  ]);
  return { clientId, clientSecret, guildId, configured: !!(clientId && clientSecret) };
}

const stateSecret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';
const b64u = (s: string) => Buffer.from(s).toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url').toString();

/** Signed, short-lived state carrying the signed-in user's id through the OAuth round trip. */
export function signState(userId: string, returnTo: string): string {
  const payload = JSON.stringify({ u: userId, r: returnTo, t: Date.now() });
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${b64u(payload)}.${sig}`;
}

export function verifyState(state: string | null): { userId: string; returnTo: string } | null {
  if (!state) return null;
  const [p, sig] = state.split('.');
  if (!p || !sig) return null;
  let payload: string;
  try { payload = unb64u(p); } catch { return null; }
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const { u, r, t } = JSON.parse(payload);
    if (!u || typeof t !== 'number' || Date.now() - t > 10 * 60 * 1000) return null;
    return { userId: u, returnTo: typeof r === 'string' && r.startsWith('/') ? r : '/profile' };
  } catch {
    return null;
  }
}

export function authorizeUrl(cfg: DiscordConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: DISCORD_SCOPES,
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export async function exchangeCode(cfg: DiscordConfig, code: string, redirectUri: string): Promise<{ access_token: string } | null> {
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    console.error('discord token exchange failed', res.status, await res.text().catch(() => ''));
    return null;
  }
  return res.json();
}

export interface DiscordUser { id: string; username: string; global_name: string | null; avatar: string | null }

export async function fetchUser(token: string): Promise<DiscordUser | null> {
  const res = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? res.json() : null;
}

/** Nickname in the CTFPL server; null when the user isn't a member. */
export async function fetchGuildNick(token: string, guildId: string): Promise<{ inGuild: boolean; nick: string | null }> {
  if (!guildId) return { inGuild: false, nick: null };
  const res = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return { inGuild: false, nick: null };
  if (!res.ok) return { inGuild: false, nick: null };
  const m = await res.json();
  return { inGuild: true, nick: m?.nick ?? null };
}
