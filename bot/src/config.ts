import 'dotenv/config';

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing environment variable ${name} (see bot/.env.example)`);
    process.exit(1);
  }
  return v;
}

// The bot writes to tables with row security on, so it needs the service-role
// (secret) key. The publishable/anon key reads fine but every write is refused.
const key = need('SUPABASE_SERVICE_ROLE_KEY');
const jwtRole = (() => {
  const p = key.split('.');
  if (p.length !== 3) return null;
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString()).role as string; } catch { return null; }
})();
if (key.startsWith('sb_publishable_') || jwtRole === 'anon') {
  console.error('SUPABASE_SERVICE_ROLE_KEY is the publishable/anon key. Use the service_role secret key (Supabase → Project Settings → API Keys → Secret keys).');
  process.exit(1);
}

export const config = {
  botToken: need('DISCORD_BOT_TOKEN'),
  guildId: need('DISCORD_GUILD_ID'),
  staffChannelId: process.env.DISCORD_STAFF_CHANNEL_ID || null,
  staffRoleId: process.env.DISCORD_STAFF_ROLE_ID || null,
  supabaseUrl: need('SUPABASE_URL'),
  supabaseKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  syncIntervalMs: Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES || 10)) * 60_000,
  dryRun: process.env.DRY_RUN === '1',
};
