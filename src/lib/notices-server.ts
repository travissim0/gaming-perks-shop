import { createClient } from '@supabase/supabase-js';
import { SYSTEM_USER_ID } from '@/lib/constants';

/**
 * Notices to people, delivered by the Discord bot (DM, and a channel post
 * where relevant). If the person hasn't linked Discord, the same text lands
 * as a site private message from the System account instead, so nobody is
 * missed. Server-only (service role).
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const SITE_URL = 'https://www.freeinf.org';

export interface MatchSummary {
  match_id: string;
  url: string;
  league: string | null;
  season_number: number | null;
  stage_label: string;          // "Week 3" | "Playoffs" | "Free scheduled"
  squad_a: string | null;
  squad_b: string | null;
  scheduled_at: string;
  scheduled_et: string;         // "Sun, Oct 4 · 8:00 PM ET"
}

const fmtEt = (iso: string) =>
  `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;

export async function matchSummary(matchId: string): Promise<MatchSummary | null> {
  const { data: m } = await supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, league_slug, season_number, week, stage, squad_a:squads!matches_squad_a_id_fkey(name, tag), squad_b:squads!matches_squad_b_id_fkey(name, tag)')
    .eq('id', matchId)
    .maybeSingle();
  if (!m) return null;
  const a: any = m.squad_a, b: any = m.squad_b;
  const name = (s: any) => (s ? (s.tag ? `[${s.tag}] ${s.name}` : s.name) : null);
  return {
    match_id: m.id,
    url: `${SITE_URL}/matches/${m.id}`,
    league: m.league_slug ? m.league_slug.toUpperCase() : null,
    season_number: m.season_number ?? null,
    stage_label: m.stage === 'playoff' ? 'Playoffs' : m.stage === 'fs' ? 'Free scheduled' : m.week ? `Week ${m.week}` : (m.title || 'Match'),
    squad_a: name(a),
    squad_b: name(b),
    scheduled_at: m.scheduled_at,
    scheduled_et: fmtEt(m.scheduled_at),
  };
}

export interface Notice {
  /** Who to DM. Omit for a channel-only post. */
  user_id?: string | null;
  /** Also post in this channel. */
  channel?: 'referee' | 'staff' | null;
  kind: string;
  payload: Record<string, unknown>;
  /** Plain-text version for the site-message fallback. */
  text: string;
  subject?: string;
}

export async function queueNotice(n: Notice): Promise<void> {
  try {
    let userId: string | null = n.user_id ?? null;
    if (userId) {
      const { data: p } = await supabaseAdmin.from('profiles').select('discord_id').eq('id', userId).maybeSingle();
      if (!(p as any)?.discord_id) {
        // Not on Discord: site message instead. Still post to the channel if asked.
        await supabaseAdmin.from('private_messages').insert({
          sender_id: SYSTEM_USER_ID,
          recipient_id: userId,
          subject: n.subject || 'Match assignment',
          content: n.text,
        });
        userId = null;
        if (!n.channel) return;
      }
    }
    const { error } = await supabaseAdmin.from('discord_bot_notices').insert({ user_id: userId, channel: n.channel ?? null, kind: n.kind, payload: n.payload });
    if (error && !/does not exist/i.test(error.message)) console.error('queueNotice failed', error.message);
  } catch (e) {
    console.error('queueNotice threw', e);
  }
}
