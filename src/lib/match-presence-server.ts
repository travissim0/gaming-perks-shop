import { supabaseAdmin } from '@/lib/match-setup-server';
import { listLiveArenas } from '@/server/liveArenaStore';

/**
 * Who is in a league match's arena, sampled from the zone's live snapshots
 * (create-match-presence.sql). The zone posts every arena about once a minute with every
 * player and a spectator flag, so this sees what the stat export never does: a referee sitting
 * in spec, or a staff member who turned up without signing up.
 *
 * Sampled from the match queue poll (the zone polls it every 30-60 s) for matches that are in
 * progress or within PRESENCE_LEAD of kick-off, until they are recorded. One row per alias per
 * match, keyed on the normalised alias; first/last seen, whether seen spectating or playing.
 *
 * Staff aliases: a referee or admin working a match logs in as "CTF[Ref] Designer" /
 * "CTF[Admin] Zmn". The prefix is stripped for matching but remembered (`staff_tag`), because
 * only a staff-alias appearance counts as helping: the same person under their normal alias is
 * there to play (John, 2026-10-15).
 */

export const PRESENCE_LEAD_MS = 15 * 60_000;
/** A match keeps being sampled this long after its kick-off even if no result has landed. */
const PRESENCE_TAIL_MS = 3 * 3_600_000;
const SAMPLE_EVERY_MS = 45_000;
const FRESH_MS = 150_000;

const lastSample = new Map<string, number>();

/** "CTF[Ref] Designer" → { key: 'designer', staff_tag: 'ref' }; "Soup" → { key: 'soup', staff_tag: null }. */
export function aliasKey(alias: string): { key: string; staff_tag: string | null } {
  const raw = String(alias || '').trim();
  const m = raw.match(/^ctf\s*\[\s*([a-z ]+?)\s*\]\s*(.*)$/i);
  if (m) return { key: m[2].trim().toLowerCase(), staff_tag: m[1].trim().toLowerCase() };
  return { key: raw.toLowerCase(), staff_tag: null };
}

export interface PresenceRow {
  match_id: string; alias: string; alias_key: string; player_id: string | null;
  first_seen: string; last_seen: string; spec_seen: boolean; play_seen: boolean; samples: number; staff_tag: string | null;
}

let installed: boolean | null = null;
async function presenceInstalled(): Promise<boolean> {
  if (installed !== null) return installed;
  const { error } = await supabaseAdmin.from('match_presence').select('id').limit(1);
  installed = !error;
  return installed;
}

interface QueueMatch { id: string; arena: string | null; status: string; kickoff_at: string; people: { player_id: string; alias: string }[] }

/**
 * Note who is in each listed match's arena right now. Cheap when nothing is live: one read of
 * the live arena list (cached 5 s) and no writes. Errors are logged, never thrown.
 */
export async function samplePresence(matches: QueueMatch[]): Promise<void> {
  try {
    const now = Date.now();
    const due = matches.filter((m) => {
      if (!m.arena || !['scheduled', 'in_progress'].includes(m.status)) return false;
      const k = new Date(m.kickoff_at).getTime();
      if (!(now >= k - PRESENCE_LEAD_MS && now <= k + PRESENCE_TAIL_MS)) return false;
      const last = lastSample.get(m.id) || 0;
      return now - last >= SAMPLE_EVERY_MS;
    });
    if (due.length === 0) return;
    if (!(await presenceInstalled())) return;

    const arenas = (await listLiveArenas(FRESH_MS)).filter((a) => a.game === 'ctf');
    for (const m of due) {
      lastSample.set(m.id, now);
      const live = arenas.find((a) => a.arena.trim().toLowerCase() === m.arena!.trim().toLowerCase());
      if (!live) continue;

      const seen = new Map<string, { alias: string; staff_tag: string | null; spec: boolean }>();
      for (const t of live.teams || []) {
        const nonPlaying = t.side === 'spec' || t.side === 'np';
        for (const p of t.players || []) {
          const { key, staff_tag } = aliasKey(p.alias);
          if (!key) continue;
          const prev = seen.get(key);
          const spec = nonPlaying || p.spec === true;
          seen.set(key, { alias: p.alias, staff_tag: staff_tag || prev?.staff_tag || null, spec: prev ? prev.spec && spec : spec });
        }
      }
      if (seen.size === 0) continue;

      const known = new Map(m.people.map((p) => [aliasKey(p.alias).key, p.player_id]));
      const keys = [...seen.keys()];
      // Resolve the rest against site profiles, once per unknown alias.
      const unknown = keys.filter((k) => !known.has(k));
      if (unknown.length) {
        // Case-insensitive exact match (ilike with no wildcard); quoted so spaces survive the filter syntax.
        const safe = unknown.filter((k) => !/[",()]/.test(k) && !/[%_*]/.test(k));
        const { data } = safe.length ? await supabaseAdmin.from('profiles').select('id, in_game_alias').or(safe.map((k) => `in_game_alias.ilike."${k}"`).join(',')) : { data: [] as any[] };
        for (const p of (data || []) as any[]) known.set(String(p.in_game_alias).toLowerCase(), p.id);
      }

      const { data: existing } = await supabaseAdmin.from('match_presence').select('alias_key, first_seen, spec_seen, play_seen, samples, staff_tag, player_id').eq('match_id', m.id).in('alias_key', keys);
      const have = new Map(((existing || []) as any[]).map((r) => [r.alias_key, r]));
      const stamp = new Date(now).toISOString();
      const rows = keys.map((k) => {
        const s = seen.get(k)!, e = have.get(k);
        return {
          match_id: m.id, alias: s.alias, alias_key: k,
          player_id: e?.player_id || known.get(k) || null,
          first_seen: e?.first_seen || stamp, last_seen: stamp,
          spec_seen: !!e?.spec_seen || s.spec, play_seen: !!e?.play_seen || !s.spec,
          samples: (e?.samples || 0) + 1,
          staff_tag: s.staff_tag || e?.staff_tag || null,
        };
      });
      const { error } = await supabaseAdmin.from('match_presence').upsert(rows, { onConflict: 'match_id,alias_key' });
      if (error) console.error('[presence] write failed:', error.message);
    }
  } catch (e) {
    console.error('[presence] sample threw', e);
  }
}

/** Presence rows for these matches, grouped by match id. Empty before create-match-presence.sql. */
export async function presenceFor(matchIds: string[]): Promise<Map<string, PresenceRow[]>> {
  const out = new Map<string, PresenceRow[]>();
  if (matchIds.length === 0 || !(await presenceInstalled())) return out;
  const { data } = await supabaseAdmin.from('match_presence').select('match_id, alias, alias_key, player_id, first_seen, last_seen, spec_seen, play_seen, samples, staff_tag').in('match_id', matchIds);
  for (const r of (data || []) as PresenceRow[]) {
    if (!out.has(r.match_id)) out.set(r.match_id, []);
    out.get(r.match_id)!.push(r);
  }
  return out;
}
