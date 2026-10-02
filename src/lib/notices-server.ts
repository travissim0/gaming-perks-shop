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
  /** null while the match's time is TBD: the bot then shows scheduled_et instead of a Discord timestamp. */
  scheduled_at: string | null;
  scheduled_et: string;         // "Sun, Oct 4 · 8:00 PM ET", or "Time TBD"
}

const fmtEt = (iso: string) =>
  `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;

export async function matchSummary(matchId: string): Promise<MatchSummary | null> {
  const cols = 'id, title, scheduled_at, league_slug, season_number, week, stage, squad_a:squads!matches_squad_a_id_fkey(name, tag), squad_b:squads!matches_squad_b_id_fkey(name, tag)';
  const one = (c: string) => supabaseAdmin.from('matches').select(c).eq('id', matchId).maybeSingle();
  // time_tbd arrives with add-match-time-tbd.sql; without it no match is TBD.
  let { data, error } = await one(`${cols}, time_tbd`);
  if (error && /time_tbd/.test(error.message)) ({ data } = await one(cols));
  const m = data as any;
  if (!m) return null;
  const tbd = m.time_tbd === true;
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
    scheduled_at: tbd ? null : m.scheduled_at,
    scheduled_et: tbd ? 'Time TBD' : fmtEt(m.scheduled_at),
  };
}

/**
 * Tell #ctf-referee that a league match has a confirmed time (or that its time moved), with who
 * is reffing it or that it still needs someone. One referee is enough; more are extras.
 * The bot sends a separate reminder on the day if nobody has signed up (bot/src/refReminders.ts).
 * Skipped for TBD and past matches.
 */
export async function announceMatchTime(matchId: string, moved = false): Promise<void> {
  try {
    const m = await matchSummary(matchId);
    if (!m || !m.scheduled_at || new Date(m.scheduled_at).getTime() <= Date.now()) return;
    const { data: refs } = await supabaseAdmin
      .from('match_participants')
      .select('profiles!match_participants_player_id_fkey(in_game_alias)')
      .eq('match_id', matchId)
      .eq('role', 'referee');
    const refAliases = ((refs || []) as any[]).map((r) => r.profiles?.in_game_alias).filter(Boolean);
    await queueNotice({
      user_id: null,
      channel: 'referee',
      kind: moved ? 'match_time_moved' : 'match_time_set',
      payload: { ...m, ref_aliases: refAliases },
      text: '',
    });
  } catch (e) {
    console.error('announceMatchTime threw', e);
  }
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
