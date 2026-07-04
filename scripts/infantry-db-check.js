// Quick connectivity test for the Infantry game database.
// Usage: node scripts/infantry-db-check.js
// Reads INFANTRY_DB_* from .env.local, connects, prints server info,
// detected tables, and 3 sample accounts. Read-only.

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadEnvLocal();
  const { INFANTRY_DB_HOST, INFANTRY_DB_PORT, INFANTRY_DB_USER, INFANTRY_DB_PASSWORD, INFANTRY_DB_NAME } =
    process.env;
  if (!INFANTRY_DB_HOST || !INFANTRY_DB_USER || !INFANTRY_DB_PASSWORD) {
    console.error('Missing config. Add to .env.local:');
    console.error('  INFANTRY_DB_HOST=...');
    console.error('  INFANTRY_DB_PORT=...');
    console.error('  INFANTRY_DB_USER=...');
    console.error('  INFANTRY_DB_PASSWORD=...');
    console.error('  INFANTRY_DB_NAME=...   (optional; omit to use the login default)');
    process.exit(1);
  }

  const config = {
    server: INFANTRY_DB_HOST,
    port: parseInt(INFANTRY_DB_PORT || '1433', 10),
    user: INFANTRY_DB_USER,
    password: INFANTRY_DB_PASSWORD,
    options: { encrypt: process.env.INFANTRY_DB_ENCRYPT === 'true', trustServerCertificate: true },
    connectionTimeout: 10000,
    requestTimeout: 15000,
  };
  if (INFANTRY_DB_NAME) config.database = INFANTRY_DB_NAME;

  console.log(`Connecting to ${config.server}:${config.port} as ${config.user}...`);
  const pool = await new sql.ConnectionPool(config).connect();
  console.log('✅ Connected.\n');

  const info = await pool.request().query('SELECT @@VERSION AS v, DB_NAME() AS db');
  console.log('Server :', String(info.recordset[0].v).split('\n')[0].trim());
  console.log('DB     :', info.recordset[0].db);

  const dbs = await pool.request().query('SELECT name FROM sys.databases ORDER BY name');
  console.log('All DBs:', dbs.recordset.map((r) => r.name).join(', '));

  const tables = await pool
    .request()
    .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`);
  console.log('\nTables in current DB:');
  console.log(' ', tables.recordset.map((r) => r.TABLE_NAME).join(', ') || '(none)');

  const accountsTable = tables.recordset
    .map((r) => r.TABLE_NAME)
    .find((t) => t.toLowerCase() === 'accounts' || t.toLowerCase() === 'account');
  if (accountsTable) {
    const idCol = accountsTable.toLowerCase() === 'accounts' ? 'AccountId' : 'id';
    const sample = await pool
      .request()
      .query(
        `SELECT TOP 3 [${idCol}] AS id, [Name] AS name, [Email] AS email, [LastAccess] AS lastAccess FROM [${accountsTable}] ORDER BY [${idCol}] DESC`
      );
    console.log(`\nNewest 3 rows in ${accountsTable}:`);
    for (const r of sample.recordset) {
      console.log(`  #${r.id}  ${r.name}  <${r.email}>  last access ${r.lastAccess}`);
    }
  } else {
    console.log('\n⚠️ No account/Accounts table in this DB — set INFANTRY_DB_NAME to the right database from the list above.');
  }

  await pool.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
