// Shared store for live arena snapshots (USL + CTF zones -> home page panel / public API).
//
// Same rationale as liveGameDataStore.ts: module-scope memory does not survive the trip
// between the zone's POST and the browser's GET on Vercel, so the latest snapshot per
// arena lives in one Supabase table (live-arena-snapshots.sql). A short in-process read
// cache keeps the polling cheap; writes always go straight through.
//
// If the table has not been created yet the store degrades to per-instance memory and
// logs once - the endpoints keep working, they just may not see every arena.

import { getServiceSupabase } from '@/lib/supabase';
import { LiveArenaRow, LiveArenaSnapshot, liveArenaKey } from '@/lib/live/types';

const TABLE = 'live_arena_snapshots';
/** Below the panel's 60s poll and the zone's 60s cadence, so a fresh snapshot shows on the next tick. */
const READ_CACHE_MS = 5_000;
/** Rows older than this are junk (a zone that stopped posting); pruned opportunistically on write. */
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

interface StoredRow {
  key: string;
  data: LiveArenaSnapshot;
  updated_at: string;
}

let memory = new Map<string, StoredRow>();
let readCache: { at: number; rows: StoredRow[] } | null = null;
let tableMissing = false;

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '');
}

export async function upsertLiveArena(snapshot: LiveArenaSnapshot): Promise<string> {
  const key = liveArenaKey(snapshot.game, snapshot.zone, snapshot.arena);
  const updated_at = new Date().toISOString();
  memory.set(key, { key, data: snapshot, updated_at });
  readCache = null;
  if (tableMissing) return key;

  const supabase = getServiceSupabase();
  const { error } = await supabase.from(TABLE).upsert(
    {
      key,
      game: snapshot.game,
      zone: snapshot.zone,
      arena: snapshot.arena,
      players_total: snapshot.players_total,
      data: snapshot,
      updated_at,
    },
    { onConflict: 'key' },
  );

  if (error) {
    if (isMissingTable(error)) {
      tableMissing = true;
      console.warn(`[liveArena] ${TABLE} missing - falling back to in-memory (run live-arena-snapshots.sql)`);
    } else {
      console.error('[liveArena] write failed:', error.message);
    }
    return key;
  }

  // Opportunistic prune: about once every 50 writes drop rows nobody has refreshed in a day.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - PRUNE_AFTER_MS).toISOString();
    const { error: pruneError } = await supabase.from(TABLE).delete().lt('updated_at', cutoff);
    if (pruneError) console.warn('[liveArena] prune failed:', pruneError.message);
  }
  return key;
}

async function loadRows(freshMs: number): Promise<StoredRow[]> {
  if (readCache && Date.now() - readCache.at < READ_CACHE_MS) return readCache.rows;

  const since = new Date(Date.now() - freshMs).toISOString();
  let rows: StoredRow[] = [];
  if (!tableMissing) {
    const { data, error } = await getServiceSupabase()
      .from(TABLE)
      .select('key, data, updated_at')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingTable(error)) {
        tableMissing = true;
        console.warn(`[liveArena] ${TABLE} missing - falling back to in-memory`);
      } else {
        console.error('[liveArena] read failed:', error.message);
      }
    } else if (data) {
      rows = (data as any[]).map((r) => ({ key: r.key as string, data: r.data as LiveArenaSnapshot, updated_at: r.updated_at as string }));
    }
  }

  // Merge whatever this instance saw itself (covers the missing-table fallback and a read error).
  const byKey = new Map<string, StoredRow>();
  for (const r of rows) byKey.set(r.key, r);
  for (const [k, r] of memory) {
    const existing = byKey.get(k);
    if (!existing || existing.updated_at < r.updated_at) byKey.set(k, r);
  }
  const merged = Array.from(byKey.values());
  readCache = { at: Date.now(), rows: merged };
  return merged;
}

/**
 * Every arena that reported within `freshMs`, newest first, with `age_s` stamped at call time.
 * Callers filter by game / emptiness; this stays a plain read.
 */
export async function listLiveArenas(freshMs: number): Promise<LiveArenaRow[]> {
  const now = Date.now();
  const rows = await loadRows(freshMs);
  return rows
    .filter((r) => now - new Date(r.updated_at).getTime() <= freshMs)
    .map((r) => ({
      ...r.data,
      key: r.key,
      updated_at: r.updated_at,
      age_s: Math.max(0, Math.round((now - new Date(r.updated_at).getTime()) / 1000)),
    }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
}
