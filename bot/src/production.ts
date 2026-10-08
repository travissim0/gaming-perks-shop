import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Guild } from 'discord.js';
import { config } from './config.js';
import { db } from './db.js';

/**
 * Production Team (Discord role) → Commentator (freeinf.org CTF role).
 *
 * Discord is the source here: anyone holding the Production Team role whose
 * Discord is linked on freeinf.org and who has no CTF role yet becomes a
 * Commentator on the site, which lets them sign up as commentator (and
 * recorder) on any match. Someone who already holds another CTF role
 * (referee, admin, …) is left alone and reported to staff, since the site has
 * no combined value for that.
 *
 * The bot only ever takes Commentator away from people it gave it to (kept in
 * .production-state.json), so a Commentator set by hand on the site without
 * the Discord role is never touched.
 */

const COMMENTATOR = 'ctf_commentator';
const STATE_FILE = join(process.cwd(), '.production-state.json');

interface State { granted: string[] } // profile ids the bot set to Commentator

function loadState(): State {
  try {
    if (existsSync(STATE_FILE)) {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      return { granted: Array.isArray(s.granted) ? s.granted : [] };
    }
  } catch (e: any) {
    console.warn('production: could not read state file:', e?.message || e);
  }
  return { granted: [] };
}

function saveState(s: State) {
  try { writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e: any) { console.warn('production: could not write state file:', e?.message || e); }
}

const state = loadState();
const hasRole = (r: string | null | undefined) => !!r && r !== 'none';

/** Returns report lines for the staff channel plus the unlinked holders' display names. */
export async function syncProduction(guild: Guild): Promise<{ lines: string[]; unlinked: string[] }> {
  const lines: string[] = [];
  const unlinked: string[] = [];
  if (!config.productionRoleId) return { lines, unlinked };
  const role = guild.roles.cache.get(config.productionRoleId) ?? (await guild.roles.fetch(config.productionRoleId).catch(() => null));
  if (!role) { console.warn(`production role ${config.productionRoleId} not found`); return { lines, unlinked }; }

  const holders = [...role.members.values()].filter((m) => !m.user.bot);
  const ids = holders.map((m) => m.id);
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, in_game_alias, discord_id, ctf_role').in('discord_id', ids)
    : { data: [] as any[] };
  const byDiscord = new Map<string, { id: string; alias: string; ctfRole: string | null }>();
  (profiles || []).forEach((p: any) => byDiscord.set(String(p.discord_id), { id: p.id, alias: p.in_game_alias || 'Unknown', ctfRole: p.ctf_role ?? null }));

  const granted = new Set(state.granted);
  const stillHolding = new Set<string>(); // profile ids with the role right now

  for (const m of holders) {
    const p = byDiscord.get(m.id);
    if (!p) { unlinked.push(m.displayName); continue; }
    stillHolding.add(p.id);
    if (!hasRole(p.ctfRole)) {
      if (!config.dryRun) {
        const { error } = await db.from('profiles').update({ ctf_role: COMMENTATOR }).eq('id', p.id);
        if (error) { console.warn(`could not set ${p.alias} to commentator: ${error.message}`); continue; }
      }
      granted.add(p.id);
      lines.push(`Production Team: ${p.alias} is now a Commentator on freeinf.org`);
    } else if (!p.ctfRole!.includes('commentator') && !granted.has(p.id)) {
      // Only mention it once per person while they hold both.
      if (!state.granted.includes(`noted:${p.id}`)) {
        lines.push(`Production Team: ${p.alias} already has the site role **${p.ctfRole}** — set Commentator by hand if they should have both`);
        granted.add(`noted:${p.id}`);
      }
    }
  }

  // People the bot made Commentator who no longer hold the Discord role → back to none.
  for (const key of [...granted]) {
    if (key.startsWith('noted:')) { if (!stillHolding.has(key.slice(6))) granted.delete(key); continue; }
    if (stillHolding.has(key)) continue;
    const { data: p } = await db.from('profiles').select('in_game_alias, ctf_role').eq('id', key).maybeSingle();
    if (p && (p as any).ctf_role === COMMENTATOR && !config.dryRun) {
      const { error } = await db.from('profiles').update({ ctf_role: 'none' }).eq('id', key);
      if (error) { console.warn(`could not clear commentator for ${key}: ${error.message}`); continue; }
      lines.push(`Production Team: ${(p as any).in_game_alias || key} lost the Discord role — no longer a Commentator on freeinf.org`);
    }
    granted.delete(key);
  }

  const next = [...granted];
  if (next.join('|') !== state.granted.join('|')) { state.granted = next; saveState(state); }
  return { lines, unlinked };
}
