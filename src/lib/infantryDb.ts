import sql from 'mssql';
import { randomBytes } from 'crypto';

// Server-only access to the Infantry Online game database (MS SQL Server).
// Credentials come from .env.local (INFANTRY_DB_*) and never reach the client.
//
// The live DB may use either the classic InfServer schema (account/alias, singular)
// or the newer EF Core schema (Accounts/Aliases, PascalCase plural). Table and the
// few genuinely different column names are detected once from INFORMATION_SCHEMA
// and cached alongside the pool.

export interface InfantrySchema {
  flavor: 'ef' | 'classic';
  t: {
    accounts: string;
    aliases: string;
    bans: string | null;
    resetTokens: string | null;
    zones: string | null;
    helpcalls: string | null;
    histories: string | null;
    squads: string | null;
    players: string | null;
  };
  acc: {
    id: string;
    name: string;
    email: string;
    dateCreated: string;
    lastAccess: string;
    permission: string;
    silencedAt: string | null;
    silencedDuration: string | null;
  };
  ali: {
    id: string;
    accountId: string;
    name: string;
    creation: string;
    lastAccess: string;
    timePlayed: string;
    ip: string;
    stealth: string | null;
  };
  rt: {
    id: string;
    accountId: string;
    name: string;
    token: string;
    expireDate: string;
    tokenUsed: string;
  } | null;
  bn: {
    id: string;
    accountId: string;
    type: string;
    reason: string;
    name: string;
    ip: string;
    zone: string;
    created: string;
    expires: string;
  } | null;
}

interface InfantryDb {
  pool: sql.ConnectionPool;
  schema: InfantrySchema;
}

const g = globalThis as unknown as {
  __infantryDb?: InfantryDb | null;
  __infantryDbPromise?: Promise<InfantryDb> | null;
};

function buildConfig(): sql.config {
  const host = process.env.INFANTRY_DB_HOST;
  const user = process.env.INFANTRY_DB_USER;
  const password = process.env.INFANTRY_DB_PASSWORD;
  if (!host || !user || !password) {
    throw new Error(
      'Infantry DB is not configured. Set INFANTRY_DB_HOST, INFANTRY_DB_PORT, INFANTRY_DB_USER and INFANTRY_DB_PASSWORD in .env.local (INFANTRY_DB_NAME optional).'
    );
  }
  const config: sql.config = {
    server: host,
    port: parseInt(process.env.INFANTRY_DB_PORT || '1433', 10),
    user,
    password,
    options: {
      // Old game-era SQL Server installs typically have no valid TLS cert
      encrypt: process.env.INFANTRY_DB_ENCRYPT === 'true',
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 10000,
    requestTimeout: 20000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  };
  if (process.env.INFANTRY_DB_NAME) {
    config.database = process.env.INFANTRY_DB_NAME;
  }
  return config;
}

async function detectSchema(pool: sql.ConnectionPool): Promise<InfantrySchema> {
  const tRes = await pool
    .request()
    .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
  const tables = new Map<string, string>();
  for (const r of tRes.recordset) tables.set(String(r.TABLE_NAME).toLowerCase(), String(r.TABLE_NAME));

  const pickTable = (...candidates: string[]) => {
    for (const c of candidates) {
      const hit = tables.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };

  const accounts = pickTable('Accounts', 'account');
  const aliases = pickTable('Aliases', 'alias');
  const resetTokens = pickTable('ResetTokens', 'resetToken', 'resettokens');
  const bans = pickTable('Bans', 'ban');
  if (!accounts || !aliases) {
    throw new Error(
      `Could not locate account/alias tables in this database. Tables found: ${[...tables.values()].join(', ') || '(none)'}. ` +
        'Check INFANTRY_DB_NAME points at the Infantry database.'
    );
  }

  // Fetch columns for every table we care about in one query, routed by name.
  const wanted: Record<string, string | null> = { acc: accounts, ali: aliases, rt: resetTokens, bn: bans };
  const colReq = pool.request();
  const paramNames: string[] = [];
  let pIdx = 0;
  for (const tbl of Object.values(wanted)) {
    if (!tbl) continue;
    const p = `p${pIdx++}`;
    colReq.input(p, tbl);
    paramNames.push(`@${p}`);
  }
  const colRes = await colReq.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (${paramNames.join(', ')})`
  );
  const accCols = new Map<string, string>();
  const aliCols = new Map<string, string>();
  const rtCols = new Map<string, string>();
  const bnCols = new Map<string, string>();
  for (const r of colRes.recordset) {
    const tn = String(r.TABLE_NAME);
    const target =
      tn === accounts ? accCols : tn === aliases ? aliCols : resetTokens && tn === resetTokens ? rtCols : bnCols;
    target.set(String(r.COLUMN_NAME).toLowerCase(), String(r.COLUMN_NAME));
  }

  const col = (cols: Map<string, string>, table: string, ...candidates: string[]) => {
    for (const c of candidates) {
      const hit = cols.get(c.toLowerCase());
      if (hit) return hit;
    }
    throw new Error(`Could not find column ${candidates.join('/')} on table ${table}`);
  };
  const optCol = (cols: Map<string, string>, ...candidates: string[]) => {
    for (const c of candidates) {
      const hit = cols.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };

  return {
    flavor: accounts.toLowerCase() === 'accounts' ? 'ef' : 'classic',
    t: {
      accounts,
      aliases,
      bans,
      resetTokens,
      zones: pickTable('Zones', 'zone'),
      helpcalls: pickTable('Helpcalls', 'helps', 'helpcall'),
      histories: pickTable('Histories', 'history'),
      squads: pickTable('Squads', 'squad'),
      players: pickTable('Players', 'player'),
    },
    acc: {
      id: col(accCols, accounts, 'AccountId', 'id'),
      name: col(accCols, accounts, 'Name'),
      email: col(accCols, accounts, 'Email'),
      dateCreated: col(accCols, accounts, 'DateCreated'),
      lastAccess: col(accCols, accounts, 'LastAccess'),
      permission: col(accCols, accounts, 'Permission'),
      silencedAt: optCol(accCols, 'SilencedAtMillisecondsUnix'),
      silencedDuration: optCol(accCols, 'SilencedDuration'),
    },
    ali: {
      id: col(aliCols, aliases, 'AliasId', 'id'),
      accountId: col(aliCols, aliases, 'AccountId', 'account'),
      name: col(aliCols, aliases, 'Name'),
      creation: col(aliCols, aliases, 'Creation'),
      lastAccess: col(aliCols, aliases, 'LastAccess'),
      timePlayed: col(aliCols, aliases, 'TimePlayed'),
      ip: col(aliCols, aliases, 'IpAddress', 'IPAddress', 'ip'),
      stealth: optCol(aliCols, 'Stealth'),
    },
    rt: resetTokens
      ? {
          id: col(rtCols, resetTokens, 'ResetTokenId', 'id'),
          accountId: col(rtCols, resetTokens, 'AccountId', 'account'),
          name: col(rtCols, resetTokens, 'Name'),
          token: col(rtCols, resetTokens, 'Token'),
          expireDate: col(rtCols, resetTokens, 'ExpireDate', 'expireDate'),
          tokenUsed: col(rtCols, resetTokens, 'TokenUsed', 'tokenUsed'),
        }
      : null,
    bn: bans
      ? {
          id: col(bnCols, bans, 'BanId', 'id'),
          accountId: col(bnCols, bans, 'AccountId', 'account'),
          type: col(bnCols, bans, 'Type', 'type'),
          reason: col(bnCols, bans, 'Reason', 'reason'),
          name: col(bnCols, bans, 'Name', 'name'),
          ip: col(bnCols, bans, 'IpAddress', 'IPAddress', 'ip'),
          zone: col(bnCols, bans, 'ZoneId', 'zone'),
          created: col(bnCols, bans, 'Created', 'created'),
          expires: col(bnCols, bans, 'Expires', 'expires'),
        }
      : null,
  };
}

export async function getInfantryDb(): Promise<InfantryDb> {
  if (g.__infantryDb?.pool.connected) return g.__infantryDb;
  if (g.__infantryDbPromise) return g.__infantryDbPromise;

  g.__infantryDbPromise = (async () => {
    const pool = new sql.ConnectionPool(buildConfig());
    pool.on('error', (err) => {
      console.error('Infantry DB pool error:', err?.message);
      g.__infantryDb = null;
    });
    await pool.connect();
    const schema = await detectSchema(pool);
    const db = { pool, schema };
    g.__infantryDb = db;
    return db;
  })();

  try {
    return await g.__infantryDbPromise;
  } catch (err) {
    g.__infantryDb = null;
    throw err;
  } finally {
    g.__infantryDbPromise = null;
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[[\]%_]/g, (m) => `[${m}]`);
}

/**
 * Validates that a free-form query is a single read-only SELECT.
 * Throws with a human-readable reason otherwise.
 */
export function assertReadOnlySql(input: string): string {
  let s = input
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
  if (!s) throw new Error('Query is empty');
  s = s.replace(/;+\s*$/, '');
  if (s.includes(';')) throw new Error('Only a single statement is allowed (no semicolons)');
  if (!/^(select|with)\b/i.test(s)) throw new Error('Only SELECT queries are allowed');
  const forbidden =
    /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|shutdown|dbcc|kill|waitfor|openrowset|opendatasource|openquery|into)\b|\b(xp_|sp_)\w+/i;
  const match = s.match(forbidden);
  if (match) throw new Error(`Query blocked: contains "${match[0]}" (read-only console)`);
  return s;
}

function cleanValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  if (Buffer.isBuffer(v)) return `[binary ${v.length}b]`;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
}

export interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

/**
 * Runs a query under READ UNCOMMITTED with a short lock timeout so admin
 * queries can never block the live game servers, streaming rows so runaway
 * result sets are cancelled at maxRows instead of buffered.
 */
export async function runReadQuery(
  sqlText: string,
  opts: { params?: Record<string, string | number>; maxRows?: number } = {}
): Promise<QueryResult> {
  const maxRows = opts.maxRows ?? 500;
  const { pool } = await getInfantryDb();
  const request = pool.request();
  request.stream = true;
  for (const [key, value] of Object.entries(opts.params ?? {})) {
    request.input(key, value);
  }

  const prefixed = `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSET LOCK_TIMEOUT 5000;\n${sqlText}`;
  const started = Date.now();

  return new Promise<QueryResult>((resolve, reject) => {
    let columns: string[] = [];
    const rows: (string | number | boolean | null)[][] = [];
    let truncated = false;
    let settled = false;

    request.on('recordset', (cols: Record<string, unknown>) => {
      columns = Object.keys(cols);
    });
    request.on('row', (row: Record<string, unknown>) => {
      if (rows.length < maxRows) {
        rows.push(columns.map((c) => cleanValue(row[c])));
      } else if (!truncated) {
        truncated = true;
        request.cancel();
      }
    });
    request.on('error', (err: Error & { code?: string }) => {
      if (truncated && err.code === 'ECANCEL') return;
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    request.on('done', () => {
      if (!settled) {
        settled = true;
        resolve({ columns, rows, rowCount: rows.length, truncated, ms: Date.now() - started });
      }
    });
    request.query(prefixed);
  });
}

// ---------------------------------------------------------------------------
// Account lookup / email update
// ---------------------------------------------------------------------------

export interface InfantryAlias {
  aliasId: number;
  name: string;
  creation: string | null;
  lastAccess: string | null;
  timePlayedMinutes: number;
  ip: string | null;
  stealth: boolean;
}

export interface InfantryBan {
  banId: number;
  type: number;
  typeLabel: string;
  reason: string | null;
  name: string | null;
  ip: string | null;
  zone: number | null;
  created: string | null;
  expires: string | null;
  active: boolean;
}

export interface InfantryAccount {
  accountId: number;
  name: string;
  email: string;
  dateCreated: string | null;
  lastAccess: string | null;
  permission: number;
  silenced: boolean;
  aliases: InfantryAlias[];
  bans: InfantryBan[];
}

// Infantry BanType enum: None=0, ZoneBan=1, AccountBan=2, IPBan=3, GlobalBan=4
const BAN_TYPE_LABELS: Record<number, string> = {
  0: 'none',
  1: 'zone',
  2: 'account',
  3: 'IP',
  4: 'global',
};

export type LookupType = 'auto' | 'account' | 'alias' | 'email';

export async function lookupAccounts(query: string, type: LookupType): Promise<InfantryAccount[]> {
  const { pool, schema } = await getInfantryDb();
  const { t, acc, ali, bn } = schema;
  const pattern = `%${escapeLike(query)}%`;

  const parts: string[] = [];
  if (type === 'auto' || type === 'account') {
    parts.push(`SELECT [${acc.id}] AS id FROM [${t.accounts}] WHERE [${acc.name}] LIKE @q`);
  }
  if (type === 'auto' || type === 'email') {
    parts.push(`SELECT [${acc.id}] AS id FROM [${t.accounts}] WHERE [${acc.email}] LIKE @q`);
  }
  if (type === 'auto' || type === 'alias') {
    parts.push(`SELECT [${ali.accountId}] AS id FROM [${t.aliases}] WHERE [${ali.name}] LIKE @q`);
  }

  const idRes = await pool
    .request()
    .input('q', pattern)
    .query(`SELECT DISTINCT TOP 25 u.id FROM (${parts.join(' UNION ')}) u ORDER BY u.id DESC`);
  const ids: number[] = idRes.recordset.map((r: { id: number }) => Number(r.id)).filter(Number.isFinite);
  if (ids.length === 0) return [];
  const idList = ids.join(',');

  const silencedSelect =
    acc.silencedAt && acc.silencedDuration
      ? `, [${acc.silencedAt}] AS silencedAt, [${acc.silencedDuration}] AS silencedDuration`
      : '';
  const accRes = await pool.request().query(
    `SELECT [${acc.id}] AS accountId, [${acc.name}] AS name, [${acc.email}] AS email,
            [${acc.dateCreated}] AS dateCreated, [${acc.lastAccess}] AS lastAccess,
            [${acc.permission}] AS permission${silencedSelect}
     FROM [${t.accounts}] WHERE [${acc.id}] IN (${idList})`
  );

  const stealthSelect = ali.stealth ? `, [${ali.stealth}] AS stealth` : '';
  const aliRes = await pool.request().query(
    `SELECT [${ali.id}] AS aliasId, [${ali.accountId}] AS accountId, [${ali.name}] AS name,
            [${ali.creation}] AS creation, [${ali.lastAccess}] AS lastAccess,
            [${ali.timePlayed}] AS timePlayed, [${ali.ip}] AS ip${stealthSelect}
     FROM [${t.aliases}] WHERE [${ali.accountId}] IN (${idList})
     ORDER BY [${ali.lastAccess}] DESC`
  );

  const aliasesByAccount = new Map<number, InfantryAlias[]>();
  for (const r of aliRes.recordset) {
    const list = aliasesByAccount.get(Number(r.accountId)) ?? [];
    list.push({
      aliasId: Number(r.aliasId),
      name: String(r.name),
      creation: (cleanValue(r.creation) as string) ?? null,
      lastAccess: (cleanValue(r.lastAccess) as string) ?? null,
      timePlayedMinutes: Number(r.timePlayed) || 0,
      ip: r.ip ? String(r.ip) : null,
      stealth: Boolean(r.stealth),
    });
    aliasesByAccount.set(Number(r.accountId), list);
  }

  // Bans for the matched accounts (active ones first), if the table exists
  const bansByAccount = new Map<number, InfantryBan[]>();
  if (bn && t.bans) {
    const banRes = await pool.request().query(
      `SELECT [${bn.id}] AS banId, [${bn.accountId}] AS accountId, [${bn.type}] AS type,
              [${bn.reason}] AS reason, [${bn.name}] AS name, [${bn.ip}] AS ip, [${bn.zone}] AS zone,
              CONVERT(varchar(19), [${bn.created}], 120) AS created,
              CONVERT(varchar(19), [${bn.expires}], 120) AS expires,
              CASE WHEN [${bn.expires}] > GETDATE() THEN 1 ELSE 0 END AS active
       FROM [${t.bans}] WHERE [${bn.accountId}] IN (${idList}) ORDER BY [${bn.id}] DESC`
    );
    for (const r of banRes.recordset) {
      const list = bansByAccount.get(Number(r.accountId)) ?? [];
      const type = Number(r.type) || 0;
      list.push({
        banId: Number(r.banId),
        type,
        typeLabel: BAN_TYPE_LABELS[type] ?? `type ${type}`,
        reason: r.reason ? String(r.reason) : null,
        name: r.name ? String(r.name) : null,
        ip: r.ip ? String(r.ip) : null,
        zone: r.zone != null ? Number(r.zone) : null,
        created: (cleanValue(r.created) as string) ?? null,
        expires: (cleanValue(r.expires) as string) ?? null,
        active: Boolean(r.active),
      });
      bansByAccount.set(Number(r.accountId), list);
    }
  }

  const accounts: InfantryAccount[] = accRes.recordset.map((r: Record<string, unknown>) => ({
    accountId: Number(r.accountId),
    name: String(r.name),
    email: String(r.email ?? ''),
    dateCreated: (cleanValue(r.dateCreated) as string) ?? null,
    lastAccess: (cleanValue(r.lastAccess) as string) ?? null,
    permission: Number(r.permission) || 0,
    silenced: Number(r.silencedAt ?? 0) > 0 && Number(r.silencedDuration ?? 0) > 0,
    aliases: aliasesByAccount.get(Number(r.accountId)) ?? [],
    bans: bansByAccount.get(Number(r.accountId)) ?? [],
  }));

  // Newest accounts first (matches the id ordering used for the TOP 25 cut)
  accounts.sort((a, b) => b.accountId - a.accountId);
  return accounts;
}

export async function updateAccountEmail(
  accountId: number,
  newEmail: string
): Promise<{ accountName: string; oldEmail: string; newEmail: string }> {
  const { pool, schema } = await getInfantryDb();
  const { t, acc } = schema;

  const current = await pool
    .request()
    .input('id', accountId)
    .query(
      `SELECT [${acc.name}] AS name, [${acc.email}] AS email FROM [${t.accounts}] WHERE [${acc.id}] = @id`
    );
  if (current.recordset.length === 0) {
    throw new Error(`Account ${accountId} not found`);
  }
  const { name, email: oldEmail } = current.recordset[0];

  await pool
    .request()
    .input('id', accountId)
    .input('email', newEmail)
    .query(`UPDATE [${t.accounts}] SET [${acc.email}] = @email WHERE [${acc.id}] = @id`);

  return { accountName: String(name), oldEmail: String(oldEmail ?? ''), newEmail };
}

export interface ResetToken {
  accountName: string;
  email: string;
  token: string;
  expireDate: string;
}

/**
 * Reproduces the Infantry account server's password-reset flow: inserts one new
 * row into the reset-token table (append-only — never touches existing rows) and
 * returns the generated token so the caller can email the reset link.
 *
 * The token matches the live format exactly: base64 of 8 random bytes (12 chars).
 * Expiry is computed with the SQL server's own clock (DATEADD/GETDATE) so it can't
 * drift due to timezone differences between the web host and the DB box.
 */
export async function createResetToken(accountId: number): Promise<ResetToken> {
  const { pool, schema } = await getInfantryDb();
  const { t, acc, rt } = schema;
  if (!t.resetTokens || !rt) {
    throw new Error('This database has no reset-token table');
  }

  const accRes = await pool
    .request()
    .input('id', accountId)
    .query(`SELECT [${acc.name}] AS name, [${acc.email}] AS email FROM [${t.accounts}] WHERE [${acc.id}] = @id`);
  if (accRes.recordset.length === 0) throw new Error(`Account ${accountId} not found`);
  const name = String(accRes.recordset[0].name);
  const email = String(accRes.recordset[0].email ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Account has no valid email address on file');
  }

  const token = randomBytes(8).toString('base64'); // 12-char base64, matches live tokens
  const ttlHours = Math.max(1, parseInt(process.env.INFANTRY_RESET_TTL_HOURS || '24', 10) || 24);

  const ins = await pool
    .request()
    .input('account', accountId)
    .input('name', name)
    .input('token', token)
    .input('ttl', ttlHours)
    .query(
      `INSERT INTO [${t.resetTokens}] ([${rt.accountId}], [${rt.name}], [${rt.token}], [${rt.expireDate}], [${rt.tokenUsed}])
       OUTPUT CONVERT(varchar(19), INSERTED.[${rt.expireDate}], 120) AS expireDate
       VALUES (@account, @name, @token, DATEADD(HOUR, @ttl, GETDATE()), 0)`
    );

  return { accountName: name, email, token, expireDate: String(ins.recordset[0].expireDate) };
}

export interface ResetHistoryEntry {
  tokenId: number;
  token: string;
  expireDate: string | null;
  used: boolean;
  status: 'used' | 'expired' | 'active';
}

/**
 * Recent reset tokens for an account, newest first, with status computed from
 * the SQL server's own clock (so "expired" matches how the reset page judges it).
 */
export async function getResetHistory(accountId: number, limit = 10): Promise<ResetHistoryEntry[]> {
  const { pool, schema } = await getInfantryDb();
  const { t, rt } = schema;
  if (!t.resetTokens || !rt) return [];

  const res = await pool
    .request()
    .input('account', accountId)
    .input('limit', Math.min(Math.max(limit, 1), 50))
    .query(
      `SELECT TOP (@limit) [${rt.id}] AS tokenId, [${rt.token}] AS token,
              CONVERT(varchar(19), [${rt.expireDate}], 120) AS expireDate,
              [${rt.tokenUsed}] AS used,
              CASE WHEN [${rt.tokenUsed}] = 1 THEN 'used'
                   WHEN [${rt.expireDate}] < GETDATE() THEN 'expired'
                   ELSE 'active' END AS status
       FROM [${t.resetTokens}] WHERE [${rt.accountId}] = @account ORDER BY [${rt.id}] DESC`
    );

  return res.recordset.map((r: Record<string, unknown>) => ({
    tokenId: Number(r.tokenId),
    token: String(r.token ?? ''),
    expireDate: (cleanValue(r.expireDate) as string) ?? null,
    used: Boolean(r.used),
    status: r.status as ResetHistoryEntry['status'],
  }));
}

// ---------------------------------------------------------------------------
// Canned admin queries
// ---------------------------------------------------------------------------

export interface CannedQuery {
  key: string;
  label: string;
  description: string;
  category: 'Emails & Resets' | 'Accounts' | 'Alts & IPs' | 'Moderation';
  /** When present the UI shows an input; the value is bound as @p (LIKE pattern). */
  param?: { label: string; placeholder: string };
  sql: string;
}

export function getCannedQueries(schema: InfantrySchema): CannedQuery[] {
  const { t, acc, ali } = schema;
  const A = `[${t.accounts}]`;
  const L = `[${t.aliases}]`;
  const queries: CannedQuery[] = [
    {
      key: 'recent-accounts',
      category: 'Accounts',
      label: 'Newest accounts',
      description: 'Last 50 accounts created',
      sql: `SELECT TOP 50 [${acc.id}] AS accountId, [${acc.name}] AS account, [${acc.email}] AS email, [${acc.dateCreated}] AS created, [${acc.lastAccess}] AS lastAccess FROM ${A} ORDER BY [${acc.dateCreated}] DESC`,
    },
    {
      key: 'recently-active',
      category: 'Accounts',
      label: 'Recently active accounts',
      description: 'Last 50 accounts by last access',
      sql: `SELECT TOP 50 [${acc.id}] AS accountId, [${acc.name}] AS account, [${acc.email}] AS email, [${acc.lastAccess}] AS lastAccess FROM ${A} ORDER BY [${acc.lastAccess}] DESC`,
    },
    {
      key: 'duplicate-emails',
      category: 'Emails & Resets',
      label: 'Duplicate emails',
      description: 'Email addresses shared by more than one account',
      sql: `SELECT TOP 200 [${acc.email}] AS email, COUNT(*) AS accounts FROM ${A} WHERE [${acc.email}] <> '' GROUP BY [${acc.email}] HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC`,
    },
    {
      key: 'broken-emails',
      category: 'Emails & Resets',
      label: 'Unusable emails',
      description: "Accounts whose email can't receive a password reset (blank, no @, or placeholder)",
      sql: `SELECT TOP 500 [${acc.id}] AS accountId, [${acc.name}] AS account, [${acc.email}] AS email, [${acc.lastAccess}] AS lastAccess FROM ${A} WHERE [${acc.email}] = '' OR [${acc.email}] NOT LIKE '%@%.%' OR [${acc.email}] LIKE 'none@%' OR [${acc.email}] LIKE '%nowhere%' ORDER BY [${acc.lastAccess}] DESC`,
    },
    {
      key: 'top-playtime',
      category: 'Accounts',
      label: 'Top playtime aliases',
      description: 'Top 50 aliases by total time played',
      sql: `SELECT TOP 50 l.[${ali.name}] AS alias, a.[${acc.name}] AS account, l.[${ali.timePlayed}] AS minutesPlayed, l.[${ali.lastAccess}] AS lastAccess FROM ${L} l JOIN ${A} a ON a.[${acc.id}] = l.[${ali.accountId}] ORDER BY l.[${ali.timePlayed}] DESC`,
    },
    {
      key: 'alias-ips',
      category: 'Alts & IPs',
      label: 'Alias IP lookup',
      description: 'IPs and account for aliases matching a name',
      param: { label: 'Alias name', placeholder: 'e.g. Soriddo' },
      sql: `SELECT TOP 100 l.[${ali.name}] AS alias, a.[${acc.name}] AS account, a.[${acc.email}] AS email, l.[${ali.ip}] AS ip, l.[${ali.lastAccess}] AS lastAccess FROM ${L} l JOIN ${A} a ON a.[${acc.id}] = l.[${ali.accountId}] WHERE l.[${ali.name}] LIKE @p ORDER BY l.[${ali.lastAccess}] DESC`,
    },
    {
      key: 'ip-aliases',
      category: 'Alts & IPs',
      label: 'IP alias lookup',
      description: 'Aliases seen from an IP (prefix match)',
      param: { label: 'IP or prefix', placeholder: 'e.g. 24.16.' },
      sql: `SELECT TOP 200 l.[${ali.ip}] AS ip, l.[${ali.name}] AS alias, a.[${acc.name}] AS account, l.[${ali.lastAccess}] AS lastAccess FROM ${L} l JOIN ${A} a ON a.[${acc.id}] = l.[${ali.accountId}] WHERE l.[${ali.ip}] LIKE @p ORDER BY l.[${ali.lastAccess}] DESC`,
    },
    {
      key: 'shared-ip-alts',
      category: 'Alts & IPs',
      label: 'Possible alts (shared IPs)',
      description: 'Other aliases that share an IP with the named alias',
      param: { label: 'Alias name', placeholder: 'exact or partial alias' },
      sql: `SELECT TOP 200 tgt.[${ali.name}] AS matchedAlias, o.[${ali.name}] AS otherAlias, a2.[${acc.name}] AS otherAccount, o.[${ali.ip}] AS sharedIp, o.[${ali.lastAccess}] AS lastAccess FROM ${L} tgt JOIN ${L} o ON o.[${ali.ip}] = tgt.[${ali.ip}] AND o.[${ali.id}] <> tgt.[${ali.id}] JOIN ${A} a2 ON a2.[${acc.id}] = o.[${ali.accountId}] WHERE tgt.[${ali.name}] LIKE @p AND tgt.[${ali.ip}] IS NOT NULL AND tgt.[${ali.ip}] <> '' ORDER BY o.[${ali.lastAccess}] DESC`,
    },
  ];

  if (t.resetTokens) {
    queries.push({
      key: 'recent-reset-tokens',
      category: 'Emails & Resets',
      label: 'Recent password resets',
      description: 'Latest 50 reset tokens (forgot-password debugging)',
      sql: `SELECT TOP 50 * FROM [${t.resetTokens}] ORDER BY 1 DESC`,
    });
  }
  if (t.bans) {
    queries.push({
      key: 'recent-bans',
      category: 'Moderation',
      label: 'Recent bans',
      description: 'Latest 200 ban entries',
      sql: `SELECT TOP 200 * FROM [${t.bans}] ORDER BY 1 DESC`,
    });
  }
  if (t.zones) {
    queries.push({
      key: 'zones-list',
      category: 'Moderation',
      label: 'Zones',
      description: 'All zone registrations',
      sql: `SELECT TOP 100 * FROM [${t.zones}] ORDER BY 1`,
    });
  }
  if (t.helpcalls) {
    queries.push({
      key: 'recent-helpcalls',
      category: 'Moderation',
      label: 'Recent help calls',
      description: 'Latest 50 ?help calls in-game',
      sql: `SELECT TOP 50 * FROM [${t.helpcalls}] ORDER BY 1 DESC`,
    });
  }
  if (t.histories) {
    queries.push({
      key: 'mod-history',
      category: 'Moderation',
      label: 'Mod command history',
      description: 'Latest 100 mod commands by sender',
      param: { label: 'Sender alias', placeholder: 'mod alias' },
      sql: `SELECT TOP 100 * FROM [${t.histories}] WHERE [Sender] LIKE @p ORDER BY 1 DESC`,
    });
  }
  return queries;
}
