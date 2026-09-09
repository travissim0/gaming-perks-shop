#!/usr/bin/env node
/**
 * Headless Supabase query tool.
 *
 * Exists because guessing at the schema causes more inaccuracy and back-and-forth than just asking
 * the database. Use it to discover what tables/columns actually exist before writing any query.
 *
 * Credentials come from .env.local (never passed on the command line, never printed).
 * Node's UA is fine with sb_secret keys - the browser block that affects the Tauri webview does not
 * apply here. Do NOT port this to PowerShell's Invoke-WebRequest, which sends a Mozilla UA and gets
 * 401 "Forbidden use of secret API key in browser".
 *
 * Usage:
 *   node scripts/supabase-query.mjs --list
 *       List every table and view PostgREST exposes (from its OpenAPI spec).
 *
 *   node scripts/supabase-query.mjs --columns player_stats
 *       Show the columns and types of one table/view.
 *
 *   node scripts/supabase-query.mjs --table player_stats --select player_name,main_class,side \
 *       [--filter "game_mode=eq.OvD"] [--limit 1000] [--order id.asc] [--count]
 *       Query rows. Prints JSON by default.
 *
 *   node scripts/supabase-query.mjs --table player_stats --select ... --all --out data.json
 *       Page through EVERYTHING (1000 rows per request) and write to a file. Use for aggregation
 *       jobs; PostgREST has no GROUP BY, so grouping happens locally.
 *
 *   node scripts/supabase-query.mjs --rpc some_function --body '{"arg":1}'
 *       Call a Postgres function.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) {
    console.error('Missing .env.local at ' + file);
    process.exit(1);
  }
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, eq).trim()] = v;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and a key.');
    process.exit(1);
  }
  return { url: url.replace(/\/+$/, ''), key };
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const name = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[name] = true;
      else { a[name] = next; i++; }
    } else a._.push(t);
  }
  return a;
}

const { url, key } = loadEnv();
const args = parseArgs(process.argv.slice(2));

// apikey AND Authorization are both required for sb_secret keys; Authorization alone returns
// 400 "Invalid Compact JWS".
const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

async function get(pathAndQuery, extraHeaders = {}) {
  const res = await fetch(url + pathAndQuery, { headers: { ...headers, ...extraHeaders } });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the key, even on failure.
    console.error(`HTTP ${res.status} for ${pathAndQuery}\n${text.slice(0, 600)}`);
    process.exit(1);
  }
  return { res, text };
}

async function openApi() {
  const { text } = await get('/rest/v1/');
  return JSON.parse(text);
}

if (args.list) {
  const spec = await openApi();
  const names = Object.keys(spec.definitions || {}).sort();
  console.log(`${names.length} tables/views exposed by PostgREST:\n`);
  for (const n of names) console.log('  ' + n);
  process.exit(0);
}

if (args.columns) {
  const spec = await openApi();
  const def = (spec.definitions || {})[args.columns];
  if (!def) {
    console.error(`No such table/view: ${args.columns}. Run --list to see what exists.`);
    process.exit(1);
  }
  console.log(`${args.columns}:\n`);
  for (const [col, meta] of Object.entries(def.properties || {})) {
    const pk = /Primary Key/i.test(meta.description || '') ? '  [pk]' : '';
    console.log(`  ${col.padEnd(34)} ${(meta.format || meta.type || '?').padEnd(28)}${pk}`);
  }
  process.exit(0);
}

if (args.rpc) {
  const res = await fetch(`${url}/rest/v1/rpc/${args.rpc}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: args.body || '{}',
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status}\n${text.slice(0, 600)}`); process.exit(1); }
  console.log(text);
  process.exit(0);
}

if (!args.table) {
  console.error('Nothing to do. Try --list, --columns <table>, or --table <table> --select <cols>.');
  process.exit(1);
}

const select = args.select || '*';
const filter = args.filter ? '&' + args.filter : '';
const order = args.order ? `&order=${args.order}` : '';

if (args.count) {
  const { res } = await get(
    `/rest/v1/${args.table}?select=${encodeURIComponent(select)}${filter}&limit=1`,
    { Prefer: 'count=exact', Range: '0-0' }
  );
  console.log(`${args.table}: ${(res.headers.get('content-range') || '?').split('/')[1]} rows`);
  process.exit(0);
}

if (args.all) {
  // PostgREST caps a response at 1000 rows, so page explicitly. Ordering matters: without a stable
  // order, paging can repeat or skip rows.
  const page = 1000;
  const rows = [];
  const stableOrder = args.order || 'id.asc';
  for (let offset = 0; ; offset += page) {
    const { text } = await get(
      `/rest/v1/${args.table}?select=${encodeURIComponent(select)}${filter}&order=${stableOrder}` +
      `&limit=${page}&offset=${offset}`
    );
    const batch = JSON.parse(text);
    rows.push(...batch);
    process.stderr.write(`\r  fetched ${rows.length} rows...`);
    if (batch.length < page) break;
  }
  process.stderr.write('\n');
  const out = args.out || null;
  if (out) {
    fs.writeFileSync(out, JSON.stringify(rows));
    console.log(`${rows.length} rows -> ${out}`);
  } else {
    console.log(JSON.stringify(rows));
  }
  process.exit(0);
}

const limit = args.limit || 20;
const { text } = await get(
  `/rest/v1/${args.table}?select=${encodeURIComponent(select)}${filter}${order}&limit=${limit}`
);
console.log(text);
