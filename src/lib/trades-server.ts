/**
 * Squad trades (draft leagues: CTFDL) — server-side helpers (service role). Import only from API routes.
 *
 * Flow: a captain proposes (2–4 squads, each giving at least one player) → every other squad in the
 * trade accepts → "agreed": every other captain in the league has 12 hours to approve or appeal.
 * Two appeals from two different squads escalate it to the admins, who decide. Otherwise it completes
 * on its own: at once when fewer than two squads could still appeal, else when the window ends.
 *
 * Rules the site enforces (league post, 2026-10-07): a player is in at most two completed trades a
 * season; nothing is proposed or accepted once the first week 6 RS match has started; no proposing,
 * accepting or voting between 8 and 11 PM ET on Sundays or while a league match is being played.
 * The swap itself waits only for no match to be in progress. Captains cannot be traded.
 */
import { createClient } from '@supabase/supabase-js';
import { SITE_URL, queueNotice } from '@/lib/notices-server';
import { messageUsers, squadLeaderIds, staffUserIds } from '@/lib/site-messages';
import type { Caller } from '@/lib/leave-requests-server';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const TRADES_URL = `${SITE_URL}/league/trades`;
/** Discord channel that hears about trades (#s5-ctfdl-captains). Change per season. */
export const TRADES_DISCORD_CHANNEL_ID = '1410803169117605989';
export const APPEAL_WINDOW_MS = 12 * 3_600_000;
export const MAX_TRADES_PER_PLAYER = 2;
export const TRADE_DEADLINE_WEEK = 6;
export const LEAGUE = 'ctfdl';

export type TradeStatus = 'proposed' | 'agreed' | 'escalated' | 'completed' | 'declined' | 'cancelled' | 'denied';
export const OPEN: TradeStatus[] = ['proposed', 'agreed', 'escalated'];

export interface TradeSquad { squad_id: string; squad_name: string | null; squad_tag: string | null; response: 'pending' | 'accepted' | 'declined'; responded_by_alias: string | null; responded_at: string | null }
export interface TradePlayer { player_id: string; player_alias: string | null; from_squad_id: string | null; to_squad_id: string | null }
export interface TradeVote { squad_id: string; squad_name: string | null; squad_tag: string | null; vote: 'approve' | 'appeal'; by_alias: string | null; note: string | null; created_at: string }
export interface Trade {
  id: string; league_slug: string; season_number: number | null; status: TradeStatus;
  proposed_by: string | null; proposed_by_alias: string | null; note: string | null;
  created_at: string; agreed_at: string | null; window_ends_at: string | null; escalated_at: string | null; completed_at: string | null;
  decided_by: string | null; decided_by_alias: string | null; decided_at: string | null; decision_note: string | null;
  squads: TradeSquad[]; players: TradePlayer[]; votes: TradeVote[];
}

export interface SeasonSquad { id: string; name: string; tag: string | null; captain_id: string | null }
export interface TradeContext {
  season_number: number | null;
  squads: SeasonSquad[];
  /** First week-6 RS match; nothing is proposed or accepted from then on. Null = no deadline known. */
  deadline: string | null;
  /** Why trading is paused right now (Sunday evening, or a match in progress), or null. */
  blackout: string | null;
  match_in_progress: boolean;
}

export const tableMissing = (error: { message?: string; code?: string } | null | undefined) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || ''));

export async function tradesInstalled(): Promise<boolean> {
  // Not a HEAD request: for a missing table that comes back as an empty error with no code.
  const { error } = await supabaseAdmin.from('squad_trades').select('id').limit(1);
  return !error;
}

// ---- Context: season, squads, deadline, blackout ------------------------------------------------

async function seasonNumber(): Promise<number | null> {
  const { data: lg } = await supabaseAdmin.from('leagues').select('id').eq('slug', LEAGUE).maybeSingle();
  if (!lg) return null;
  const { data } = await supabaseAdmin.from('league_seasons').select('season_number, status').eq('league_id', (lg as any).id).order('season_number', { ascending: false }).limit(3);
  const rows = (data || []) as { season_number: number; status: string }[];
  return (rows.find((s) => s.status === 'active') || rows.find((s) => s.status === 'upcoming') || rows[0])?.season_number ?? null;
}

/** The squads that can trade: the active squads tagged with the league. */
async function seasonSquads(): Promise<SeasonSquad[]> {
  const { data } = await supabaseAdmin.from('squads').select('id, name, tag, captain_id').eq('league_slug', LEAGUE).eq('is_active', true).order('name');
  return ((data || []) as any[]).map((s) => ({ id: s.id, name: s.name, tag: s.tag ?? null, captain_id: s.captain_id ?? null }));
}

async function tradeDeadline(season: number | null): Promise<string | null> {
  if (season == null) return null;
  const { data } = await supabaseAdmin.from('matches').select('scheduled_at, time_tbd').eq('league_slug', LEAGUE).eq('season_number', season).eq('stage', 'regular').eq('week', TRADE_DEADLINE_WEEK).order('scheduled_at').limit(20);
  const rows = (data || []) as { scheduled_at: string; time_tbd?: boolean }[];
  if (rows.length === 0) return null;
  return (rows.find((r) => !r.time_tbd) || rows[0]).scheduled_at;
}

/** Sunday 8–11 PM Eastern. */
export function sundayEveningEt(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return wd === 'Sun' && hour >= 20 && hour < 23;
}

async function matchInProgress(): Promise<boolean> {
  const { count } = await supabaseAdmin.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'in_progress').not('league_slug', 'is', null);
  return (count || 0) > 0;
}

export async function tradeContext(): Promise<TradeContext> {
  const season = await seasonNumber();
  const [squads, deadline, live] = await Promise.all([seasonSquads(), tradeDeadline(season), matchInProgress()]);
  const blackout = sundayEveningEt() ? 'No trades between 8 and 11 PM ET on Sundays.' : live ? 'No trades while a league match is being played.' : null;
  return { season_number: season, squads, deadline, blackout, match_in_progress: live };
}

const pastDeadline = (ctx: TradeContext) => !!ctx.deadline && Date.now() >= new Date(ctx.deadline).getTime();

// ---- Reading ----------------------------------------------------------------------------------

export async function loadTrades(opts: { ids?: string[]; season?: number | null; limit?: number } = {}): Promise<Trade[]> {
  let q = supabaseAdmin.from('squad_trades').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 100);
  if (opts.ids) q = q.in('id', opts.ids);
  if (opts.season != null) q = q.eq('season_number', opts.season);
  const { data: rows, error } = await q;
  if (error) throw error;
  const trades = (rows || []) as any[];
  if (trades.length === 0) return [];
  const ids = trades.map((t) => t.id);
  const [{ data: squads }, { data: players }, { data: votes }] = await Promise.all([
    supabaseAdmin.from('squad_trade_squads').select('*').in('trade_id', ids),
    supabaseAdmin.from('squad_trade_players').select('*').in('trade_id', ids),
    supabaseAdmin.from('squad_trade_votes').select('*').in('trade_id', ids).order('created_at'),
  ]);
  const voteSquadIds = [...new Set(((votes || []) as any[]).map((v) => v.squad_id))];
  const { data: voteSquads } = voteSquadIds.length ? await supabaseAdmin.from('squads').select('id, name, tag').in('id', voteSquadIds) : { data: [] as any[] };
  const nameOf = Object.fromEntries(((voteSquads || []) as any[]).map((s) => [s.id, s]));
  return trades.map((t) => ({
    ...t,
    squads: ((squads || []) as any[]).filter((s) => s.trade_id === t.id).map((s) => ({ squad_id: s.squad_id, squad_name: s.squad_name, squad_tag: s.squad_tag, response: s.response, responded_by_alias: s.responded_by_alias, responded_at: s.responded_at })),
    players: ((players || []) as any[]).filter((p) => p.trade_id === t.id).map((p) => ({ player_id: p.player_id, player_alias: p.player_alias, from_squad_id: p.from_squad_id, to_squad_id: p.to_squad_id })),
    votes: ((votes || []) as any[]).filter((v) => v.trade_id === t.id).map((v) => ({ squad_id: v.squad_id, squad_name: nameOf[v.squad_id]?.name ?? null, squad_tag: nameOf[v.squad_id]?.tag ?? null, vote: v.vote, by_alias: v.by_alias, note: v.note, created_at: v.created_at })),
  }));
}

export async function loadTrade(id: string): Promise<Trade | null> {
  return (await loadTrades({ ids: [id] }))[0] || null;
}

/** The squad this user leads among the season's squads (captain or co-captain), if any. */
export async function squadLedBy(userId: string, squads: SeasonSquad[]): Promise<SeasonSquad | null> {
  const byCaptain = squads.find((s) => s.captain_id === userId);
  if (byCaptain) return byCaptain;
  const { data } = await supabaseAdmin.from('squad_members').select('squad_id').eq('player_id', userId).eq('status', 'active').in('role', ['captain', 'co_captain']).in('squad_id', squads.map((s) => s.id));
  const id = (data as any[])?.[0]?.squad_id;
  return squads.find((s) => s.id === id) || null;
}

/** Completed trades this season that moved each of these players. */
async function tradesSoFar(playerIds: string[], season: number | null): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (playerIds.length === 0) return out;
  const { data } = await supabaseAdmin.from('squad_trade_players').select('player_id, squad_trades!inner(status, season_number)').in('player_id', playerIds);
  for (const r of (data || []) as any[]) {
    if (r.squad_trades?.status === 'completed' && (season == null || r.squad_trades?.season_number === season)) out[r.player_id] = (out[r.player_id] || 0) + 1;
  }
  return out;
}

const label = (s: { squad_name?: string | null; squad_tag?: string | null; name?: string | null; tag?: string | null }) => {
  const tag = s.squad_tag ?? s.tag; const name = s.squad_name ?? s.name;
  return `${tag ? `[${tag}] ` : ''}${name || 'a squad'}`;
};

/** "Kev (FANG → PTI), Waldo (PTI → FANG)" */
export function describePlayers(t: Trade): string {
  const sq = Object.fromEntries(t.squads.map((s) => [s.squad_id, s.squad_tag || s.squad_name || '?']));
  return t.players.map((p) => `${p.player_alias || 'a player'} (${sq[p.from_squad_id || ''] || '?'} → ${sq[p.to_squad_id || ''] || '?'})`).join(', ');
}

async function tell(t: Trade, who: 'involved' | 'league' | 'staff', subject: string, content: string, discord = false) {
  const involved = t.squads.map((s) => s.squad_id);
  let ids: string[] = [];
  if (who === 'involved') ids = [...(await squadLeaderIds(involved)), ...t.players.map((p) => p.player_id)];
  if (who === 'league') ids = [...(await squadLeaderIds((await seasonSquads()).map((s) => s.id))), ...(await staffUserIds()), ...t.players.map((p) => p.player_id)];
  if (who === 'staff') ids = await staffUserIds();
  await messageUsers(ids, subject, content);
  if (discord) {
    await queueNotice({ channel: TRADES_DISCORD_CHANNEL_ID as any, kind: 'trade', payload: { text: `**${subject}**\n${content}` }, text: content });
  }
}

// ---- Actions ----------------------------------------------------------------------------------

type Result = { trade?: Trade; error?: string; status?: number };

export async function proposeTrade(caller: Caller, input: { squad_ids: string[]; players: { player_id: string; to_squad_id: string }[]; note?: string }): Promise<Result> {
  const ctx = await tradeContext();
  if (pastDeadline(ctx)) return { error: `Trading closed when week ${TRADE_DEADLINE_WEEK} started.`, status: 409 };
  if (ctx.blackout) return { error: ctx.blackout, status: 409 };
  const mine = await squadLedBy(caller.id, ctx.squads);
  if (!mine) return { error: 'Only a captain or co-captain of a squad in the league can propose a trade', status: 403 };

  const squadIds = [...new Set(input.squad_ids || [])];
  if (!squadIds.includes(mine.id)) squadIds.unshift(mine.id);
  if (squadIds.length < 2 || squadIds.length > 4) return { error: 'A trade is between 2, 3 or 4 squads', status: 400 };
  const squads = squadIds.map((id) => ctx.squads.find((s) => s.id === id));
  if (squads.some((s) => !s)) return { error: 'Every squad in the trade must be an active squad in the league', status: 400 };

  const moves = (input.players || []).filter((p) => p?.player_id && p?.to_squad_id);
  if (moves.length === 0) return { error: 'Pick the players who move', status: 400 };
  if (new Set(moves.map((p) => p.player_id)).size !== moves.length) return { error: 'A player can only move once in a trade', status: 400 };
  const { data: memberRows } = await supabaseAdmin.from('squad_members').select('player_id, squad_id, role, profiles!squad_members_player_id_fkey(in_game_alias)').in('player_id', moves.map((p) => p.player_id)).in('squad_id', squadIds).eq('status', 'active');
  const member = Object.fromEntries(((memberRows || []) as any[]).map((m) => [m.player_id, m]));
  const players: TradePlayer[] = [];
  for (const mv of moves) {
    const m = member[mv.player_id];
    if (!m) return { error: 'Every player must be on one of the squads in the trade', status: 400 };
    if (m.role === 'captain' || squads.some((s) => s!.captain_id === mv.player_id)) return { error: `${m.profiles?.in_game_alias || 'A captain'} is a captain and cannot be traded`, status: 400 };
    if (!squadIds.includes(mv.to_squad_id) || mv.to_squad_id === m.squad_id) return { error: `${m.profiles?.in_game_alias} must move to another squad in the trade`, status: 400 };
    players.push({ player_id: mv.player_id, player_alias: m.profiles?.in_game_alias || null, from_squad_id: m.squad_id, to_squad_id: mv.to_squad_id });
  }
  for (const id of squadIds) if (!players.some((p) => p.from_squad_id === id)) return { error: `${label(squads.find((s) => s!.id === id)!)} must give at least one player`, status: 400 };

  const counts = await tradesSoFar(players.map((p) => p.player_id), ctx.season_number);
  const maxed = players.filter((p) => (counts[p.player_id] || 0) >= MAX_TRADES_PER_PLAYER);
  if (maxed.length) return { error: `${maxed.map((p) => p.player_alias).join(', ')} ${maxed.length === 1 ? 'has' : 'have'} already been traded ${MAX_TRADES_PER_PLAYER} times this season`, status: 409 };
  const { data: open } = await supabaseAdmin.from('squad_trade_players').select('player_id, squad_trades!inner(status)').in('player_id', players.map((p) => p.player_id));
  const busy = ((open || []) as any[]).filter((r) => OPEN.includes(r.squad_trades?.status)).map((r) => players.find((p) => p.player_id === r.player_id)?.player_alias);
  if (busy.length) return { error: `${busy.join(', ')} ${busy.length === 1 ? 'is' : 'are'} already in a trade that is still open`, status: 409 };

  const note = (input.note || '').trim().slice(0, 1000) || null;
  const { data: row, error } = await supabaseAdmin.from('squad_trades').insert({ league_slug: LEAGUE, season_number: ctx.season_number, status: 'proposed', proposed_by: caller.id, proposed_by_alias: caller.alias, note }).select('id').single();
  if (error) return { error: error.message, status: 500 };
  const tradeId = (row as any).id;
  const now = new Date().toISOString();
  const sqErr = (await supabaseAdmin.from('squad_trade_squads').insert(squads.map((s) => ({
    trade_id: tradeId, squad_id: s!.id, squad_name: s!.name, squad_tag: s!.tag,
    response: s!.id === mine.id ? 'accepted' : 'pending', responded_by: s!.id === mine.id ? caller.id : null, responded_by_alias: s!.id === mine.id ? caller.alias : null, responded_at: s!.id === mine.id ? now : null,
  })))).error;
  const plErr = (await supabaseAdmin.from('squad_trade_players').insert(players.map((p) => ({ trade_id: tradeId, ...p })))).error;
  if (sqErr || plErr) {
    await supabaseAdmin.from('squad_trades').delete().eq('id', tradeId);
    return { error: (sqErr || plErr)!.message, status: 500 };
  }
  const trade = (await loadTrade(tradeId))!;
  const others = trade.squads.filter((s) => s.squad_id !== mine.id).map((s) => s.squad_id);
  await messageUsers(await squadLeaderIds(others), `Trade proposed by ${label(mine)}: ${describePlayers(trade)}`,
    `${caller.alias} (${label(mine)}) has proposed a trade: ${describePlayers(trade)}.${note ? `\n\nNote: ${note}` : ''}\n\nAccept or decline it on the trades page: ${TRADES_URL}\n\nOnce every squad in the trade has accepted, the other captains get 12 hours to approve or appeal before it goes through.`);
  return { trade };
}

/** A squad in the trade accepts or declines. When the last squad accepts, the 12-hour window opens. */
export async function respondToTrade(caller: Caller, tradeId: string, accept: boolean): Promise<Result> {
  const ctx = await tradeContext();
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (trade.status !== 'proposed') return { error: `This trade is ${trade.status}`, status: 409 };
  const mine = await squadLedBy(caller.id, ctx.squads);
  const seat = mine ? trade.squads.find((s) => s.squad_id === mine.id) : null;
  if (!mine || !seat) return { error: 'Only a captain or co-captain of a squad in this trade can answer it', status: 403 };
  if (seat.response !== 'pending') return { error: `${label(mine)} already ${seat.response}`, status: 409 };
  if (accept && pastDeadline(ctx)) return { error: `Trading closed when week ${TRADE_DEADLINE_WEEK} started.`, status: 409 };
  if (accept && ctx.blackout) return { error: ctx.blackout, status: 409 };

  const now = new Date().toISOString();
  await supabaseAdmin.from('squad_trade_squads').update({ response: accept ? 'accepted' : 'declined', responded_by: caller.id, responded_by_alias: caller.alias, responded_at: now }).eq('trade_id', tradeId).eq('squad_id', mine.id);
  if (!accept) {
    await supabaseAdmin.from('squad_trades').update({ status: 'declined', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: now }).eq('id', tradeId).eq('status', 'proposed');
    const t = (await loadTrade(tradeId))!;
    await tell(t, 'involved', `Trade declined by ${label(mine)}: ${describePlayers(t)}`, `${caller.alias} (${label(mine)}) declined the trade ${describePlayers(t)}. Nobody moves.`);
    return { trade: t };
  }
  const t = (await loadTrade(tradeId))!;
  if (t.squads.every((s) => s.response === 'accepted')) {
    const ends = new Date(Date.now() + APPEAL_WINDOW_MS).toISOString();
    await supabaseAdmin.from('squad_trades').update({ status: 'agreed', agreed_at: now, window_ends_at: ends }).eq('id', tradeId).eq('status', 'proposed');
    const agreed = (await loadTrade(tradeId))!;
    const outside = ctx.squads.filter((s) => !agreed.squads.some((x) => x.squad_id === s.id)).length;
    await tell(agreed, 'league', `Trade agreed: ${describePlayers(agreed)}`,
      `${agreed.squads.map(label).join(' and ')} have agreed a trade: ${describePlayers(agreed)}.\n\nCaptains of the other squads have until ${new Date(ends).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET to approve or appeal it on the trades page: ${TRADES_URL}\n\nIt goes through on its own unless two different squads appeal, in which case the admins decide.${outside < 2 ? '\n\n(Fewer than two squads are outside this trade, so it will complete right away.)' : ''}`, true);
    return settle(tradeId);
  }
  return { trade: t };
}

/** The proposer (or any leader of a squad in it) withdraws a trade that hasn't completed. */
export async function cancelTrade(caller: Caller, tradeId: string): Promise<Result> {
  const ctx = await tradeContext();
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (!OPEN.includes(trade.status)) return { error: `This trade is ${trade.status}`, status: 409 };
  const mine = await squadLedBy(caller.id, ctx.squads);
  if (!caller.staff && !(mine && trade.squads.some((s) => s.squad_id === mine.id))) return { error: 'Only a squad in this trade (or staff) can withdraw it', status: 403 };
  const now = new Date().toISOString();
  await supabaseAdmin.from('squad_trades').update({ status: 'cancelled', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: now }).eq('id', tradeId).in('status', OPEN);
  const t = (await loadTrade(tradeId))!;
  await tell(t, trade.status === 'proposed' ? 'involved' : 'league', `Trade withdrawn: ${describePlayers(t)}`, `${caller.alias} withdrew the trade ${describePlayers(t)}. Nobody moves.`, trade.status !== 'proposed');
  return { trade: t };
}

/** A squad outside the trade approves or appeals during the window. */
export async function voteOnTrade(caller: Caller, tradeId: string, vote: 'approve' | 'appeal', note: string): Promise<Result> {
  const ctx = await tradeContext();
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (trade.status !== 'agreed') return { error: `This trade is ${trade.status}; voting is over`, status: 409 };
  if (ctx.blackout) return { error: ctx.blackout, status: 409 };
  const mine = await squadLedBy(caller.id, ctx.squads);
  if (!mine) return { error: 'Only a captain or co-captain can vote on a trade', status: 403 };
  if (trade.squads.some((s) => s.squad_id === mine.id)) return { error: 'Your squad is in this trade; the other squads vote', status: 403 };
  if (trade.votes.some((v) => v.squad_id === mine.id)) return { error: `${label(mine)} has already voted`, status: 409 };
  const { error } = await supabaseAdmin.from('squad_trade_votes').insert({ trade_id: tradeId, squad_id: mine.id, vote, by_user: caller.id, by_alias: caller.alias, note: note || null });
  if (error) return { error: error.message, status: 500 };
  return settle(tradeId);
}

/** Admins decide an escalated trade (or step in on any open one). Approving completes it. */
export async function adminDecideTrade(caller: Caller, tradeId: string, approve: boolean, note: string): Promise<Result> {
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (!OPEN.includes(trade.status)) return { error: `This trade is ${trade.status}`, status: 409 };
  const now = new Date().toISOString();
  if (!approve) {
    await supabaseAdmin.from('squad_trades').update({ status: 'denied', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: now, decision_note: note || null }).eq('id', tradeId).in('status', OPEN);
    const t = (await loadTrade(tradeId))!;
    await tell(t, 'league', `Trade denied: ${describePlayers(t)}`, `League staff (${caller.alias}) denied the trade ${describePlayers(t)}. Nobody moves.`, true);
    return { trade: t };
  }
  await supabaseAdmin.from('squad_trades').update({ decided_by: caller.id, decided_by_alias: caller.alias, decided_at: now, decision_note: note || null }).eq('id', tradeId);
  if (await matchInProgress()) {
    await supabaseAdmin.from('squad_trades').update({ status: 'agreed', window_ends_at: now }).eq('id', tradeId).in('status', OPEN);
    return { trade: (await loadTrade(tradeId))!, error: 'Approved. The players move as soon as the match being played ends.', status: 202 };
  }
  return completeTrade(tradeId, `approved by league staff (${caller.alias})`);
}

/**
 * Where an agreed trade stands after a vote or the clock: escalate on two appeals, complete when
 * fewer than two squads could still appeal or the window has ended, otherwise keep waiting.
 */
export async function settle(tradeId: string): Promise<Result> {
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (trade.status !== 'agreed') return { trade };
  const squads = await seasonSquads();
  const outside = squads.filter((s) => !trade.squads.some((x) => x.squad_id === s.id)).map((s) => s.id);
  const appeals = trade.votes.filter((v) => v.vote === 'appeal' && outside.includes(v.squad_id)).length;
  const approvals = trade.votes.filter((v) => v.vote === 'approve' && outside.includes(v.squad_id)).length;
  if (appeals >= 2) {
    const now = new Date().toISOString();
    await supabaseAdmin.from('squad_trades').update({ status: 'escalated', escalated_at: now }).eq('id', tradeId).eq('status', 'agreed');
    const t = (await loadTrade(tradeId))!;
    await tell(t, 'league', `Trade appealed: ${describePlayers(t)}`, `Two squads appealed the trade ${describePlayers(t)}, so it goes to the admins for a final decision. Nobody moves until they decide.`, true);
    return { trade: t };
  }
  const couldStillAppeal = outside.length - approvals - appeals;
  const windowOver = !!trade.window_ends_at && Date.now() >= new Date(trade.window_ends_at).getTime();
  if (appeals + couldStillAppeal < 2 || windowOver) {
    if (await matchInProgress()) return { trade };
    return completeTrade(tradeId, windowOver ? 'the appeal window ended' : 'no appeal was possible any more');
  }
  return { trade };
}

/** Move the players. Checks the per-player limit again; a player who left meanwhile is skipped. */
export async function completeTrade(tradeId: string, why: string): Promise<Result> {
  const trade = await loadTrade(tradeId);
  if (!trade) return { error: 'Trade not found', status: 404 };
  if (!OPEN.includes(trade.status)) return { error: `This trade is ${trade.status}`, status: 409 };
  const now = new Date().toISOString();
  // Claim it first so two callers can't both move the players.
  const { data: claimed } = await supabaseAdmin.from('squad_trades').update({ status: 'completed', completed_at: now }).eq('id', tradeId).in('status', OPEN).select('id');
  if (!claimed?.length) return { error: 'This trade was just completed by someone else', status: 409 };

  const counts = await tradesSoFar(trade.players.map((p) => p.player_id), trade.season_number);
  const skipped: string[] = [];
  for (const p of trade.players) {
    if ((counts[p.player_id] || 0) > MAX_TRADES_PER_PLAYER) { skipped.push(`${p.player_alias} (already traded ${MAX_TRADES_PER_PLAYER} times)`); continue; }
    const { data: moved } = await supabaseAdmin.from('squad_members').update({ squad_id: p.to_squad_id, role: 'player' }).eq('squad_id', p.from_squad_id).eq('player_id', p.player_id).eq('status', 'active').select('id');
    if (!moved?.length) {
      const { data: already } = await supabaseAdmin.from('squad_members').select('id').eq('squad_id', p.to_squad_id).eq('player_id', p.player_id).eq('status', 'active');
      if (!already?.length) await supabaseAdmin.from('squad_members').insert({ squad_id: p.to_squad_id, player_id: p.player_id, role: 'player', status: 'active' });
    }
    // Off any lineup saved for the old squad's future matches.
    const { data: future } = await supabaseAdmin.from('matches').select('id').or(`squad_a_id.eq.${p.from_squad_id},squad_b_id.eq.${p.from_squad_id}`).eq('status', 'scheduled').gte('scheduled_at', new Date(Date.now() - 3_600_000).toISOString());
    const ids = ((future || []) as any[]).map((m) => m.id);
    if (ids.length) await supabaseAdmin.from('match_lineups').delete().in('match_id', ids).eq('squad_id', p.from_squad_id).eq('player_id', p.player_id);
  }
  const t = (await loadTrade(tradeId))!;
  await tell(t, 'league', `Trade completed: ${describePlayers(t)}`, `The trade ${describePlayers(t)} has gone through (${why}).${skipped.length ? `\n\nNot moved: ${skipped.join(', ')}.` : ''}\n\nRosters are updated on freeinf.org; Discord squad roles follow on the bot's next sync.`, true);
  return { trade: t };
}

/** Called by the bot every few minutes: complete or escalate whatever the clock has decided. */
export async function runDueTrades(): Promise<{ checked: number; changed: string[] }> {
  const { data } = await supabaseAdmin.from('squad_trades').select('id, status').eq('status', 'agreed');
  const changed: string[] = [];
  for (const row of (data || []) as any[]) {
    const r = await settle(row.id);
    if (r.trade && r.trade.status !== 'agreed') changed.push(`${row.id}: ${r.trade.status}`);
  }
  return { checked: (data || []).length, changed };
}
