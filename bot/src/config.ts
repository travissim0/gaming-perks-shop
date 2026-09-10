import 'dotenv/config';

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing environment variable ${name} (see bot/.env.example)`);
    process.exit(1);
  }
  return v;
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
