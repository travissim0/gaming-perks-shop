import { config } from './config.js';

/**
 * Squad trades complete or escalate on a clock (the 12-hour appeal window). The site works that out
 * when asked, so the bot asks every few minutes: POST /api/squads/trades/run-due, authenticated with
 * the service key both sides hold. Nothing is logged unless something changed or failed.
 */
const SITE = process.env.SITE_URL || 'https://www.freeinf.org';

export async function runDueTrades(): Promise<void> {
  try {
    const res = await fetch(`${SITE}/api/squads/trades/run-due`, { method: 'POST', headers: { Authorization: `Bearer ${config.supabaseKey}` } });
    if (!res.ok) { console.error(`trades: run-due answered ${res.status}`); return; }
    const j = (await res.json()) as { pending_sql?: boolean; checked?: number; changed?: string[] };
    if (j.changed?.length) console.log(`trades: ${j.changed.join('; ')}`);
  } catch (e: any) {
    console.error('trades: run-due failed:', e?.message || e);
  }
}
