'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, LabelList } from 'recharts';
import UslMixShell, { Panel, StatTile, SideBadge, SIDE_COLORS, SERIES_NEUTRAL, fmtDate, fmtDuration, tooltipStyle, tableCls, controlCls, SegmentedControl } from '@/components/usl-mix/UslMixShell';

interface Insights {
  totals: { games: number; games_selected: number; players_rated: number; kills: number; avg_duration_seconds: number; maps: string[] };
  side_win_rates: {
    overall: { games: number; titan_wins: number; collective_wins: number; draws: number; titan_win_rate: number | null; collective_win_rate: number | null };
    by_map: Array<{ map_key: string; games: number; titan_wins: number; collective_wins: number; draws: number; titan_win_rate: number | null; collective_win_rate: number | null }>;
  };
  class_stats: Array<{ class_name: string; appearances: number; wins: number; losses: number; win_rate: number | null; kills: number; deaths: number; kd_ratio: number; kills_per_game: number; deaths_per_game: number; accuracy: number | null; heal_per_game: number }>;
  weapon_stats: Array<{ weapon: string; kills: number; share: number; kills_matched: number }>;
}

interface LeaderRow {
  rank: number; alias: string; rating: number; peak_rating: number; rated_games: number; wins: number; losses: number; win_rate: number | null; kills: number; deaths: number; kd_ratio: number; accuracy: number | null; url: string;
}

interface GameRow {
  id: string; ended_at: string; map_key: string | null; game_kind: string; duration_seconds: number; end_reason: string | null;
  team_a_name: string; team_a_side: string | null; team_a_kills: number; team_b_name: string; team_b_side: string | null; team_b_kills: number; winner_team: string | null; team_size: number;
  players: Array<{ alias: string }>;
}

export default function UslMixOverviewPage() {
  const [map, setMap] = useState('');
  const [kind, setKind] = useState<'all' | 'mix' | 'pub'>('all');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams();
        if (map) qs.set('map', map);
        qs.set('kind', kind);
        const [i, l, g] = await Promise.all([
          fetch(`/api/usl-mix/insights?${qs}`).then((r) => r.json()),
          fetch('/api/usl-mix/players?limit=25&minGames=1').then((r) => r.json()),
          fetch(`/api/usl-mix/games?limit=10${map ? `&map=${encodeURIComponent(map)}` : ''}${kind !== 'all' ? `&kind=${kind}` : ''}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (!i.success) throw new Error(i.error || 'insights failed');
        setInsights(i);
        setLeaders(l.data ?? []);
        setGames(g.data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [map, kind]);

  const sideChart = useMemo(() => {
    if (!insights) return [];
    const rows = insights.side_win_rates.by_map.filter((m) => m.games > 0 && (!map || m.map_key === map));
    return rows.map((m) => ({
      map: m.map_key,
      games: m.games,
      Titan: m.titan_win_rate ?? 0,
      Collective: m.collective_win_rate ?? 0,
      Draw: m.games ? Math.round((m.draws / m.games) * 1000) / 10 : 0,
    }));
  }, [insights, map]);

  const classChart = useMemo(
    () => (insights?.class_stats ?? []).filter((c) => c.wins + c.losses > 0).map((c) => ({ name: c.class_name, winRate: c.win_rate ?? 0, n: c.appearances })),
    [insights]
  );
  const weaponChart = useMemo(() => (insights?.weapon_stats ?? []).slice(0, 10).map((w) => ({ name: w.weapon, kills: w.kills, share: w.share })), [insights]);

  const empty = !loading && insights && insights.totals.games === 0;

  return (
    <UslMixShell
      title="USL Mix Stats"
      subtitle="Every mix and pub game on USL Megamaps, recorded straight from the zone: kills by weapon (LAW shrapnel credited to the LAW), class time, heals, accuracy, and a team-aware rating."
    >
      {error && <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200 backdrop-blur-sm">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="text-sm text-gray-400">Map</label>
        <select value={map} onChange={(e) => setMap(e.target.value)} className={controlCls}>
          <option value="">All maps</option>
          {(insights?.totals.maps ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className="text-sm text-gray-400 ml-2">Games</label>
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Mix + Pub' },
            { value: 'mix', label: 'Mix only' },
            { value: 'pub', label: 'Pub only' },
          ]}
        />
        {loading && <span className="text-sm text-gray-500 animate-pulse">Loading…</span>}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile label="Games recorded" value={insights?.totals.games_selected ?? '—'} hint={map ? `on ${map}` : 'all maps'} />
        <StatTile accent="purple" label="Rated players" value={insights?.totals.players_rated ?? '—'} hint="played at least one mix" />
        <StatTile accent="amber" label="Kills recorded" value={insights?.totals.kills?.toLocaleString() ?? '—'} hint="enemy kills with a weapon attributed" />
        <StatTile accent="green" label="Avg game length" value={insights ? fmtDuration(insights.totals.avg_duration_seconds) : '—'} hint="mercy rule ends games early" />
      </div>

      {empty && (
        <Panel className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-2">No games recorded yet</h2>
          <p className="text-gray-400 text-sm">
            The zone script posts a game here the moment it ends. To check the wiring, a mod can run <code className="text-cyan-300">*mixstats test</code> in the zone,
            then <code className="text-cyan-300">*mixstats sendnow</code> during any game to push a snapshot flagged as a test.
          </p>
        </Panel>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Leaderboard */}
        <Panel title="Rating leaderboard" className="lg:col-span-2" right={<span className="text-xs text-gray-500">mix games only · 1200 start</span>}>
          {leaders.length === 0 ? (
            <p className="text-sm text-gray-500">No rated players yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr className={tableCls.headRow}>
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2 pr-2">Player</th>
                    <th className="text-right py-2 px-2">Rating</th>
                    <th className="text-right py-2 px-2">Games</th>
                    <th className="text-right py-2 px-2">W–L</th>
                    <th className="text-right py-2 px-2">Win %</th>
                    <th className="text-right py-2 px-2">K/D</th>
                    <th className="text-right py-2 pl-2">Acc %</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((p) => (
                    <tr key={p.alias} className={tableCls.row}>
                      <td className="py-2 pr-2 text-gray-500 tabular-nums">{p.rank}</td>
                      <td className="py-2 pr-2">
                        <Link href={p.url} className="text-cyan-300 hover:text-cyan-200 font-medium">{p.alias}</Link>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-white tabular-nums">{Math.round(p.rating)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.rated_games}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.wins}–{p.losses}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.win_rate ?? '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.kd_ratio.toFixed(2)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-gray-300">{p.accuracy ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Side win rate overall */}
        <Panel title="Titan vs Collective" accent="purple">
          {insights && insights.side_win_rates.overall.games > 0 ? (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm" style={{ color: SIDE_COLORS.T }}>Titan {insights.side_win_rates.overall.titan_win_rate ?? 0}%</span>
                <span className="text-sm" style={{ color: SIDE_COLORS.C }}>Collective {insights.side_win_rates.overall.collective_win_rate ?? 0}%</span>
              </div>
              <div className="h-3 w-full rounded overflow-hidden flex bg-gray-700" role="img" aria-label="Share of wins by side">
                <div style={{ width: `${insights.side_win_rates.overall.titan_win_rate ?? 0}%`, background: SIDE_COLORS.T }} />
                <div className="bg-gray-900" style={{ width: 2 }} />
                <div style={{ width: `${insights.side_win_rates.overall.collective_win_rate ?? 0}%`, background: SIDE_COLORS.C }} />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {insights.side_win_rates.overall.games} games{map ? ` on ${map}` : ' across all maps'}: {insights.side_win_rates.overall.titan_wins} Titan wins, {insights.side_win_rates.overall.collective_wins} Collective wins, {insights.side_win_rates.overall.draws} draws.
                Team names decide the side (&quot;- T&quot; / &quot;- C&quot;).
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No games yet.</p>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Panel title="Side win rate by map" right={<span className="text-xs text-gray-500">% of games won</span>}>
          {sideChart.length === 0 ? (
            <p className="text-sm text-gray-500">No games yet.</p>
          ) : (
            <div style={{ height: Math.max(180, sideChart.length * 44 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sideChart} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke="#374151" strokeDasharray="2 4" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                  <YAxis type="category" dataKey="map" tick={{ fill: '#d1d5db', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip {...tooltipStyle} formatter={(v: any, name: any) => [`${v}%`, name]} labelFormatter={(l) => `${l} · ${sideChart.find((r) => r.map === l)?.games ?? 0} games`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} />
                  <Bar dataKey="Titan" stackId="a" fill={SIDE_COLORS.T} stroke="#1f2937" strokeWidth={2} />
                  <Bar dataKey="Collective" stackId="a" fill={SIDE_COLORS.C} stroke="#1f2937" strokeWidth={2} />
                  <Bar dataKey="Draw" stackId="a" fill="#4b5563" stroke="#1f2937" strokeWidth={2} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Class win rate" accent="green" right={<span className="text-xs text-gray-500">% of player-games won · dashed line = 50%</span>}>
          {classChart.length === 0 ? (
            <p className="text-sm text-gray-500">No games yet.</p>
          ) : (
            <div style={{ height: Math.max(180, classChart.length * 36 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChart} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} stroke="#374151" strokeDasharray="2 4" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v}%`, 'Win rate']} labelFormatter={(l) => `${l} · ${classChart.find((r) => r.name === l)?.n ?? 0} player-games`} />
                  <ReferenceLine x={50} stroke="#9ca3af" strokeDasharray="4 4" />
                  <Bar dataKey="winRate" fill={SERIES_NEUTRAL} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="n" position="right" formatter={(v: any) => `n=${v}`} style={{ fill: '#9ca3af', fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Panel title="Kills by weapon" accent="amber" right={<span className="text-xs text-gray-500">shrapnel rolled up to its launcher</span>}>
          {weaponChart.length === 0 ? (
            <p className="text-sm text-gray-500">No kills yet.</p>
          ) : (
            <div style={{ height: Math.max(180, weaponChart.length * 30 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weaponChart} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip {...tooltipStyle} formatter={(v: any, _n: any, item: any) => [`${v} kills (${item?.payload?.share}%)`, 'Kills']} />
                  <Bar dataKey="kills" fill={SERIES_NEUTRAL} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="share" position="right" formatter={(v: any) => `${v}%`} style={{ fill: '#9ca3af', fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Class table" className="lg:col-span-2" accent="green">
          {(insights?.class_stats.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No games yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead className={tableCls.thead}>
                  <tr className={tableCls.headRow}>
                    <th className="text-left py-2 pr-2">Class</th>
                    <th className="text-right py-2 px-2">Played</th>
                    <th className="text-right py-2 px-2">Win %</th>
                    <th className="text-right py-2 px-2">K / game</th>
                    <th className="text-right py-2 px-2">D / game</th>
                    <th className="text-right py-2 px-2">K/D</th>
                    <th className="text-right py-2 px-2">Acc %</th>
                    <th className="text-right py-2 pl-2">Heal / game</th>
                  </tr>
                </thead>
                <tbody>
                  {insights!.class_stats.map((c) => (
                    <tr key={c.class_name} className={tableCls.rowStatic}>
                      <td className="py-2 pr-2 text-white font-medium">{c.class_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{c.appearances}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{c.win_rate ?? '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{c.kills_per_game}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{c.deaths_per_game}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{Number(c.kd_ratio).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{c.accuracy ?? '—'}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-gray-300">{c.heal_per_game || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent games" right={<Link href="/usl-mix/games" className="text-sm text-cyan-300 hover:text-cyan-200">All games →</Link>}>
        {games.length === 0 ? (
          <p className="text-sm text-gray-500">No games yet.</p>
        ) : (
          <ul className="divide-y divide-gray-700/30">
            {games.map((g) => (
              <li key={g.id}>
                <Link href={`/usl-mix/games/${g.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-cyan-500/5 rounded-xl px-2 -mx-2 transition-colors">
                  <span className="text-xs text-gray-500 w-28">{fmtDate(g.ended_at)}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-gray-600/60 text-gray-300 bg-gray-900/40">{g.game_kind}{g.team_size ? ` ${g.team_size}v${g.team_size}` : ''}</span>
                  <span className="text-sm text-gray-300 w-24">{g.map_key ?? '—'}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <SideBadge side={g.team_a_side} />
                    <span className={g.winner_team === g.team_a_name ? 'text-white font-semibold' : 'text-gray-400'}>{g.team_a_name}</span>
                    <span className="tabular-nums text-white font-bold">{g.team_a_kills}–{g.team_b_kills}</span>
                    <span className={g.winner_team === g.team_b_name ? 'text-white font-semibold' : 'text-gray-400'}>{g.team_b_name}</span>
                    <SideBadge side={g.team_b_side} />
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">{fmtDuration(g.duration_seconds)} · {g.end_reason ?? '—'} · {g.players?.length ?? 0} players</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-gray-500 mt-8">
        Building your own mix tool? Everything on this page comes from the <Link href="/usl-mix/api" className="text-cyan-400 hover:text-cyan-300">public JSON API</Link>.
      </p>
    </UslMixShell>
  );
}
