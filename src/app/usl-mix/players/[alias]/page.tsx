'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import UslMixShell, { Panel, StatTile, SideBadge, ResultBadge, fmtDate, fmtDuration, fmtDelta, tooltipStyle, tableCls, ClassName } from '@/components/usl-mix/UslMixShell';

interface PlayerProfile {
  alias: string;
  test_only?: boolean;
  rating: { rating: number; peak_rating: number; games: number; wins: number; losses: number; draws: number; win_rate: number | null; last_game_at: string } | null;
  career: { games: number; wins: number; losses: number; mix_games: number; kills: number; deaths: number; kd_ratio: number; accuracy: number | null; heal_amount: number; bio_dart_hits: number; play_seconds: number } | null;
  classes: Array<{ class_name: string; games: number; wins: number; kills: number; deaths: number; seconds: number }>;
  weapons: Array<{ weapon: string; kills: number }>;
  maps: Array<{ map_key: string; games: number; wins: number }>;
  rating_history: Array<{ game_id: string; rating_after: number; delta: number; created_at: string }>;
  recent_games: Array<{ game_id: string; ended_at: string; map_key: string | null; game_kind: string; rated?: boolean; team_a_name: string; team_a_kills: number; team_b_name: string; team_b_kills: number; side: string | null; result: string; primary_class: string; kills: number; deaths: number; accuracy: number | null; rating_delta: number | null; url: string }>;
}

export default function UslMixPlayerPage() {
  const params = useParams<{ alias: string }>();
  const [data, setData] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.alias) return;
    fetch(`/api/usl-mix/players/${params.alias}?games=30`)
      .then((r) => r.json())
      .then((r) => (r.success ? setData(r) : setError(r.error || 'Not found')))
      .catch((e) => setError(e.message));
  }, [params?.alias]);

  if (error) {
    return (
      <UslMixShell title="Player">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200 backdrop-blur-sm">{error}</div>
      </UslMixShell>
    );
  }
  if (!data) {
    return (
      <UslMixShell title="Player">
        <p className="text-gray-400 animate-pulse">Loading…</p>
      </UslMixShell>
    );
  }

  const history = data.rating_history.map((h, i) => ({ n: i + 1, rating: Number(h.rating_after), delta: Number(h.delta), date: h.created_at }));
  const c = data.career;
  const r = data.rating;

  return (
    <UslMixShell title={data.alias} subtitle={data.test_only ? 'Only seen in test snapshots so far (*mixstats sendnow). Real mix and pub games will replace this view.' : 'Mix rating and career totals recorded from USL Megamaps games.'}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile label="Rating" value={r ? Math.round(r.rating) : 'unrated'} hint={r ? `peak ${Math.round(r.peak_rating)} · ${r.games} rated` : 'no mix games yet'} />
        <StatTile label="Mix record" value={r ? `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ''}` : '—'} hint={r?.win_rate !== null && r ? `${r.win_rate}% wins` : undefined} />
        <StatTile label="K/D" value={c ? Number(c.kd_ratio).toFixed(2) : '—'} hint={c ? `${c.kills} kills · ${c.deaths} deaths` : undefined} />
        <StatTile label="Accuracy" value={c?.accuracy !== null && c ? `${c.accuracy}%` : '—'} hint="bio darts excluded" />
        <StatTile label="Games played" value={c?.games ?? 0} hint={c ? `${c.mix_games} mix · ${fmtDuration(c.play_seconds)} in game` : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Panel title="Rating history" className="lg:col-span-2" right={<span className="text-xs text-gray-500">per rated mix game</span>}>
          {history.length < 2 ? (
            <p className="text-sm text-gray-500">Needs at least two rated games.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="2 4" />
                  <XAxis dataKey="n" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['dataMin - 25', 'dataMax + 25']} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip {...tooltipStyle} formatter={(v: any, _n: any, item: any) => [`${Math.round(v)} (${fmtDelta(item?.payload?.delta)})`, 'Rating']} labelFormatter={(l) => `Game ${l} · ${fmtDate(history[Number(l) - 1]?.date)}`} />
                  <ReferenceLine y={1200} stroke="#6b7280" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="rating" stroke="#3987e5" strokeWidth={2} dot={{ r: 3, fill: '#3987e5', stroke: '#1f2937', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Classes" accent="green">
          {data.classes.length === 0 ? (
            <p className="text-sm text-gray-500">No games.</p>
          ) : (
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr className={tableCls.headRow}>
                  <th className="text-left py-1.5">Class</th>
                  <th className="text-right py-1.5">Games</th>
                  <th className="text-right py-1.5">Win %</th>
                  <th className="text-right py-1.5">K/D</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((k) => (
                  <tr key={k.class_name} className={tableCls.rowStatic}>
                    <td className="py-1.5"><ClassName name={k.class_name} /></td>
                    <td className="py-1.5 text-right tabular-nums text-gray-300">{k.games}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-300">{k.games ? Math.round((k.wins / k.games) * 100) : '—'}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-300">{k.deaths ? (k.kills / k.deaths).toFixed(2) : k.kills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Panel title="Kills by weapon" accent="amber">
          {data.weapons.length === 0 ? (
            <p className="text-sm text-gray-500">No kills yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.weapons.slice(0, 10).map((w) => (
                <li key={w.weapon} className="text-sm">
                  <div className="flex justify-between text-gray-300"><span>{w.weapon}</span><span className="tabular-nums">{w.kills}</span></div>
                  <div className="h-1.5 bg-gray-700 rounded mt-1"><div className="h-1.5 rounded" style={{ width: `${(w.kills / data.weapons[0].kills) * 100}%`, background: '#3987e5' }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Maps" accent="purple">
          {data.maps.length === 0 ? (
            <p className="text-sm text-gray-500">No games.</p>
          ) : (
            <table className={tableCls.table}>
              <tbody>
                {data.maps.map((m) => (
                  <tr key={m.map_key} className={tableCls.rowStatic}>
                    <td className="py-1.5 text-white">{m.map_key}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-300">{m.games} games</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-300">{m.games ? Math.round((m.wins / m.games) * 100) : 0}% won</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Support" accent="green">
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-gray-400">Heal output</dt><dd className="text-white tabular-nums">{c?.heal_amount?.toLocaleString() ?? 0} hp</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Bio dart hits</dt><dd className="text-white tabular-nums">{c?.bio_dart_hits ?? 0}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Last game</dt><dd className="text-white">{fmtDate(r?.last_game_at ?? data.recent_games[0]?.ended_at)}</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel title="Recent games">
        {data.recent_games.length === 0 ? (
          <p className="text-sm text-gray-500">No games.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr className={tableCls.headRow}>
                  <th className="text-left py-2 pr-2">When</th>
                  <th className="text-left py-2 px-2">Map</th>
                  <th className="text-left py-2 px-2">Game</th>
                  <th className="text-left py-2 px-2">Side</th>
                  <th className="text-left py-2 px-2">Result</th>
                  <th className="text-left py-2 px-2">Class</th>
                  <th className="text-right py-2 px-2">K</th>
                  <th className="text-right py-2 px-2">D</th>
                  <th className="text-right py-2 px-2">Acc</th>
                  <th className="text-right py-2 pl-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_games.map((g) => (
                  <tr key={g.game_id} className={tableCls.row}>
                    <td className="py-2 pr-2 text-gray-500 text-xs">{fmtDate(g.ended_at)}</td>
                    <td className="py-2 px-2 text-gray-300">{g.map_key ?? '—'}</td>
                    <td className="py-2 px-2">
                      <Link href={g.url} className="text-cyan-300 hover:text-cyan-200">
                        {g.team_a_name} {g.team_a_kills}–{g.team_b_kills} {g.team_b_name}
                      </Link>
                      <span className="ml-1 text-xs text-gray-500 uppercase">{g.game_kind}{g.game_kind === 'mix' && g.rated ? ' · rated' : ''}</span>
                    </td>
                    <td className="py-2 px-2"><SideBadge side={g.side} /></td>
                    <td className="py-2 px-2"><ResultBadge result={g.result} /></td>
                    <td className="py-2 px-2"><ClassName name={g.primary_class} /></td>
                    <td className="py-2 px-2 text-right tabular-nums text-white">{g.kills}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{g.deaths}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{g.accuracy !== null ? `${g.accuracy}%` : '—'}</td>
                    <td className={`py-2 pl-2 text-right tabular-nums ${g.rating_delta === null ? 'text-gray-500' : Number(g.rating_delta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtDelta(g.rating_delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </UslMixShell>
  );
}
