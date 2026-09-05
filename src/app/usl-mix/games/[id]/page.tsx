'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import UslMixShell, { Panel, SideBadge, ResultBadge, SIDE_COLORS, fmtDate, fmtDuration, fmtDelta, tableCls } from '@/components/usl-mix/UslMixShell';

interface PlayerRow {
  alias: string; side: string | null; team_name: string; result: string; is_captain: boolean; primary_class: string; classes: Record<string, number>;
  kills: number; deaths: number; team_kills: number; kills_scoreboard: number | null; deaths_scoreboard: number | null;
  shots_fired: number; shots_landed: number; accuracy: number | null; bio_dart_hits: number; heal_amount: number; heal_uses: number; play_seconds: number;
  weapon_kills: Record<string, { name: string | null; count: number }>; rating_before: number | null; rating_after: number | null; rating_delta: number | null; performance: number | null;
}
interface KillEvent {
  t_ms: number; killer: string | null; victim: string; killer_side: string | null; victim_side: string | null; killer_class: string | null; victim_class: string | null;
  weapon_id: number | null; weapon_name: string | null; root_weapon_id: number | null; root_weapon_name: string | null; team_kill: boolean; kill_type: string; attribution: string;
}
interface GameDetail {
  game: any;
  players: PlayerRow[];
  kill_events: KillEvent[];
  weapon_summary: Array<{ weapon: string; kills: number; matched: number }>;
}

export default function UslMixGamePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

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

  const attribution = useMemo(() => {
    const c = { matched: 0, fallback: 0, unknown: 0, none: 0 };
    for (const e of data?.kill_events ?? []) (c as any)[e.attribution] = ((c as any)[e.attribution] ?? 0) + 1;
    return c;
  }, [data]);

  const mismatches = useMemo(
    () => (data?.players ?? []).filter((p) => (p.kills_scoreboard !== null && p.kills_scoreboard !== p.kills) || (p.deaths_scoreboard !== null && p.deaths_scoreboard !== p.deaths)).length,
    [data]
  );

  if (error) {
    return (
      <UslMixShell title="Game">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200 backdrop-blur-sm">{error}</div>
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
  const events = showAllEvents ? data.kill_events : data.kill_events.slice(0, 60);

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
            accent={t.side === 'C' ? 'amber' : 'cyan'}
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
                    <th className="text-left py-2 pr-2">Player</th>
                    <th className="text-left py-2 px-2">Class</th>
                    <th className="text-right py-2 px-2">K</th>
                    <th className="text-right py-2 px-2">D</th>
                    <th className="text-right py-2 px-2">Acc</th>
                    <th className="text-right py-2 px-2">Heal</th>
                    <th className="text-right py-2 px-2">Top weapon</th>
                    <th className="text-right py-2 pl-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {t.players.map((p) => {
                    const topW = Object.values(p.weapon_kills ?? {}).sort((a, b) => b.count - a.count)[0];
                    const kMis = p.kills_scoreboard !== null && p.kills_scoreboard !== p.kills;
                    const dMis = p.deaths_scoreboard !== null && p.deaths_scoreboard !== p.deaths;
                    return (
                      <tr key={p.alias} className={tableCls.rowStatic}>
                        <td className="py-2 pr-2">
                          <Link href={`/usl-mix/players/${encodeURIComponent(p.alias)}`} className="text-cyan-300 hover:text-cyan-200 font-medium">{p.alias}</Link>
                          {p.is_captain && <span className="ml-1 text-xs text-amber-300" title="captain">★</span>}
                        </td>
                        <td className="py-2 px-2 text-gray-300">{p.primary_class}</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${kMis ? 'text-amber-300' : 'text-white'}`} title={kMis ? `scoreboard says ${p.kills_scoreboard}` : undefined}>
                          {p.kills}{p.team_kills ? <span className="text-xs text-rose-400"> ({p.team_kills}tk)</span> : null}
                        </td>
                        <td className={`py-2 px-2 text-right tabular-nums ${dMis ? 'text-amber-300' : 'text-gray-300'}`} title={dMis ? `scoreboard says ${p.deaths_scoreboard}` : undefined}>{p.deaths}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.accuracy !== null ? `${p.accuracy}%` : '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-300">{p.heal_amount || (p.bio_dart_hits ? `${p.bio_dart_hits} darts` : '—')}</td>
                        <td className="py-2 px-2 text-right text-gray-400 text-xs">{topW ? `${topW.name ?? '?'} ×${topW.count}` : '—'}</td>
                        <td className={`py-2 pl-2 text-right tabular-nums ${p.rating_delta === null ? 'text-gray-500' : Number(p.rating_delta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtDelta(p.rating_delta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      {/* Data quality */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <Panel title="Weapon summary" accent="amber">
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
                      <div className="h-1.5 rounded" style={{ width: `${(w.kills / max) * 100}%`, background: '#199e70' }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Recording quality" accent="green">
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-gray-400">Deaths recorded</dt><dd className="text-white tabular-nums">{data.kill_events.length}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Weapon matched (time + distance)</dt><dd className="text-white tabular-nums">{attribution.matched}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Weapon by fallback (recent shot)</dt><dd className="text-white tabular-nums">{attribution.fallback}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Unknown weapon</dt><dd className="text-white tabular-nums">{attribution.unknown}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Non-player deaths</dt><dd className="text-white tabular-nums">{attribution.none}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Scoreboard mismatches</dt><dd className={`tabular-nums ${mismatches ? 'text-amber-300' : 'text-emerald-300'}`}>{mismatches}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">ELO rated</dt><dd className={g.rated ? 'text-emerald-300' : 'text-gray-300'}>{g.game_kind !== 'mix' ? 'never (not a mix)' : g.rated ? 'yes (*mix rated on)' : 'no (host did not opt in)'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Rating pass ran</dt><dd className="text-white">{g.elo_applied && g.rated ? 'yes' : 'no'}</dd></div>
          </dl>
          <p className="text-xs text-gray-500 mt-3">Amber K/D cells differ from the server scoreboard; compare with the in-game breakdown when testing.</p>
        </Panel>
        <Panel title="Details" accent="purple">
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-gray-400">Match id</dt><dd className="text-gray-300 font-mono text-xs">{g.match_id}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Level file</dt><dd className="text-gray-300">{g.level_file ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Started</dt><dd className="text-gray-300">{fmtDate(g.started_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Script</dt><dd className="text-gray-300">v{g.script_version ?? '?'} · schema {g.schema_version}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">JSON</dt><dd><a className="text-cyan-300 hover:text-cyan-200" href={`/api/usl-mix/games/${g.id}`} target="_blank" rel="noreferrer">/api/usl-mix/games/{g.id.slice(0, 8)}…</a></dd></div>
          </dl>
        </Panel>
      </div>

      {/* Kill feed */}
      <Panel title="Kill feed" right={<span className="text-xs text-gray-500">{data.kill_events.length} events</span>}>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr className={tableCls.headRow}>
                  <th className="text-left py-1.5 pr-2">Time</th>
                  <th className="text-left py-1.5 px-2">Killer</th>
                  <th className="text-left py-1.5 px-2">Weapon</th>
                  <th className="text-left py-1.5 px-2">Victim</th>
                  <th className="text-left py-1.5 pl-2">Attribution</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className={`${tableCls.rowStatic} ${e.team_kill ? 'bg-rose-500/5' : ''}`}>
                    <td className="py-1.5 pr-2 text-gray-500 tabular-nums">{fmtDuration(Math.floor(e.t_ms / 1000))}</td>
                    <td className="py-1.5 px-2">
                      {e.killer ? (
                        <span style={{ color: e.killer_side === 'T' || e.killer_side === 'C' ? SIDE_COLORS[e.killer_side as 'T' | 'C'] : undefined }}>
                          {e.killer} <span className="text-gray-500 text-xs">{e.killer_class}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500">{e.kill_type}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-gray-300">
                      {e.root_weapon_name ?? '—'}
                      {e.weapon_name && e.weapon_name !== e.root_weapon_name && <span className="text-gray-500 text-xs"> via {e.weapon_name}</span>}
                      {e.team_kill && <span className="ml-1 text-xs text-rose-400">TK</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      <span style={{ color: e.victim_side === 'T' || e.victim_side === 'C' ? SIDE_COLORS[e.victim_side as 'T' | 'C'] : undefined }}>
                        {e.victim} <span className="text-gray-500 text-xs">{e.victim_class}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pl-2 text-xs text-gray-500">{e.attribution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!showAllEvents && data.kill_events.length > events.length && (
              <button onClick={() => setShowAllEvents(true)} className="mt-3 text-sm text-cyan-300 hover:text-cyan-200">Show all {data.kill_events.length} events</button>
            )}
          </div>
        )}
      </Panel>
    </UslMixShell>
  );
}
