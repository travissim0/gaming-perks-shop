import { db } from './db.js';

/**
 * Day-of reminder in #ctf-referee for a league match that still has no referee.
 *
 * Runs every few minutes. A match qualifies when it is scheduled (not TBD), kicks off later
 * today in league time (Eastern), it is 10 AM Eastern or later, and it has fewer referees than
 * the league wants (two on RS and playoffs, one on FS; "wanted", since a match still runs with
 * one). One reminder per match per day: the queued notice itself is the record, so a match
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

/**
 * Referees the league wants on a match: the season's scoring rules (`refs.rs` / `refs.fs`),
 * defaulting to the points preset's two for RS and playoffs, one for FS. A target only.
 */
const wantedCache = new Map<string, { at: number; rs: number; fs: number }>();
async function refsWanted(leagueSlug: string | null, seasonNumber: number | null, stage: string | null): Promise<number> {
  if (!leagueSlug || !seasonNumber || leagueSlug === 'ctfpl') return 1;
  const key = `${leagueSlug}:${seasonNumber}`;
  let hit = wantedCache.get(key);
  if (!hit || Date.now() - hit.at > 10 * 60_000) {
    let rs = 1, fs = 1;
    const { data: league } = await db.from('leagues').select('id').eq('slug', leagueSlug).maybeSingle();
    if (league) {
      const { data: season } = await db.from('league_seasons').select('scoring_rules').eq('league_id', (league as any).id).eq('season_number', seasonNumber).maybeSingle();
      const rules = (season as any)?.scoring_rules;
      if (rules?.preset === 'points') { rs = 2; fs = 1; }           // the site's points preset
      if (typeof rules?.refs?.rs === 'number') rs = rules.refs.rs;
      if (typeof rules?.refs?.fs === 'number') fs = rules.refs.fs;
    }
    hit = { at: Date.now(), rs: Math.max(1, rs), fs: Math.max(1, fs) };
    wantedCache.set(key, hit);
  }
  return stage === 'fs' ? hit.fs : hit.rs;
}

let running = false;

export async function queueRefReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const today = leagueParts(now);
    if (today.hour < REMIND_FROM_HOUR) return;

    const read = (withColor: boolean) => db
      .from('matches')
      .select(`id, title, scheduled_at, league_slug, season_number, week, stage, fs_status${withColor ? ', fs_color' : ''}, squad_a:squads!matches_squad_a_id_fkey(name, tag), squad_b:squads!matches_squad_b_id_fkey(name, tag), match_participants(role, profiles!match_participants_player_id_fkey(in_game_alias))`)
      .eq('status', 'scheduled')
      .eq('time_tbd', false)
      .not('league_slug', 'is', null)
      .gt('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 24 * 3_600_000).toISOString());
    let { data: matches, error } = await read(true);
    if (error && /fs_color/.test(error.message)) ({ data: matches, error } = await read(false)); // before add-fs-colors.sql
    if (error) { if (!/does not exist/i.test(error.message)) console.error('ref reminders read failed:', error.message); return; }

    for (const m of (matches || []) as any[]) {
      if (leagueParts(new Date(m.scheduled_at)).day !== today.day) continue;          // not today
      if (m.stage === 'fs' && m.fs_status !== 'accepted') continue;                   // FS proposal not agreed yet
      const refs: string[] = (m.match_participants || []).filter((p: any) => p.role === 'referee').map((p: any) => p.profiles?.in_game_alias).filter(Boolean);
      const refCount = (m.match_participants || []).filter((p: any) => p.role === 'referee').length;
      const wanted = await refsWanted(m.league_slug, m.season_number, m.stage);
      if (refCount >= wanted) continue;                                              // fully staffed

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
          stage_label: m.stage === 'playoff' ? 'Playoffs' : m.stage === 'fs' ? (m.fs_color === 'green' ? 'FS Green' : m.fs_color === 'red' ? 'FS Red' : 'Free scheduled') : m.week ? `Week ${m.week}` : (m.title || 'Match'),
          squad_a: name(m.squad_a),
          squad_b: name(m.squad_b),
          scheduled_at: m.scheduled_at,
          ref_aliases: refs,
          refs_wanted: wanted,
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
