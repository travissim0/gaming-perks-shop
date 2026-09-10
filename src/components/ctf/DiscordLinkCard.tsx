'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getLeagues, pickFeatured } from '@/lib/leagues';

export interface DiscordLink {
  discord_id: string | null;
  discord_username: string | null;
  discord_global_name: string | null;
  discord_avatar: string | null;
  discord_guild_nick: string | null;
  discord_in_guild: boolean;
  discord_linked_at: string | null;
}

export const DISCORD_COLS = 'discord_id, discord_username, discord_global_name, discord_avatar, discord_guild_nick, discord_in_guild, discord_linked_at';

export const discordAvatar = (d: Pick<DiscordLink, 'discord_id' | 'discord_avatar'>) =>
  d.discord_id && d.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${d.discord_id}/${d.discord_avatar}.${d.discord_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
    : null;

const REASONS: Record<string, string> = {
  expired: 'That link request expired. Try again.',
  denied: 'Discord access was cancelled.',
  exchange: 'Discord didn’t accept the request. Try again in a minute.',
  'already-linked': 'That Discord account is already linked to another freeinf.org account.',
  'sql-pending': 'Linking isn’t switched on yet (the database columns are missing).',
};

/** Starts the Discord OAuth flow for the signed-in user. Exported so the registration form can reuse it. */
export async function startDiscordLink(returnTo: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { toast.error('Sign in first'); return; }
  const res = await fetch(`/api/discord/start?return=${encodeURIComponent(returnTo)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) { toast.error(json.error || 'Could not start the Discord link'); return; }
  window.location.href = json.url;
}

/**
 * Profile card: connect / reconnect / disconnect Discord, with the CTFPL
 * nickname and a plain explanation of what the link is for.
 */
export default function DiscordLinkCard({ userId }: { userId: string }) {
  const [link, setLink] = useState<DiscordLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('profiles').select(DISCORD_COLS).eq('id', userId).maybeSingle();
      if (error) setUnavailable(true);
      else setLink((data as any) || null);
      setLoading(false);
      try {
        const L = pickFeatured(await getLeagues());
        setInvite(L?.discord_url || null);
      } catch { /* ignore */ }
    })();
    // Result of a round trip through Discord.
    try {
      const p = new URLSearchParams(window.location.search);
      const r = p.get('discord');
      if (r === 'linked') toast.success('Discord connected');
      else if (r === 'error') toast.error(REASONS[p.get('reason') || ''] || 'Could not connect Discord');
      if (r) window.history.replaceState({}, '', window.location.pathname);
    } catch { /* ignore */ }
  }, [userId]);

  const disconnect = async () => {
    if (!confirm('Disconnect Discord from your account?')) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/discord/unlink', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not disconnect');
      setLink((l) => (l ? { ...l, discord_id: null, discord_username: null, discord_global_name: null, discord_avatar: null, discord_guild_nick: null, discord_in_guild: false, discord_linked_at: null } : l));
      toast.success('Discord disconnected');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const linked = !!link?.discord_id;
  const avatar = link ? discordAvatar(link) : null;

  return (
    <section className="rounded-xl bg-[#131A2B] p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-[#E6EDF7]">Discord</h2>
        {linked && (
          <div className="flex gap-2">
            <button type="button" onClick={() => startDiscordLink('/profile')} disabled={busy} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50">Refresh</button>
            <button type="button" onClick={disconnect} disabled={busy} className="rounded-md px-3 py-1.5 text-sm text-[#8B98B0] hover:text-[#F87171] disabled:opacity-50">Disconnect</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded bg-[#1B2438]" />
      ) : unavailable ? (
        <p className="text-sm text-[#8B98B0]">Discord linking isn’t switched on yet.</p>
      ) : linked ? (
        <div className="flex items-start gap-3">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-12 w-12 rounded-full bg-[#1B2438]" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]/20 text-[#5865F2] font-medium">{(link!.discord_username || '?').slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 text-sm">
            <div className="text-[#E6EDF7]">
              {link!.discord_global_name || link!.discord_username}
              <span className="ml-2 text-[#8B98B0]">@{link!.discord_username}</span>
            </div>
            {link!.discord_in_guild ? (
              <div className="text-[#8B98B0]">
                In the CTFPL server{link!.discord_guild_nick ? <> as <span className="text-[#E6EDF7]">{link!.discord_guild_nick}</span></> : ''}
              </div>
            ) : (
              <div className="text-[#F59E0B]">
                Not in the CTFPL server yet.{' '}
                {invite && <a href={invite} target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:text-[#67E8F9]">Join it</a>}
                {invite ? ', then hit Refresh.' : ''}
              </div>
            )}
            <div className="mt-1 text-xs text-[#8B98B0]">Your squad’s roles and channels in the CTFPL server are set up from this once you’re drafted.</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-xl text-sm text-[#8B98B0]">
            Connect Discord so the CTFPL server and freeinf.org work together: your nickname shows on your profile and in the player pool,
            registration fills in your Discord for you, and your squad’s roles and channels are set up automatically once you’re drafted.
            We only read your Discord id, username, avatar and your nickname in the CTFPL server. We never post as you.
          </p>
          <button
            type="button"
            onClick={() => startDiscordLink('/profile')}
            className="shrink-0 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B76F5]"
          >
            Connect Discord
          </button>
        </div>
      )}
    </section>
  );
}
