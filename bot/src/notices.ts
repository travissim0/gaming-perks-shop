import { EmbedBuilder, type Client, type Guild } from 'discord.js';
import { config } from './config.js';
import { discordIdFor, finishNotice, pendingNotices, type BotNotice } from './db.js';

/**
 * Deliver notices the site queued: a DM to the person, plus a post in
 * #ctf-referee for referee crew changes (or the staff channel when asked).
 */

const ROLE_COLOUR: Record<string, number> = { referee: 0xf59e0b, commentator: 0x22d3ee, recording: 0x8b98b0, player: 0x34d399 };

function embedFor(n: BotNotice): EmbedBuilder {
  const p = n.payload;
  const season = [p.league, p.season_number ? `Season ${p.season_number}` : null, p.stage_label].filter(Boolean).join(' · ');
  const teams = `${p.squad_b || 'TBD'} vs ${p.squad_a || 'TBD'}`; // away vs home, like the arena names
  const when = p.scheduled_at ? `<t:${Math.floor(new Date(p.scheduled_at).getTime() / 1000)}:F> (<t:${Math.floor(new Date(p.scheduled_at).getTime() / 1000)}:R>)` : p.scheduled_et || '';
  const e = new EmbedBuilder().setColor(ROLE_COLOUR[p.role] ?? 0x22d3ee);
  if (n.kind === 'crew_added') {
    e.setTitle(p.self ? `You're signed up as ${p.role_label}` : `${p.by_alias} put you down as ${p.role_label}`);
  } else if (n.kind === 'crew_removed') {
    e.setTitle(p.self ? `You left the ${p.role_label} slot` : `${p.by_alias} took you off as ${p.role_label}`);
  } else {
    e.setTitle(p.title || n.kind);
  }
  e.addFields(
    { name: 'Match', value: `${teams}\n${season}`, inline: false },
    { name: 'When', value: when || '—', inline: false },
  );
  if (p.url) e.setURL(p.url).addFields({ name: 'Match page', value: p.url, inline: false });
  e.setFooter({ text: 'freeinf.org · CTF leagues' });
  return e;
}

function channelLine(n: BotNotice, discordId: string | null): string {
  const p = n.payload;
  const who = discordId ? `<@${discordId}>` : `**${p.target_alias}**`;
  const teams = `${p.squad_b || 'TBD'} vs ${p.squad_a || 'TBD'}`; // away vs home, like the arena names
  const season = [p.league, p.season_number ? `S${p.season_number}` : null, p.stage_label].filter(Boolean).join(' ');
  const when = p.scheduled_at ? `<t:${Math.floor(new Date(p.scheduled_at).getTime() / 1000)}:f>` : p.scheduled_et || '';
  if (n.kind === 'crew_added') return `${who} ${p.self ? 'signed up' : `was assigned by ${p.by_alias}`} as ${p.role_label} · ${season} · ${teams} · ${when} · <${p.url}>`;
  if (n.kind === 'crew_removed') return `${who} ${p.self ? 'stepped down' : `was removed by ${p.by_alias}`} as ${p.role_label} · ${season} · ${teams} · ${when}`;
  // Match time confirmed / moved, and the day-of reminder. The league wants `refs_wanted` referees
  // (two on RS and playoffs, one on FS); that is a target, a match still runs with one.
  const whenLong = p.scheduled_at ? `<t:${Math.floor(new Date(p.scheduled_at).getTime() / 1000)}:F> (<t:${Math.floor(new Date(p.scheduled_at).getTime() / 1000)}:R>)` : when;
  const refs: string[] = Array.isArray(p.ref_aliases) ? p.ref_aliases : [];
  const wanted = Math.max(1, Number(p.refs_wanted) || 1);
  const short = Math.max(0, wanted - refs.length);
  const signUp = `Sign up on the match page: <${p.url}>`;
  const refLine = refs.length === 0
    ? `**Needs ${wanted === 1 ? 'a referee' : `${wanted} referees`}.** ${signUp}`
    : short > 0
      ? `Referee: ${refs.join(', ')}. **${short === 1 ? 'One more' : `${short} more`} wanted** (${wanted} per match). ${signUp}`
      : `Referee${refs.length === 1 ? '' : 's'}: ${refs.join(', ')}.`;
  if (n.kind === 'match_time_set') return `**Match time set** · ${season} · ${teams}\n${whenLong}\n${refLine}`;
  if (n.kind === 'match_time_moved') return `**Match time moved** · ${season} · ${teams}\nNow ${whenLong}\n${refLine}`;
  if (n.kind === 'ref_reminder') {
    return refs.length === 0
      ? `**Referee needed today** · ${season} · ${teams}\n${whenLong}\nNobody has signed up to ref this one yet${wanted > 1 ? ` (${wanted} wanted)` : ''}. ${signUp}`
      : `**Second referee wanted today** · ${season} · ${teams}\n${whenLong}\n${refs.join(', ')} ${refs.length === 1 ? 'is' : 'are'} on it; ${short === 1 ? 'one more' : `${short} more`} would make ${wanted}. The match goes ahead either way. ${signUp}`;
  }
  return `${p.title || n.kind} · ${teams} · ${when}`;
}

let draining = false;

export async function deliverNotices(client: Client, guild: Guild) {
  if (draining) return;
  draining = true;
  try {
    for (const n of await pendingNotices()) {
      const errors: string[] = [];
      let discordId: string | null = null;
      // Mention the person in the channel line when we know their Discord, even with no DM.
      if (!n.user_id && typeof n.payload?.target_id === 'string') discordId = await discordIdFor(n.payload.target_id);
      if (n.user_id) {
        discordId = await discordIdFor(n.user_id);
        if (discordId && !config.dryRun) {
          try {
            const user = await client.users.fetch(discordId);
            await user.send({ embeds: [embedFor(n)] });
          } catch (e: any) {
            errors.push(`dm: ${e?.message || e}`); // DMs closed, or left the server
          }
        } else if (!discordId) errors.push('dm: not linked');
      }
      const channelId = n.channel === 'referee' ? config.refChannelId : n.channel === 'staff' ? config.staffChannelId : null;
      if (n.channel && !channelId) errors.push(`${n.channel} channel not configured`);
      if (channelId && !config.dryRun) {
        const ch = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
        if (ch && ch.isTextBased() && 'send' in ch) {
          await ch.send({ content: channelLine(n, discordId).slice(0, 1900) }).catch((e) => errors.push(`channel: ${e?.message || e}`));
        } else errors.push(`channel ${channelId} not found`);
      }
      console.log(`notice ${n.kind} → ${n.payload?.target_alias || n.user_id || 'channel'}${errors.length ? ` (${errors.join('; ')})` : ''}`);
      await finishNotice(n.id, errors.length ? errors.join('; ') : null);
    }
  } finally {
    draining = false;
  }
}
