'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Minimize2, Maximize2, Play, Video } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { displayFont, bodyFont } from '@/lib/fonts';
import { VIDEO_THUMBNAIL_PLACEHOLDER } from '@/lib/constants';
import { sortRows, useSortState, SortTh, type SortGetters } from '@/components/usl-mix/UslMixShell';
import {
  T, SIDE, isSide, Card, Tag, SideBadge, ResultBadge, ModeBadge, PlayerName, ClassSplit, ClassBars, WeaponTable, StatTile, Skeleton,
  fmtPct, fmtKD, fmtMMSS, fmtDelta, fmtDateTime, weaponRows, type StatRow,
} from '@/components/ctf-stats/CtfStats';

/*
 * One recorded game. Data: /api/player-stats/game/[gameId].
 *
 * Players are grouped by TEAM. Offense/defense is shown when the rows carry it (an OvD) and simply
 * absent when they do not (a Pub game, or anything recorded before the side fix) - the previous page
 * dropped every player without a side, which is why Pub games rendered as "(0 players)".
 * Schema-2 rows (CTF script 2026-09-11+) add per-weapon accuracy, class play time, summons, mined
 * minerals, captains and the ELO movement; a row expands to show the first two.
 */

interface TeamSummary {
  name: string; faction: 'T' | 'C' | null; side: 'offense' | 'defense' | null; result: 'win' | 'loss' | null;
  players: number; kills: number; deaths: number; captures: number; carrierKills: number; ebHits: number; turretDamage: number; captains: string[];
}
interface VideoInfo {
  matchId: string; matchTitle: string; youtube_url?: string; vod_url?: string; highlight_url?: string;
  video_title?: string; video_description?: string; video_thumbnail_url?: string; has_video: boolean;
}
interface GameData {
  gameId: string; gameMode: string; arenaName: string; baseUsed: string | null; gameDate: string; duration: number; gameLength: number;
  season: string | null; schemaVersion: number; scriptVersion: string | null; decided: boolean;
  winningInfo: { type: 'side' | 'team'; winner: string; side?: string; team?: string } | null;
  videoInfo: VideoInfo | null;
  summary: { totalKills: number; totalDeaths: number; totalCaptures: number; playerCount: number };
  teams: TeamSummary[];
  players: StatRow[];
}

const FACTION_COLOR = { T: '#3DBD7A', C: '#E8693A' } as const;

// Roster order a CTF reader expects: support first on defense, the leader first on offense.
const DEF_ORDER = ['Field Medic', 'Combat Engineer', 'Heavy Weapons', 'Infantry', 'Jump Trooper', 'Infiltrator', 'Squad Leader'];
const OFF_ORDER = ['Squad Leader', 'Jump Trooper', 'Infiltrator', 'Heavy Weapons', 'Infantry', 'Field Medic', 'Combat Engineer'];
const ANY_ORDER = ['Squad Leader', 'Field Medic', 'Combat Engineer', 'Heavy Weapons', 'Infantry', 'Jump Trooper', 'Infiltrator'];
const classRank = (p: StatRow) => {
  const order = p.side === 'defense' ? DEF_ORDER : p.side === 'offense' ? OFF_ORDER : ANY_ORDER;
  const i = order.indexOf(p.main_class);
  return i < 0 ? order.length : i;
};

type Col = 'player' | 'class' | 'kills' | 'deaths' | 'kd' | 'caps' | 'ck' | 'carry' | 'eb' | 'turret' | 'acc' | 'summ' | 'mined' | 'elo';
const GETTERS: SortGetters<StatRow, Col> = {
  player: (p) => p.player_name,
  class: (p) => classRank(p),
  kills: (p) => p.kills,
  deaths: (p) => p.deaths,
  kd: (p) => (p.deaths > 0 ? p.kills / p.deaths : p.kills),
  caps: (p) => p.flag_captures ?? p.captures ?? 0,
  ck: (p) => p.carrier_kills,
  carry: (p) => p.carry_time_seconds,
  eb: (p) => p.eb_hits,
  turret: (p) => p.turret_damage,
  acc: (p) => accOf(p),
  summ: (p) => (p.times_summoned ?? 0) + (p.summons_performed ?? 0),
  mined: (p) => (p.mined_tso ?? 0) + (p.mined_tox ?? 0),
  elo: (p) => (p.elo_change === null || p.elo_change === undefined ? null : Number(p.elo_change)),
};

/** Overall accuracy across every weapon when the row carries the weapon table; else the recorded best-weapon figure. */
const accOf = (p: StatRow) => {
  const rows = weaponRows(p.weapon_stats);
  const fired = rows.reduce((s, w) => s + w.fired, 0);
  return fired > 0 ? rows.reduce((s, w) => s + w.landed, 0) / fired : Number(p.accuracy) || 0;
};

const hasDetail = (p: StatRow) => !!(p.weapon_stats && Object.keys(p.weapon_stats).length) || !!(p.class_play_times && Object.keys(p.class_play_times).length > 1);

const youTubeId = (url?: string | null) => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([^&\n?#]+)/);
  return m?.[1] || null;
};

export default function GameStatsPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const { user } = useAuth();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [videoOpen, setVideoOpen] = useState(true);
  const [embed, setEmbed] = useState(false);
  const [addVideo, setAddVideo] = useState(false);
  const { sort, toggle } = useSortState<Col>({ key: 'class', dir: 'asc' });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/player-stats/game/${encodeURIComponent(gameId)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || `Could not load this game (${r.status})`);
      setGame(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this game');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (gameId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gameId]);

  const byTeam = useMemo(() => {
    const m = new Map<string, StatRow[]>();
    game?.players.forEach((p) => { const k = p.team || 'Unknown'; (m.get(k) ?? m.set(k, []).get(k)!).push(p); });
    return m;
  }, [game]);

  const highlights = useMemo(() => {
    if (!game?.players.length) return [];
    const ps = game.players;
    const top = <K extends keyof StatRow>(key: K, min = 1) => {
      const best = [...ps].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))[0];
      return best && Number(best[key] ?? 0) >= min ? best : null;
    };
    const out: Array<{ label: string; player: StatRow; value: string }> = [];
    const k = top('kills'); if (k) out.push({ label: 'Most kills', player: k, value: String(k.kills) });
    const kd = [...ps].filter((p) => p.kills >= 3).sort((a, b) => (b.kills / Math.max(b.deaths, 1)) - (a.kills / Math.max(a.deaths, 1)))[0];
    if (kd) out.push({ label: 'Best K/D', player: kd, value: fmtKD(kd.kills, kd.deaths) });
    const caps = top('captures'); if (caps) out.push({ label: 'Flag caps', player: caps, value: String(caps.captures) });
    const ck = top('carrier_kills'); if (ck) out.push({ label: 'Carrier kills', player: ck, value: String(ck.carrier_kills) });
    const carry = top('carry_time_seconds'); if (carry) out.push({ label: 'Longest carry', player: carry, value: fmtMMSS(carry.carry_time_seconds) });
    const eb = top('eb_hits'); if (eb) out.push({ label: 'EB hits', player: eb, value: String(eb.eb_hits) });
    // Accuracy from the weapon table when it exists (needs real volume), else the recorded best-weapon figure.
    const acc = [...ps]
      .map((p) => { const rows = weaponRows(p.weapon_stats); const fired = rows.reduce((s, w) => s + w.fired, 0); const landed = rows.reduce((s, w) => s + w.landed, 0); return { p, fired, acc: fired >= 20 ? landed / fired : p.accuracy }; })
      .filter((x) => x.acc > 0).sort((a, b) => b.acc - a.acc)[0];
    if (acc) out.push({ label: 'Accuracy', player: acc.p, value: fmtPct(acc.acc) });
    const summ = top('summons_performed'); if (summ) out.push({ label: 'Summons', player: summ, value: String(summ.summons_performed) });
    const tur = top('turret_damage'); if (tur) out.push({ label: 'Turret damage', player: tur, value: String(tur.turret_damage) });
    return out;
  }, [game]);

  const schema2 = (game?.schemaVersion ?? 1) >= 2;
  const showSides = !!game?.players.some((p) => isSide(p.side));
  const showElo = !!game?.players.some((p) => p.elo_change !== null && p.elo_change !== undefined);

  const headline = (() => {
    if (!game) return '';
    if (!game.decided || !game.winningInfo) return game.gameMode === 'Pub' ? 'Pub game' : 'No winner recorded';
    if (game.winningInfo.type === 'side') return game.winningInfo.side === 'defense' ? `Defense holds ${game.baseUsed ?? 'the base'}` : `Offense breaks ${game.baseUsed ?? 'the base'}`;
    return `${game.winningInfo.winner} wins`;
  })();

  const toggleRow = (key: string) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const th = (col: Col, label: string, opts: { text?: boolean; left?: boolean; title?: string } = {}) => (
    <SortTh col={col} sort={sort} onToggle={toggle} text={opts.text} title={opts.title} className={`px-2 py-2 font-normal ${opts.left ? 'text-left' : 'text-right'}`}>{label}</SortTh>
  );

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <Card><Skeleton rows={6} /></Card>
        ) : error || !game ? (
          <Card>
            <div className="py-10 text-center">
              <h1 className="font-display text-3xl text-[#F87171]">{error || 'Game not found'}</h1>
              <p className="mt-2 text-sm text-[#8B98B0]">The game id may be wrong, or the zone has not posted this game yet.</p>
              <Link href="/stats" className="mt-5 inline-block rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Back to stats</Link>
            </div>
          </Card>
        ) : (
          <>
            {/* Header */}
            <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle at 8% 30%, ${game.winningInfo?.side === 'offense' ? 'rgba(245,158,11,0.14)' : 'rgba(34,211,238,0.12)'}, transparent 42%)` }} />
              <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">
                    <Link href="/stats" className="hover:text-[#22D3EE]">Stats</Link><span className="text-white/20">/</span>
                    <Link href="/matches" className="hover:text-[#22D3EE]">Match log</Link><span className="text-white/20">/</span>
                    <span className="text-[#8B98B0] normal-case tracking-normal">{game.gameId}</span>
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">{headline}</h1>
                  <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
                    <ModeBadge mode={game.gameMode} />
                    <span>{game.arenaName}</span>
                    {game.baseUsed && <><span className="text-white/20">·</span><span>Base <span className="text-[#E6EDF7]">{game.baseUsed}</span></span></>}
                    <span className="text-white/20">·</span><span className="tabular-nums">{fmtMMSS(game.duration)}</span>
                    <span className="text-white/20">·</span><span className="tabular-nums">{game.summary.playerCount} players</span>
                    <span className="text-white/20">·</span><span>{fmtDateTime(game.gameDate)}</span>
                    {game.season && <><span className="text-white/20">·</span><span>{game.season}</span></>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {game.videoInfo?.has_video ? (
                    <>
                      {game.videoInfo.youtube_url && <a href={game.videoInfo.youtube_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10"><Play className="w-3.5 h-3.5" /> YouTube <ExternalLink className="w-3 h-3 opacity-60" /></a>}
                      {game.videoInfo.vod_url && <a href={game.videoInfo.vod_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10">VOD <ExternalLink className="w-3 h-3 opacity-60" /></a>}
                      {game.videoInfo.highlight_url && <a href={game.videoInfo.highlight_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10">Highlights <ExternalLink className="w-3 h-3 opacity-60" /></a>}
                      {(!game.videoInfo.youtube_url || !game.videoInfo.vod_url) && <button type="button" onClick={() => setAddVideo(true)} className="px-3 py-1.5 rounded-md text-sm text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5">Add {!game.videoInfo.youtube_url ? 'YouTube' : 'VOD'}</button>}
                    </>
                  ) : (
                    <button type="button" onClick={() => setAddVideo(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-[#22D3EE]/15 text-[#22D3EE] hover:bg-[#22D3EE]/25"><Video className="w-4 h-4" /> Add video / VOD</button>
                  )}
                </div>
              </div>
              {/* Score strip */}
              <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2.5 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2">
                {game.teams.slice(0, 2).map((t, i) => (
                  <React.Fragment key={t.name}>
                    {i === 1 && <div className="hidden md:block font-display text-3xl text-[#8B98B0] text-center px-3">vs</div>}
                    <div className={`flex items-center gap-2 min-w-0 ${i === 1 ? 'md:flex-row-reverse md:text-right' : ''}`}>
                      <span className="font-display text-2xl leading-none truncate" style={{ color: t.faction ? FACTION_COLOR[t.faction] : T.text }}>{t.name}</span>
                      {t.side && <SideBadge side={t.side} />}
                      {t.result && <ResultBadge result={t.result} />}
                      <span className="text-xs text-[#8B98B0] tabular-nums whitespace-nowrap">{t.kills} K · {t.deaths} D{t.captures ? ` · ${t.captures} caps` : ''}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </section>

            {/* Video */}
            {game.videoInfo?.has_video && (
              <Card
                title={<span className="inline-flex items-center gap-2"><Video className="w-4 h-4 text-[#22D3EE]" /> Match recording{game.videoInfo.video_title ? <span className="text-sm text-[#8B98B0] font-body">· {game.videoInfo.video_title}</span> : null}</span>}
                right={<button type="button" onClick={() => setVideoOpen((v) => !v)} className="inline-flex items-center gap-1 text-[#8B98B0] hover:text-[#E6EDF7]">{videoOpen ? <><Minimize2 className="w-3.5 h-3.5" /> Minimize</> : <><Maximize2 className="w-3.5 h-3.5" /> Show</>}</button>}
                pad={videoOpen}
              >
                {videoOpen && (
                  <div className="max-w-5xl mx-auto">
                    {game.videoInfo.youtube_url && !embed ? (
                      <button type="button" onClick={() => setEmbed(true)} className="relative w-full aspect-video rounded-lg overflow-hidden bg-black group">
                        <img src={`https://i.ytimg.com/vi/${youTubeId(game.videoInfo.youtube_url)}/maxresdefault.jpg`} alt="" className="w-full h-full object-cover" onError={(e) => { const t = e.target as HTMLImageElement; t.src = t.src.includes('maxresdefault') ? t.src.replace('maxresdefault', 'hqdefault') : VIDEO_THUMBNAIL_PLACEHOLDER; }} />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/15 transition-colors"><span className="rounded-full bg-[#22D3EE] text-[#0B0F1A] p-5 shadow-xl group-hover:scale-105 transition-transform"><Play className="w-8 h-8 ml-1" /></span></span>
                      </button>
                    ) : game.videoInfo.youtube_url ? (
                      <div className="aspect-video rounded-lg overflow-hidden bg-black">
                        <iframe src={`https://www.youtube.com/embed/${youTubeId(game.videoInfo.youtube_url)}?autoplay=1&rel=0&modestbranding=1`} title={game.videoInfo.video_title || 'Match video'} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                      </div>
                    ) : (
                      <p className="text-sm text-[#8B98B0]">No YouTube link. Use the VOD or highlights buttons above.</p>
                    )}
                    {game.videoInfo.video_description && <p className="mt-3 text-sm text-[#8B98B0]">{game.videoInfo.video_description}</p>}
                  </div>
                )}
              </Card>
            )}

            {/* Team boards */}
            {/* Stacked, full width: fourteen columns do not fit side by side without hiding half of them behind a scrollbar. */}
            <div className="grid grid-cols-1 gap-4">
              {game.teams.map((team) => {
                const rows = sortRows(byTeam.get(team.name) ?? [], GETTERS, sort);
                const tint = team.result === 'win' ? 'border-l-[#34D399]' : team.result === 'loss' ? 'border-l-[#F87171]' : 'border-l-transparent';
                const sideColor = team.side ? SIDE[team.side].color : undefined;
                return (
                  <section key={team.name} className={`rounded-xl overflow-hidden bg-[#131A2B] min-w-0 border-l-2 ${tint}`}>
                    <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="font-display text-xl leading-none" style={{ color: team.faction ? FACTION_COLOR[team.faction] : T.text }}>{team.name}</h2>
                      {team.side && <SideBadge side={team.side} />}
                      {team.result && <ResultBadge result={team.result} />}
                      <span className="text-xs text-[#8B98B0]">{team.players} player{team.players === 1 ? '' : 's'}</span>
                      {team.captains.length > 0 && <span className="text-xs text-[#8B98B0]"><span className="text-[#F59E0B]">★</span> {team.captains.join(', ')}</span>}
                      <span className="ml-auto text-xs text-[#8B98B0] tabular-nums whitespace-nowrap">{team.kills}K / {team.deaths}D{team.ebHits ? ` · ${team.ebHits} EB` : ''}{team.turretDamage ? ` · ${team.turretDamage} turret` : ''}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[860px]">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0] border-t border-white/[0.06]">
                            <th className="w-6 px-1 py-2" />
                            {th('player', 'Player', { text: true, left: true })}
                            {th('class', 'Class', { left: true, title: 'Roster order; click to sort' })}
                            {th('kills', 'K')}
                            {th('deaths', 'D')}
                            {th('kd', 'K/D')}
                            {th('caps', 'Caps', { title: 'Flag captures' })}
                            {th('ck', 'CK', { title: 'Carrier kills' })}
                            {th('carry', 'Carry', { title: 'Flag carry time' })}
                            {th('eb', 'EB', { title: 'Energy-beam hits' })}
                            {th('turret', 'Turret', { title: 'Turret damage' })}
                            {th('acc', 'Acc', { title: 'Accuracy - all weapons when the game recorded them, otherwise the best weapon' })}
                            {schema2 && th('summ', 'Summ', { title: 'Times summoned / summons performed' })}
                            {schema2 && th('mined', 'Mined', { title: 'Titanium Oxide / Toxin mined' })}
                            {showElo && th('elo', 'ELO Δ', { title: 'Rating change from this game' })}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p) => {
                            const key = `${team.name}:${p.player_name}`;
                            const open = expanded.has(key);
                            const detail = hasDetail(p);
                            const elo = p.elo_change === null || p.elo_change === undefined ? null : Number(p.elo_change);
                            return (
                              <React.Fragment key={key}>
                                <tr className={`border-t border-white/[0.06] hover:bg-white/[0.03] ${open ? 'bg-[#22D3EE]/[0.04]' : ''}`}>
                                  <td className="px-1 py-2 align-middle">
                                    {detail ? (
                                      <button type="button" onClick={() => toggleRow(key)} className="text-[#8B98B0] hover:text-[#22D3EE]" aria-expanded={open} aria-label="Weapons and class time">
                                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </button>
                                    ) : <span className="block w-3.5" />}
                                  </td>
                                  <td className="px-2 py-2 max-w-[11rem]"><PlayerName name={p.player_name} mainClass={p.main_class} captain={p.is_captain} /></td>
                                  <td className="px-2 py-2"><ClassSplit classes={p.class_play_times} primary={p.main_class} compact /></td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.kills}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#8B98B0]">{p.deaths}</td>
                                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: p.kills / Math.max(p.deaths, 1) >= 1 ? T.win : T.text }}>{fmtKD(p.kills, p.deaths)}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.flag_captures ?? p.captures ?? 0}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.carrier_kills}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.carry_time_seconds ? fmtMMSS(p.carry_time_seconds) : <span className="text-[#8B98B0]">—</span>}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.eb_hits}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.turret_damage || <span className="text-[#8B98B0]">—</span>}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]" title={p.weapon_stats ? 'All weapons' : 'Best weapon'}>{accOf(p) ? fmtPct(accOf(p), 0) : <span className="text-[#8B98B0]">—</span>}</td>
                                  {schema2 && <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]" title="summoned / performed">{p.times_summoned ?? 0}<span className="text-[#8B98B0]"> / {p.summons_performed ?? 0}</span></td>}
                                  {schema2 && <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]" title="Titanium Oxide / Toxin">{(p.mined_tso ?? 0) || (p.mined_tox ?? 0) ? <>{p.mined_tso ?? 0}<span className="text-[#8B98B0]"> / {p.mined_tox ?? 0}</span></> : <span className="text-[#8B98B0]">—</span>}</td>}
                                  {showElo && <td className="px-2 py-2 text-right tabular-nums" style={{ color: elo === null ? T.muted : elo > 0 ? T.win : elo < 0 ? T.loss : T.muted }} title={elo === null ? undefined : `${Math.round(Number(p.elo_before))} → ${Math.round(Number(p.elo_after))}`}>{fmtDelta(elo)}</td>}
                                </tr>
                                {open && (
                                  <tr className="bg-[#22D3EE]/[0.04]">
                                    <td />
                                    <td colSpan={20} className="px-2 pb-3 pt-1">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">Weapons</div>
                                          <WeaponTable weapons={p.weapon_stats} />
                                        </div>
                                        <div>
                                          <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">Class time{p.play_seconds ? <span className="normal-case tracking-normal"> · {fmtMMSS(p.play_seconds)} in game</span> : null}</div>
                                          <ClassBars classes={p.class_play_times} />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {sideColor && <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${sideColor}, transparent)` }} />}
                  </section>
                );
              })}
            </div>

            {/* Highlights */}
            {highlights.length > 0 && (
              <Card title="Highlights" right={schema2 ? 'Weapon accuracy needs 20+ shots to count' : 'Recorded before per-weapon stats existed'}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {highlights.map((h) => (
                    <div key={h.label} className="rounded-lg bg-[#1B2438] px-3 py-2.5 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{h.label}</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2 min-w-0">
                        <PlayerName name={h.player.player_name} mainClass={h.player.main_class} className="text-sm" />
                        <span className="font-display text-xl tabular-nums text-[#E6EDF7] shrink-0">{h.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label="Kills" value={game.summary.totalKills} />
              <StatTile label="Deaths" value={game.summary.totalDeaths} />
              <StatTile label="Flag captures" value={game.summary.totalCaptures} />
              <StatTile label="Length" value={fmtMMSS(game.duration)} hint={game.gameMode === 'OvD' ? '18:00 clock' : undefined} />
            </div>

            <p className="text-[11px] text-[#8B98B0] px-1">
              {showSides ? 'Sides come from the mix manager or the base that was set up; ' : 'This game was recorded without offense/defense sides; '}
              {schema2 ? `per-weapon accuracy, class time and summons are from the zone script (${game.scriptVersion || 'schema 2'}).` : 'per-weapon accuracy and class time were not recorded for games this old.'}
              {' '}Click a column heading to sort both boards; the arrow on a row opens that player&apos;s weapons and class time.
            </p>
          </>
        )}
      </main>

      {addVideo && game && (
        <AddVideoModal gameId={game.gameId} onClose={() => setAddVideo(false)} onSaved={() => { setAddVideo(false); load(); }} />
      )}
    </div>
  );
}

function AddVideoModal({ gameId, onClose, onSaved }: { gameId: string; onClose: () => void; onSaved: () => void }) {
  const [youtube, setYoutube] = useState('');
  const [vod, setVod] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputCls = 'w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none';
  const submit = async () => {
    if (!youtube && !vod) { setErr('Enter at least one URL.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/matches/add-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, youtube_url: youtube || null, vod_url: vod || null }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Could not save (${r.status})`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-[#131A2B] p-5 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl text-[#E6EDF7]">Add a recording</h3>
        <p className="mt-1 text-sm text-[#8B98B0]">Links this game to a match entry so the recording shows on the game page and the home page.</p>
        <label className="block mt-4 text-[11px] uppercase tracking-wide text-[#8B98B0]">YouTube URL</label>
        <input type="url" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/watch?v=…" className={`${inputCls} mt-1`} />
        <label className="block mt-3 text-[11px] uppercase tracking-wide text-[#8B98B0]">VOD URL</label>
        <input type="url" value={vod} onChange={(e) => setVod(e.target.value)} placeholder="https://…" className={`${inputCls} mt-1`} />
        {err && <p className="mt-3 text-sm text-[#F87171]">{err}</p>}
        <div className="mt-5 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-[#22D3EE] text-[#0B0F1A] font-semibold hover:bg-[#67E8F9] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
