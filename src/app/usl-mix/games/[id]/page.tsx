'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import UslMixShell, { Panel, SideBadge, ResultBadge, SIDE_COLORS, fmtDate, fmtDuration, fmtDelta, tableCls, tooltipStyle, ClassName, classColor, SortTh, sortRows, useSortState, SegmentedControl, SHOW_RATINGS, type SortGetters } from '@/components/usl-mix/UslMixShell';

/**
 * Class name plus, when a player spent real time as more than one class, a proportional split:
 * a thin stacked bar in class colours and a "Medic 62% · Marine 38%" line. Classes under 5% of the
 * game are folded away so a 10-second Marine at the dropship does not show up. Hover for minutes.
 */
function ClassSplit({ classes, primary }: { classes?: Record<string, number>; primary: string }) {
  const entries = Object.entries(classes ?? {})
    .map(([n, s]) => [n, Number(s)] as [string, number])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const shown = total > 0 ? entries.filter(([, s]) => s / total >= 0.05) : [];
  if (shown.length < 2) return <ClassName name={primary} />;
  return (
    <div className="min-w-[7rem]" title={entries.map(([n, s]) => `${n} ${fmtDuration(s)}`).join(' · ')}>
      <ClassName name={primary} />
      <div className="mt-1 flex h-1.5 w-28 overflow-hidden rounded-full bg-gray-800">
        {shown.map(([n, s]) => (
          <span key={n} style={{ width: `${(s / total) * 100}%`, background: classColor(n) ?? '#6b7280' }} />
        ))}
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[10px] text-gray-500">
        {shown.map(([n, s]) => `${n} ${Math.round((s / total) * 100)}%`).join(' · ')}
      </div>
    </div>
  );
}

interface PlayerRow {
  alias: string; side: string | null; team_name: string; result: string; is_captain: boolean; is_shotcaller?: boolean; is_vocal?: boolean; primary_class: string; classes: Record<string, number>;
  kills: number; deaths: number; team_kills: number; kills_scoreboard: number | null; deaths_scoreboard: number | null;
  shots_fired: number; shots_landed: number; accuracy: number | null; bio_dart_hits: number; heal_amount: number; heal_medikit: number; bio_dart_heal: number; heal_uses: number; play_seconds: number;
  weapon_kills: Record<string, { name: string | null; count: number }>; rating_before: number | null; rating_after: number | null; rating_delta: number | null; performance: number | null;
  opening_kills: number; opening_deaths: number; opening_fights_won: number;
}
type TeamCol = 'player' | 'class' | 'kills' | 'deaths' | 'hits' | 'open' | 'acc' | 'heal' | 'delta';
const TEAM_GETTERS: SortGetters<PlayerRow, TeamCol> = {
  player: (p) => p.alias,
  class: (p) => p.primary_class,
  kills: (p) => p.kills,
  deaths: (p) => p.deaths,
  hits: (p) => p.shots_landed,
  open: (p) => p.opening_kills,
  acc: (p) => p.accuracy,
  heal: (p) => p.heal_amount,
  delta: (p) => p.rating_delta,
};

interface KillEvent {
  t_ms: number; killer: string | null; victim: string; killer_side: string | null; victim_side: string | null; killer_class: string | null; victim_class: string | null;
  weapon_id: number | null; weapon_name: string | null; root_weapon_id: number | null; root_weapon_name: string | null; team_kill: boolean; kill_type: string; attribution: string;
  fight_no: number | null; is_opening: boolean;
}
interface Fight {
  no: number; start_ms: number; end_ms: number; kills: number; kills_t: number; kills_c: number;
  opener: string | null; opener_side: string | null; opener_class: string | null; opened_on: string; opened_on_side: string | null; opened_on_class: string | null; winner_side: 'T' | 'C' | null;
}
interface GameDetail {
  game: any;
  players: PlayerRow[];
  kill_events: KillEvent[];
  weapon_summary: Array<{ weapon: string; kills: number; matched: number }>;
  fights: Fight[];
  opening_lull_seconds: number;
}

const sideColor = (side: string | null | undefined) => (side === 'T' || side === 'C' ? SIDE_COLORS[side] : undefined);

/** Kills within this many ms of the previous kill share one marker on the kills-over-time chart. */
const MARKER_CLUSTER_MS = 20_000;
interface KillCluster { start_ms: number; end_ms: number; events: KillEvent[]; a: number; b: number; openings: number }
interface TimelinePoint { t: number; a: number; b: number; diff: number; cluster: KillCluster | null; clusterEnd: boolean }

/**
 * Marker on a team's line at the last point of a kill cluster: radius grows with that team's kills
 * in the cluster (count printed inside from 2 up), an amber ring means the cluster opened a fight.
 * Recharts calls this for every point; points that are not a cluster end draw nothing.
 */
function killMarker(team: 'a' | 'b', color: string, props: any) {
  const pt: TimelinePoint | undefined = props?.payload;
  const c = pt?.cluster;
  if (!pt?.clusterEnd || !c) return null;
  const count = team === 'a' ? c.a : c.b;
  if (!count) return null;
  const r = 3 + Math.min(count, 6) * 0.8;
  return (
    <g key={`${team}-${props.index}`}>
      {c.openings > 0 && <circle cx={props.cx} cy={props.cy} r={r + 2.5} fill="none" stroke="#fbbf24" strokeWidth={1.2} opacity={0.9} />}
      <circle cx={props.cx} cy={props.cy} r={r} fill={color} stroke="#0a0e1a" strokeWidth={1.5} />
      {count > 1 && <text x={props.cx} y={props.cy} dy={3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#0a0e1a">{count}</text>}
    </g>
  );
}

/** A player in the kill feed: alias in their class color, a small dot for their side. */
function Actor({ alias, cls, side }: { alias: string; cls: string | null; side: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${cls ?? 'unknown class'} · ${side === 'T' ? 'Titan' : side === 'C' ? 'Collective' : 'side unknown'}`}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sideColor(side) ?? '#6b7280' }} />
      <span className="font-semibold" style={{ color: classColor(cls) ?? '#e5e7eb' }}>{alias}</span>
    </span>
  );
}

export default function UslMixGamePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [markers, setMarkers] = useState<'on' | 'off'>('on');

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/usl-mix/games/${params.id}`)
      .then((r) => r.json())
      .then((r) => (r.success ? setData(r) : setError(r.error || 'Not found')))
      .catch((e) => setError(e.message));
  }, [params?.id]);

  const teams = useMemo(() => {
    if (!data) return [];
    const g = data.game;
    return [
      { name: g.team_a_name, side: g.team_a_side, kills: g.team_a_kills, deaths: g.team_a_deaths, result: g.team_a_result, captain: g.team_a_captain },
      { name: g.team_b_name, side: g.team_b_side, kills: g.team_b_kills, deaths: g.team_b_deaths, result: g.team_b_result, captain: g.team_b_captain },
    ].map((t) => ({ ...t, players: data.players.filter((p) => p.team_name === t.name) }));
  }, [data]);

  /**
   * Cumulative enemy kills per team, one point per event plus the start and end of the game. Every
   * point also knows its marker cluster: kills within MARKER_CLUSTER_MS of the previous kill share
   * one, and only the cluster's last point draws the dot, so a 6-kill push is one labelled marker
   * instead of six. Hovering anywhere inside a cluster lists its kills in the tooltip.
   */
  const killTimeline = useMemo(() => {
    if (!data || teams.length < 2) return [];
    const teamOfAlias = new Map<string, number>();
    teams.forEach((t, i) => t.players.forEach((p) => teamOfAlias.set(p.alias.toLowerCase(), i)));
    const counts = [0, 0];
    const points: TimelinePoint[] = [{ t: 0, a: 0, b: 0, diff: 0, cluster: null, clusterEnd: false }];
    let cluster: KillCluster | null = null;
    let lastMs = -Infinity;
    for (const e of data.kill_events) {
      if (!e.killer || e.team_kill) continue;
      const idx = teamOfAlias.get(e.killer.toLowerCase());
      if (idx === undefined) continue;
      counts[idx]++;
      if (!cluster || e.t_ms - lastMs > MARKER_CLUSTER_MS) cluster = { start_ms: e.t_ms, end_ms: e.t_ms, events: [], a: 0, b: 0, openings: 0 };
      cluster.events.push(e);
      cluster.end_ms = e.t_ms;
      if (idx === 0) cluster.a++;
      else cluster.b++;
      if (e.is_opening) cluster.openings++;
      lastMs = e.t_ms;
      const prev = points[points.length - 1];
      if (prev.cluster === cluster) prev.clusterEnd = false;
      points.push({ t: Math.round(e.t_ms / 600) / 100, a: counts[0], b: counts[1], diff: counts[0] - counts[1], cluster, clusterEnd: true });
    }
    const endMin = Math.round((data.game.duration_seconds / 60) * 100) / 100;
    if (points[points.length - 1].t < endMin) points.push({ t: endMin, a: counts[0], b: counts[1], diff: counts[0] - counts[1], cluster: null, clusterEnd: false });
    return points;
  }, [data, teams]);

  const attribution = useMemo(() => {
    const c = { matched: 0, fallback: 0, unknown: 0, none: 0 };
    for (const e of data?.kill_events ?? []) (c as any)[e.attribution] = ((c as any)[e.attribution] ?? 0) + 1;
    return c;
  }, [data]);

  const mismatches = useMemo(
    () => (data?.players ?? []).filter((p) => (p.kills_scoreboard !== null && p.kills_scoreboard !== p.kills) || (p.deaths_scoreboard !== null && p.deaths_scoreboard !== p.deaths)).length,
    [data]
  );

  // one sort for both team boards, so clicking "D" on one side sorts the other side the same way
  const { sort: teamSort, toggle: toggleTeamSort } = useSortState<TeamCol>({ key: 'kills', dir: 'desc' });

  if (error) {
    return (
      <UslMixShell title="Game">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">{error}</div>
      </UslMixShell>
    );
  }
  if (!data) {
    return (
      <UslMixShell title="Game">
        <p className="text-gray-400 animate-pulse">Loading…</p>
      </UslMixShell>
    );
  }

  const g = data.game;
  const [ta, tb] = teams;
  const colorA = sideColor(ta.side) ?? '#3987e5';
  const colorB = sideColor(tb.side) ?? '#d95926';

  return (
    <UslMixShell
      title={`${g.team_a_name} ${g.team_a_kills} – ${g.team_b_kills} ${g.team_b_name}`}
      subtitle={`${g.game_kind.toUpperCase()}${g.team_size ? ` ${g.team_size}v${g.team_size}` : ''}${g.game_kind === 'mix' ? (g.rated ? ' · ELO RATED' : ' · unrated') : ''} on ${g.map_key ?? g.level_file ?? 'unknown map'} · ${fmtDate(g.ended_at)} · ${fmtDuration(g.duration_seconds)} · ended by ${g.end_reason ?? '—'}${g.zone_name ? ` · ${g.zone_name}` : ''}${g.arena_name ? ` / ${g.arena_name}` : ''}`}
    >
      {/* Scoreboards */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {teams.map((t) => (
          <Panel
            key={t.name}
            title={t.name}
            accent={t.side === 'C' ? 'amber' : 'green'}
            right={
              <div className="flex items-center gap-2">
                <SideBadge side={t.side} />
                <ResultBadge result={t.result} />
                <span className="text-xl font-bold text-white tabular-nums">{t.kills}</span>
              </div>
            }
          >
            {t.captain && <p className="text-xs text-gray-500 mb-2">Captain: {t.captain}</p>}
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr className={tableCls.headRow}>
                    <SortTh col="player" sort={teamSort} onToggle={toggleTeamSort} text className="text-left py-2 pr-2">Player</SortTh>
                    <SortTh col="class" sort={teamSort} onToggle={toggleTeamSort} text className="text-left py-2 px-2">Class</SortTh>
                    <SortTh col="kills" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2">K</SortTh>
                    <SortTh col="deaths" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2">D</SortTh>
                    <SortTh col="hits" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2" title="shots that hit an enemy (bio darts not counted)">Hits</SortTh>
                    <SortTh col="open" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2" title="opening kills (fights won after)">Open</SortTh>
                    <SortTh col="acc" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2">Acc</SortTh>
                    <SortTh col="heal" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 px-2">Heal</SortTh>
                    {SHOW_RATINGS && <SortTh col="delta" sort={teamSort} onToggle={toggleTeamSort} className="text-right py-2 pl-2">Δ</SortTh>}
                  </tr>
                </thead>
                <tbody>
                  {sortRows(t.players, TEAM_GETTERS, teamSort).map((p) => (
                    <tr key={p.alias} className={tableCls.rowStatic}>
                      <td className="py-2 pr-2">
                        <Link href={`/usl-mix/players/${encodeURIComponent(p.alias)}`} className="text-cyan-300 hover:text-cyan-200 font-medium">{p.alias}</Link>
                        {p.is_captain && <span className="ml-1 text-xs text-amber-300" title="captain">★</span>}
                        {p.is_shotcaller && <span className="ml-1 text-[10px] font-bold text-cyan-300 border border-cyan-500/40 rounded px-1" title="shotcaller (claimed with ?sc)">SC</span>}
                        {p.is_vocal && <span className="ml-1 text-[10px] font-bold text-violet-300 border border-violet-500/40 rounded px-1" title="on comms (claimed with ?v)">V</span>}
                      </td>
                      <td className="py-2 px-2"><ClassSplit classes={p.classes} primary={p.primary_class} /></td>
                      <td className="py-2 px-2 text-right tabular-nums text-white">
                        {p.kills}{p.team_kills ? <span className="text-xs text-rose-400" title="team kills"> ({p.team_kills}tk)</span> : null}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.deaths}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300" title={p.shots_fired ? `${p.shots_landed} of ${p.shots_fired} shots` : undefined}>{p.shots_landed || '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap" title={`${p.opening_kills} opening kills · ${p.opening_fights_won} fights won after · ${p.opening_deaths} opening deaths`}>
                        {p.opening_kills ? <span className="text-amber-300 font-semibold">{p.opening_kills}</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.accuracy !== null ? `${p.accuracy}%` : '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300 whitespace-nowrap"
                          title={p.bio_dart_hits ? `${p.heal_medikit} hp from MediKit + ${p.bio_dart_heal} hp from ${p.bio_dart_hits} bio darts` : undefined}>
                        {p.heal_amount || '—'}
                        {p.bio_dart_hits ? <span className="text-xs text-emerald-300"> (+{p.bio_dart_heal})</span> : null}
                      </td>
                      {SHOW_RATINGS && <td className={`py-2 pl-2 text-right tabular-nums ${p.rating_delta === null ? 'text-gray-500' : Number(p.rating_delta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtDelta(p.rating_delta)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      {/* Fights and opening kills */}
      <div className="mb-6">
        <Panel
          title="Fights and opening kills"
          accent="amber"
          right={<span className="text-xs text-gray-500">{data.fights.length} fights · a new fight starts after {data.opening_lull_seconds}s without a kill</span>}
        >
          {data.fights.length === 0 ? (
            <p className="text-sm text-gray-500">No kills.</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Opened by <span style={{ color: sideColor('T') }}>Titan {data.fights.filter((f) => f.opener_side === 'T').length}</span>
                {' · '}
                <span style={{ color: sideColor('C') }}>Collective {data.fights.filter((f) => f.opener_side === 'C').length}</span>
                {' · '}the opening side went on to win {data.fights.filter((f) => f.winner_side && f.winner_side === f.opener_side).length} of {data.fights.length} fights on kills
              </p>
              <div className="overflow-x-auto">
                <table className={tableCls.table}>
                  <thead className={tableCls.thead}>
                    <tr className={tableCls.headRow}>
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2 px-2">When</th>
                      <th className="text-left py-2 px-2">Opening kill</th>
                      <th className="text-left py-2 px-2">On</th>
                      <th className="text-right py-2 px-2" title="Titan – Collective">Kills</th>
                      <th className="text-left py-2 pl-2">Won by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fights.map((f) => (
                      <tr key={f.no} className={tableCls.rowStatic}>
                        <td className="py-2 pr-2 text-gray-500 tabular-nums">{f.no}</td>
                        <td className="py-2 px-2 text-gray-400 tabular-nums text-xs whitespace-nowrap">{fmtDuration(Math.floor(f.start_ms / 1000))}{f.end_ms > f.start_ms ? ` – ${fmtDuration(Math.floor(f.end_ms / 1000))}` : ''}</td>
                        <td className="py-2 px-2">{f.opener ? <Actor alias={f.opener} cls={f.opener_class} side={f.opener_side} /> : '—'}</td>
                        <td className="py-2 px-2"><Actor alias={f.opened_on} cls={f.opened_on_class} side={f.opened_on_side} /></td>
                        <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                          <span style={{ color: sideColor('T') }}>{f.kills_t}</span>
                          <span className="text-gray-500"> – </span>
                          <span style={{ color: sideColor('C') }}>{f.kills_c}</span>
                        </td>
                        <td className="py-2 pl-2">{f.winner_side ? <SideBadge side={f.winner_side} /> : <span className="text-xs text-gray-500">even</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Kills over time + kill feed side by side */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Panel
          title="Kills over time"
          accent="purple"
          right={
            <div className="flex flex-wrap items-center gap-3 justify-end">
              <span className="text-xs text-gray-500">cumulative enemy kills · minutes{markers === 'on' ? ` · dot = kills within ${MARKER_CLUSTER_MS / 1000}s, ring = opened a fight` : ''}</span>
              <SegmentedControl value={markers} onChange={setMarkers} options={[{ value: 'on', label: 'Kill markers' }, { value: 'off', label: 'Lines only' }]} />
            </div>
          }
        >
          {killTimeline.length < 2 ? (
            <p className="text-sm text-gray-500">No kill events.</p>
          ) : (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={killTimeline} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="2 4" />
                  <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v)}m`} />
                  <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    {...tooltipStyle}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const pt: TimelinePoint = payload[0].payload;
                      const c = markers === 'on' ? pt.cluster : null;
                      return (
                        <div style={tooltipStyle.contentStyle as any} className="px-3 py-2">
                          <div style={{ color: '#9ca3af' }}>{Number(label).toFixed(1)} min</div>
                          <div style={{ color: colorA }}>{ta.name}: {pt.a}</div>
                          <div style={{ color: colorB }}>{tb.name}: {pt.b}</div>
                          <div className="text-gray-300">lead: {pt.diff > 0 ? `${ta.name} +${pt.diff}` : pt.diff < 0 ? `${tb.name} +${-pt.diff}` : 'even'}</div>
                          {c && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-700/60">
                              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                                {c.events.length} kill{c.events.length === 1 ? '' : 's'} · {fmtDuration(Math.floor(c.start_ms / 1000))}{c.end_ms > c.start_ms ? ` – ${fmtDuration(Math.floor(c.end_ms / 1000))}` : ''}
                              </div>
                              {c.events.slice(0, 8).map((e, i) => (
                                <div key={i} className="whitespace-nowrap">
                                  <span className="font-semibold" style={{ color: sideColor(e.killer_side) ?? '#e5e7eb' }}>{e.killer}</span>
                                  <span className="text-gray-500"> ▸ </span>
                                  <span style={{ color: sideColor(e.victim_side) ?? '#e5e7eb' }}>{e.victim}</span>
                                  {e.root_weapon_name && <span className="text-gray-500"> · {e.root_weapon_name}</span>}
                                  {e.is_opening && <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">open</span>}
                                </div>
                              ))}
                              {c.events.length > 8 && <div className="text-gray-500">+{c.events.length - 8} more</div>}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} formatter={(v) => (v === 'a' ? ta.name : tb.name)} />
                  <Line type="stepAfter" dataKey="a" stroke={colorA} strokeWidth={2} dot={markers === 'on' ? ((p: any) => killMarker('a', colorA, p)) as any : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="b" stroke={colorB} strokeWidth={2} dot={markers === 'on' ? ((p: any) => killMarker('b', colorB, p)) as any : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Kill feed" right={<span className="text-xs text-gray-500">{data.kill_events.length} deaths · names in class color, dot = side</span>}>
          {data.kill_events.length === 0 ? (
            <p className="text-sm text-gray-500">No events.</p>
          ) : (
            <div className="overflow-auto pr-1" style={{ maxHeight: 340 }}>
              <table className={tableCls.table}>
                <thead className={`${tableCls.thead} sticky top-0 bg-gray-900/90`}>
                  <tr className={tableCls.headRow}>
                    <th className="text-left py-1.5 pr-2">Time</th>
                    <th className="text-left py-1.5 px-2">Killer</th>
                    <th className="text-left py-1.5 px-2">Weapon</th>
                    <th className="text-left py-1.5 pl-2">Victim</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kill_events.map((e, i) => (
                    <tr key={i} className={`${tableCls.rowStatic} ${e.team_kill ? 'bg-rose-500/5' : e.is_opening ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-1.5 pr-2 text-gray-500 tabular-nums text-xs whitespace-nowrap">
                        {fmtDuration(Math.floor(e.t_ms / 1000))}
                        {e.is_opening && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-300" title={`opening kill of fight ${e.fight_no}`}>open</span>}
                      </td>
                      <td className="py-1.5 px-2">{e.killer ? <Actor alias={e.killer} cls={e.killer_class} side={e.killer_side} /> : <span className="text-gray-500">{e.kill_type}</span>}</td>
                      <td className="py-1.5 px-2 text-gray-300">
                        {e.root_weapon_name ?? '—'}
                        {e.team_kill && <span className="ml-1 text-xs text-rose-400">TK</span>}
                      </td>
                      <td className="py-1.5 pl-2"><Actor alias={e.victim} cls={e.victim_class} side={e.victim_side} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Extras, collapsed by default */}
      <button
        onClick={() => setShowExtras((v) => !v)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white px-3.5 py-2 rounded-xl border border-gray-700/50 bg-gray-900/60 hover:border-cyan-500/40 transition-colors"
      >
        <span className={`inline-block transition-transform ${showExtras ? 'rotate-90' : ''}`}>▸</span>
        {showExtras ? 'Hide' : 'Show'} weapon breakdown, diagnostics and raw details
      </button>

      {showExtras && (
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <Panel title="Weapon breakdown" accent="amber" right={<span className="text-xs text-gray-500">shrapnel credited to its launcher</span>}>
            {data.weapon_summary.length === 0 ? (
              <p className="text-sm text-gray-500">No attributed kills.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.weapon_summary.map((w) => {
                  const max = data.weapon_summary[0].kills;
                  return (
                    <li key={w.weapon} className="text-sm">
                      <div className="flex justify-between text-gray-300">
                        <span>{w.weapon}</span>
                        <span className="tabular-nums">{w.kills}</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded mt-1">
                        <div className="h-1.5 rounded" style={{ width: `${(w.kills / max) * 100}%`, background: '#3987e5' }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Diagnostics" accent="green">
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-gray-400">Deaths recorded</dt><dd className="text-white tabular-nums">{data.kill_events.length}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Weapon identified by a nearby shot</dt><dd className="text-white tabular-nums">{attribution.matched}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Weapon guessed from the killer&apos;s last shot</dt><dd className="text-white tabular-nums">{attribution.fallback}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Weapon unknown</dt><dd className="text-white tabular-nums">{attribution.unknown}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Deaths with no killer (terrain etc.)</dt><dd className="text-white tabular-nums">{attribution.none}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Players whose K/D differs from the in-game scoreboard</dt><dd className={`tabular-nums ${mismatches ? 'text-amber-300' : 'text-emerald-300'}`}>{mismatches}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">ELO rated</dt><dd className={g.rated ? 'text-emerald-300' : 'text-gray-300'}>{g.game_kind !== 'mix' ? 'never (not a mix)' : g.rated ? 'yes (both captains agreed)' : 'no (captains did not both ?rated)'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Rating pass ran</dt><dd className="text-white">{g.elo_applied && g.rated ? 'yes' : 'no'}</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mt-3">Kills and deaths come from the death events the zone saw; the scoreboard comparison is a sanity check that they add up to what the game itself counted.</p>
          </Panel>
          <Panel title="Details" accent="purple">
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3"><dt className="text-gray-400">Match id</dt><dd className="text-gray-300 font-mono text-xs break-all text-right">{g.match_id}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Level file</dt><dd className="text-gray-300">{g.level_file ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Started</dt><dd className="text-gray-300">{fmtDate(g.started_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Script</dt><dd className="text-gray-300">v{g.script_version ?? '?'} · schema {g.schema_version}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">JSON</dt><dd><a className="text-cyan-300 hover:text-cyan-200" href={`/api/usl-mix/games/${g.id}`} target="_blank" rel="noreferrer">/api/usl-mix/games/{g.id.slice(0, 8)}…</a></dd></div>
            </dl>
          </Panel>
        </div>
      )}
    </UslMixShell>
  );
}
