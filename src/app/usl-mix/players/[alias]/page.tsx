'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import UslMixShell, { Panel, StatTile, SideBadge, ResultBadge, fmtDate, fmtDuration, fmtDelta, tooltipStyle, tableCls, ClassName, SortTh, useSortedRows, SHOW_RATINGS, type SortGetters } from '@/components/usl-mix/UslMixShell';
import { BIO_DART_HEAL, totalHeal } from '@/lib/uslMix/types';

interface PlayerProfile {
  alias: string;
  test_only?: boolean;
  rating: { rating: number; peak_rating: number; games: number; wins: number; losses: number; draws: number; win_rate: number | null; last_game_at: string } | null;
  career: { games: number; wins: number; losses: number; mix_games: number; kills: number; deaths: number; kd_ratio: number; accuracy: number | null; heal_amount: number; bio_dart_hits: number; play_seconds: number; opening_kills?: number; opening_deaths?: number; opening_fights_won?: number } | null;
  classes: Array<{ class_name: string; games: number; wins: number; kills: number; deaths: number; seconds: number }>;
  weapons: Array<{ weapon: string; kills: number }>;
  maps: Array<{ map_key: string; games: number; wins: number }>;
  rating_history: Array<{ game_id: string; rating_after: number; delta: number; created_at: string }>;
  recent_games: Array<{ game_id: string; ended_at: string; map_key: string | null; game_kind: string; rated?: boolean; team_a_name: string; team_a_kills: number; team_b_name: string; team_b_kills: number; side: string | null; result: string; is_captain?: boolean; is_shotcaller?: boolean; primary_class: string; kills: number; deaths: number; accuracy: number | null; rating_delta: number | null; opening_kills?: number; url: string }>;
  leadership?: { captain_games: number; shotcaller_games: number };
}

type ClassRow = PlayerProfile['classes'][number];
type MapRow = PlayerProfile['maps'][number];
type RecentRow = PlayerProfile['recent_games'][number];
const CLASS_GETTERS: SortGetters<ClassRow, 'class' | 'games' | 'win' | 'kd'> = {
  class: (k) => k.class_name,
  games: (k) => k.games,
  win: (k) => (k.games ? k.wins / k.games : null),
  kd: (k) => (k.deaths ? k.kills / k.deaths : k.kills),
};
const MAP_GETTERS: SortGetters<MapRow, 'map' | 'games' | 'won'> = {
  map: (m) => m.map_key,
  games: (m) => m.games,
  won: (m) => (m.games ? m.wins / m.games : null),
};
const RECENT_GETTERS: SortGetters<RecentRow, 'when' | 'map' | 'side' | 'result' | 'class' | 'k' | 'd' | 'open' | 'acc' | 'delta'> = {
  when: (g) => new Date(g.ended_at).getTime(),
  map: (g) => g.map_key,
  side: (g) => g.side,
  result: (g) => g.result,
  class: (g) => g.primary_class,
  k: (g) => g.kills,
  d: (g) => g.deaths,
  open: (g) => g.opening_kills ?? 0,
  acc: (g) => g.accuracy,
  delta: (g) => g.rating_delta,
};
const NO_CLASSES: ClassRow[] = [];
const NO_MAPS: MapRow[] = [];
const NO_RECENT: RecentRow[] = [];

export default function UslMixPlayerPage() {
  const params = useParams<{ alias: string }>();
  const [data, setData] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const classTable = useSortedRows(data?.classes ?? NO_CLASSES, CLASS_GETTERS, { key: 'games', dir: 'desc' });
  const mapTable = useSortedRows(data?.maps ?? NO_MAPS, MAP_GETTERS, { key: 'games', dir: 'desc' });
  const recentTable = useSortedRows(data?.recent_games ?? NO_RECENT, RECENT_GETTERS, { key: 'when', dir: 'desc' });

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
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">{error}</div>
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
    <UslMixShell title={data.alias} subtitle={data.test_only ? 'Only seen in test snapshots so far (*mixstats sendnow). Real mix and pub games will replace this view.' : 'Career totals recorded from USL Megamaps games.'}>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {SHOW_RATINGS ? (
          <StatTile label="Rating" value={r ? Math.round(r.rating) : 'unrated'} hint={r ? `peak ${Math.round(r.peak_rating)} · ${r.games} rated` : 'no mix games yet'} />
        ) : (
          <StatTile label="Rated mixes" value={r?.games ?? 0} hint="rating hidden this season" />
        )}
        <StatTile label="Mix record" value={r ? `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ''}` : '—'} hint={r?.win_rate !== null && r ? `${r.win_rate}% wins` : undefined} />
        <StatTile label="K/D" value={c ? Number(c.kd_ratio).toFixed(2) : '—'} hint={c ? `${c.kills} kills · ${c.deaths} deaths` : undefined} />
        <StatTile label="Accuracy" value={c?.accuracy !== null && c ? `${c.accuracy}%` : '—'} hint="bio darts excluded" />
        <StatTile label="Games played" value={c?.games ?? 0} hint={c ? `${c.mix_games} mix · ${fmtDuration(c.play_seconds)} in game` : undefined} />
        <StatTile
          accent="amber"
          label="Opening kills"
          value={Number(c?.opening_kills ?? 0)}
          hint={c ? `${Number(c.opening_fights_won ?? 0)} fights won after${Number(c.opening_kills) ? ` (${Math.round((Number(c.opening_fights_won ?? 0) / Number(c.opening_kills)) * 100)}%)` : ''} · ${Number(c.opening_deaths ?? 0)} opening deaths` : 'first kill of each fight'}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {!SHOW_RATINGS ? (
        <Panel title="ELO ratings are hidden" className="lg:col-span-2" right={<span className="text-xs text-gray-500">mixes are for casual play</span>}>
          <p className="text-sm text-gray-400 max-w-prose">
            Tracked across {history.length} game{history.length === 1 ? '' : 's'}, but hidden — we use it internally to
            help make mixes more balanced, and that is all it does. Nobody is ranked against anybody.
          </p>
          <p className="text-sm text-gray-400 max-w-prose mt-3">
            Want to know your own? We&apos;re looking at letting registered players look it up. No pressure — mixes are
            designed for casual play, and your performance metrics are available to you on request.
          </p>
        </Panel>
        ) : (
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
        )}

        <Panel title="Classes" accent="green">
          {data.classes.length === 0 ? (
            <p className="text-sm text-gray-500">No games.</p>
          ) : (
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr className={tableCls.headRow}>
                  <SortTh col="class" sort={classTable.sort} onToggle={classTable.toggle} text className="text-left py-1.5">Class</SortTh>
                  <SortTh col="games" sort={classTable.sort} onToggle={classTable.toggle} className="text-right py-1.5">Games</SortTh>
                  <SortTh col="win" sort={classTable.sort} onToggle={classTable.toggle} className="text-right py-1.5">Win %</SortTh>
                  <SortTh col="kd" sort={classTable.sort} onToggle={classTable.toggle} className="text-right py-1.5">K/D</SortTh>
                </tr>
              </thead>
              <tbody>
                {classTable.rows.map((k) => (
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
              <thead className={tableCls.thead}>
                <tr className={tableCls.headRow}>
                  <SortTh col="map" sort={mapTable.sort} onToggle={mapTable.toggle} text className="text-left py-1.5">Map</SortTh>
                  <SortTh col="games" sort={mapTable.sort} onToggle={mapTable.toggle} className="text-right py-1.5">Games</SortTh>
                  <SortTh col="won" sort={mapTable.sort} onToggle={mapTable.toggle} className="text-right py-1.5">Won</SortTh>
                </tr>
              </thead>
              <tbody>
                {mapTable.rows.map((m) => (
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
            <div className="flex justify-between" title={`${(c?.heal_amount ?? 0).toLocaleString()} hp from MediKit + ${c?.bio_dart_hits ?? 0} bio darts x ${BIO_DART_HEAL} hp`}>
              <dt className="text-gray-400">Heal output</dt>
              <dd className="text-white tabular-nums">{totalHeal(c?.heal_amount, c?.bio_dart_hits).toLocaleString()} hp</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Bio dart hits</dt>
              <dd className="text-white tabular-nums">
                {c?.bio_dart_hits ?? 0}
                {c?.bio_dart_hits ? <span className="text-xs text-emerald-300"> (+{(c.bio_dart_hits * BIO_DART_HEAL).toLocaleString()})</span> : null}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-gray-400">Captained</dt><dd className="text-white tabular-nums">{data.leadership?.captain_games ?? 0} games</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400" title="claimed with ?sc in the zone - a badge, not a rating input">Called the shots</dt><dd className="text-white tabular-nums">{data.leadership?.shotcaller_games ?? 0} games</dd></div>
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
                  <SortTh col="when" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-left py-2 pr-2">When</SortTh>
                  <SortTh col="map" sort={recentTable.sort} onToggle={recentTable.toggle} text className="text-left py-2 px-2">Map</SortTh>
                  <th className="text-left py-2 px-2">Game</th>
                  <SortTh col="side" sort={recentTable.sort} onToggle={recentTable.toggle} text className="text-left py-2 px-2">Side</SortTh>
                  <SortTh col="result" sort={recentTable.sort} onToggle={recentTable.toggle} text className="text-left py-2 px-2">Result</SortTh>
                  <SortTh col="class" sort={recentTable.sort} onToggle={recentTable.toggle} text className="text-left py-2 px-2">Class</SortTh>
                  <SortTh col="k" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-right py-2 px-2">K</SortTh>
                  <SortTh col="d" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-right py-2 px-2">D</SortTh>
                  <SortTh col="open" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-right py-2 px-2" title="opening kills">Open</SortTh>
                  <SortTh col="acc" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-right py-2 px-2">Acc</SortTh>
                  {SHOW_RATINGS && <SortTh col="delta" sort={recentTable.sort} onToggle={recentTable.toggle} className="text-right py-2 pl-2">Δ</SortTh>}
                </tr>
              </thead>
              <tbody>
                {recentTable.rows.map((g) => (
                  <tr key={g.game_id} className={tableCls.row}>
                    <td className="py-2 pr-2 text-gray-500 text-xs">{fmtDate(g.ended_at)}</td>
                    <td className="py-2 px-2 text-gray-300">{g.map_key ?? '—'}</td>
                    <td className="py-2 px-2">
                      <Link href={g.url} className="text-cyan-300 hover:text-cyan-200">
                        {g.team_a_name} {g.team_a_kills}–{g.team_b_kills} {g.team_b_name}
                      </Link>
                      <span className="ml-1 text-xs text-gray-500 uppercase">{g.game_kind}{g.game_kind === 'mix' && g.rated ? ' · rated' : ''}</span>
                      {g.is_captain && <span className="ml-1 text-xs text-amber-300" title="captain">★</span>}
                      {g.is_shotcaller && <span className="ml-1 text-[10px] font-bold text-cyan-300 border border-cyan-500/40 rounded px-1" title="shotcaller">SC</span>}
                    </td>
                    <td className="py-2 px-2"><SideBadge side={g.side} /></td>
                    <td className="py-2 px-2"><ResultBadge result={g.result} /></td>
                    <td className="py-2 px-2"><ClassName name={g.primary_class} /></td>
                    <td className="py-2 px-2 text-right tabular-nums text-white">{g.kills}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{g.deaths}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{g.opening_kills ? <span className="text-amber-300">{g.opening_kills}</span> : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{g.accuracy !== null ? `${g.accuracy}%` : '—'}</td>
                    {SHOW_RATINGS && <td className={`py-2 pl-2 text-right tabular-nums ${g.rating_delta === null ? 'text-gray-500' : Number(g.rating_delta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtDelta(g.rating_delta)}</td>}
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
