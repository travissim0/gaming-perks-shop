/**
 * One-off data fix for the 2026-09-07 USL Mix false starts. Runs against production with the
 * service role key from .env.local (never printed). Usage:
 *
 *   npx --yes tsx scripts/usl-mix-fix-20260907.ts recompute    replay ratings only (after an elo.ts change)
 *   npx --yes tsx scripts/usl-mix-fix-20260907.ts check        show the rows, change nothing
 *   npx --yes tsx scripts/usl-mix-fix-20260907.ts apply        delete the two *restart stubs, promote the
 *                                                              two real games to mixes, then replay ratings
 *   npx --yes tsx scripts/usl-mix-fix-20260907.ts delete-idle  ALSO delete the 27-minute "mix" 9b985550
 *                                                              (a real pub game mislabelled as the mix -
 *                                                              its players have real kills, so this is a
 *                                                              separate decision)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { recomputeAllRatings } from '../src/lib/uslMix/ingest';

const ROOT = path.resolve(__dirname, '..');

function loadEnv(): { url: string; key: string } {
  const env: Record<string, string> = {};
  for (const raw of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, eq).trim()] = v;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url: url.replace(/\/+$/, ''), key };
}

const STUBS = [
  '2860face-2c22-4855-8c2d-58280c527832', // 06:19:52 mix 0-0, 70 s, unrated
  'd3f8dc88-77b2-4d0b-a927-d0c809a7aa06', // 06:54:31 mix 0-0, 77 s, RATED + elo_applied
];
const IDLE_MISLABELLED = '9b985550-5f24-4781-9fc8-5bebcdab0268'; // 05:53:06 "mix" 0-1, 1605 s - really the pub before the draft

const PROMOTE = [
  { id: 'f6615486-0317-4688-83a9-7dd71dae21ed', rated: true, team_size: 9, team_a_captain: 'KI', team_b_captain: 'haup' },
  { id: '52291384-71a7-44ef-b593-b54e3396c3a0', rated: false, team_size: 9, team_a_captain: 'Sabotage', team_b_captain: 'g' },
];

const GAME_COLS = 'id, game_kind, rated, elo_applied, team_size, team_a_name, team_a_kills, team_a_captain, team_b_name, team_b_kills, team_b_captain, duration_seconds';

async function main() {
  const mode = process.argv[2] ?? 'check';
  const { url, key } = loadEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (mode === 'recompute') {
    // replay every rated mix with the formula in src/lib/uslMix/elo.ts as it is on disk right now
    const r = await recomputeAllRatings(supabase);
    console.log('recompute:', r);
    return;
  }

  const ids = [...STUBS, IDLE_MISLABELLED, ...PROMOTE.map((p) => p.id)];
  const { data: before, error } = await supabase.from('usl_mix_games').select(GAME_COLS).in('id', ids);
  if (error) throw error;
  console.log('--- games before ---');
  console.table(before);

  for (const p of PROMOTE) {
    const keys = [p.team_a_captain.toLowerCase(), p.team_b_captain.toLowerCase()];
    const { data: rows } = await supabase
      .from('usl_mix_game_players')
      .select('alias, alias_key, team_name, is_captain, kills, deaths')
      .eq('game_id', p.id)
      .in('alias_key', keys);
    console.log(`--- captain rows in ${p.id.slice(0, 8)} (expect 2) ---`);
    console.table(rows);
    if ((rows ?? []).length !== 2) throw new Error(`game ${p.id.slice(0, 8)}: expected both captains in the player rows, found ${(rows ?? []).length} - not applying`);
    const g = (before ?? []).find((x: any) => x.id === p.id) as any;
    const aOk = rows!.some((r: any) => r.alias_key === p.team_a_captain.toLowerCase() && r.team_name === g.team_a_name);
    const bOk = rows!.some((r: any) => r.alias_key === p.team_b_captain.toLowerCase() && r.team_name === g.team_b_name);
    if (!aOk || !bOk) throw new Error(`game ${p.id.slice(0, 8)}: captain/team mismatch (a=${aOk} b=${bOk}) - not applying`);
  }

  if (mode === 'check') {
    console.log('check only - nothing changed');
    return;
  }

  const toDelete = mode === 'delete-idle' ? [...STUBS, IDLE_MISLABELLED] : STUBS;
  const { data: deleted, error: delErr } = await supabase.from('usl_mix_games').delete().in('id', toDelete).select('id');
  if (delErr) throw delErr;
  console.log('deleted games:', (deleted ?? []).map((d: any) => d.id.slice(0, 8)));

  for (const p of PROMOTE) {
    const { error: upErr } = await supabase
      .from('usl_mix_games')
      .update({ game_kind: 'mix', rated: p.rated, team_size: p.team_size, team_a_captain: p.team_a_captain, team_b_captain: p.team_b_captain })
      .eq('id', p.id);
    if (upErr) throw upErr;
    const { error: capErr } = await supabase
      .from('usl_mix_game_players')
      .update({ is_captain: true })
      .eq('game_id', p.id)
      .in('alias_key', [p.team_a_captain.toLowerCase(), p.team_b_captain.toLowerCase()]);
    if (capErr) throw capErr;
    console.log(`promoted ${p.id.slice(0, 8)} -> mix, rated=${p.rated}, captains ${p.team_a_captain} / ${p.team_b_captain}`);
  }

  const { data: after } = await supabase.from('usl_mix_games').select(GAME_COLS).in('id', ids);
  console.log('--- games after ---');
  console.table(after);

  console.log('--- recompute ---');
  const result = await recomputeAllRatings(supabase);
  console.log('recompute:', result);
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
