import { db } from './db.js';

/**
 * Day-of reminder in #ctf-referee for a league match that still has no referee.
 *
 * Runs every few minutes. A match qualifies when it is scheduled (not TBD), kicks off later
 * today in league time (Eastern), it is 10 AM Eastern or later, and nobody is signed up as
 * referee. One reminder per match per day: the queued notice itself is the record, so a match
 * moved to another day is reminded again on its new day. The notice is delivered by
 * deliverNotices like any other.
 */

const LEAGUE_TZ = 'America/New_York';
const SITE_URL = 'https://www.freeinf.org';
const REMIND_FROM_HOUR = 10; // league time

function leagueParts(d: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

let running = false;

export async function queueRefReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const today = leagueParts(now);
    if (today.hour < REMIND_FROM_HOUR) return;

    const { data: matches, error } = await db
      .from('matches')
      .select('id, title, scheduled_at, league_slug, season_number, week, stage, fs_status, squad_a:squads!matches_squad_a_id_fkey(name, tag), squad_b:squads!matches_squad_b_id_fkey(name, tag), match_participants(role)')
      .eq('status', 'scheduled')
      .eq('time_tbd', false)
      .not('league_slug', 'is', null)
      .gt('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 24 * 3_600_000).toISOString());
    if (error) { if (!/does not exist/i.test(error.message)) console.error('ref reminders read failed:', error.message); return; }

    for (const m of (matches || []) as any[]) {
      if (leagueParts(new Date(m.scheduled_at)).day !== today.day) continue;          // not today
      if (m.stage === 'fs' && m.fs_status !== 'accepted') continue;                   // FS proposal not agreed yet
      if ((m.match_participants || []).some((p: any) => p.role === 'referee')) continue; // already has a ref

      const { data: sent } = await db
        .from('discord_bot_notices')
        .select('id')
        .eq('kind', 'ref_reminder')
        .eq('payload->>match_id', m.id)
        .eq('payload->>day', today.day)
        .limit(1);
      if (sent && sent.length) continue;

      const name = (s: any) => (s ? (s.tag ? `[${s.tag}] ${s.name}` : s.name) : null);
      const { error: insErr } = await db.from('discord_bot_notices').insert({
        user_id: null,
        channel: 'referee',
        kind: 'ref_reminder',
        payload: {
          match_id: m.id,
          day: today.day,
          url: `${SITE_URL}/matches/${m.id}`,
          league: m.league_slug ? String(m.league_slug).toUpperCase() : null,
          season_number: m.season_number ?? null,
          stage_label: m.stage === 'playoff' ? 'Playoffs' : m.stage === 'fs' ? 'Free scheduled' : m.week ? `Week ${m.week}` : (m.title || 'Match'),
          squad_a: name(m.squad_a),
          squad_b: name(m.squad_b),
          scheduled_at: m.scheduled_at,
        },
      });
      if (insErr) console.error('ref reminder queue failed:', insErr.message);
      else console.log(`ref reminder queued for ${m.id} (${today.day})`);
    }
  } catch (e: any) {
    console.error('ref reminders threw:', e?.message || e);
  } finally {
    running = false;
  }
}
