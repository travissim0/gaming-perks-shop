'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import UslMixShell, { Panel, SideBadge, fmtDate, fmtDuration, controlCls, SegmentedControl } from '@/components/usl-mix/UslMixShell';

interface GameRow {
  id: string; ended_at: string; map_key: string | null; game_kind: string; rated?: boolean; duration_seconds: number; end_reason: string | null; team_size: number;
  team_a_name: string; team_a_side: string | null; team_a_kills: number; team_b_name: string; team_b_side: string | null; team_b_kills: number; winner_team: string | null;
  players: Array<{ alias: string; kills: number; deaths: number; primary_class: string }>;
}

const PAGE = 25;

export default function UslMixGamesPage() {
  const [kind, setKind] = useState<'all' | 'mix' | 'pub' | 'test'>('all');
  const [alias, setAlias] = useState('');
  const [offset, setOffset] = useState(0);
  const [games, setGames] = useState<GameRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (kind !== 'all') qs.set('kind', kind);
      else qs.set('kind', 'all');
      if (alias.trim()) qs.set('alias', alias.trim());
      const r = await fetch(`/api/usl-mix/games?${qs}`).then((x) => x.json());
      if (cancelled) return;
      setGames(r.data ?? []);
      setTotal(r.pagination?.total ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, alias, offset]);

  return (
    <UslMixShell title="Recorded games" subtitle="Every game the zone posted, newest first. Only mixes where both captains agreed with ?rated move ratings; everything else is recorded as casual play. Test snapshots (*mixstats sendnow) show under All or Test.">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SegmentedControl
          value={kind}
          onChange={(k) => { setKind(k); setOffset(0); }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'mix', label: 'Mix' },
            { value: 'pub', label: 'Pub' },
            { value: 'test', label: 'Test' },
          ]}
        />
        <input
          value={alias}
          onChange={(e) => { setAlias(e.target.value); setOffset(0); }}
          placeholder="Filter by player alias"
          className={`${controlCls} w-56`}
        />
        <span className="text-sm text-gray-500 ml-auto">{loading ? 'Loading…' : `${total} game${total === 1 ? '' : 's'}`}</span>
      </div>

      <Panel>
        {games.length === 0 && !loading ? (
          <p className="text-sm text-gray-500">No games match.</p>
        ) : (
          <ul className="divide-y divide-gray-700/30">
            {games.map((g) => {
              const top = g.players?.[0];
              return (
                <li key={g.id}>
                  <Link href={`/usl-mix/games/${g.id}`} className="grid md:grid-cols-[7rem_8rem_6rem_1fr_auto] gap-x-4 gap-y-1 items-center py-3 hover:bg-cyan-500/5 rounded-xl px-2 -mx-2 transition-colors">
                    <span className="text-xs text-gray-500">{fmtDate(g.ended_at)}</span>
                    <span className="flex items-center gap-1 w-fit">
                      <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-gray-600/60 text-gray-300 bg-gray-900/40">{g.game_kind}{g.team_size ? ` ${g.team_size}v${g.team_size}` : ''}</span>
                      {g.game_kind === 'mix' && g.rated && <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-emerald-500/40 text-emerald-300 bg-emerald-500/10" title="counted for ELO">rated</span>}
                    </span>
                    <span className="text-sm text-gray-300">{g.map_key ?? '—'}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <SideBadge side={g.team_a_side} />
                      <span className={g.winner_team === g.team_a_name ? 'text-white font-semibold' : 'text-gray-400'}>{g.team_a_name}</span>
                      <span className="tabular-nums text-white font-bold">{g.team_a_kills}–{g.team_b_kills}</span>
                      <span className={g.winner_team === g.team_b_name ? 'text-white font-semibold' : 'text-gray-400'}>{g.team_b_name}</span>
                      <SideBadge side={g.team_b_side} />
                    </span>
                    <span className="text-xs text-gray-500 text-right">
                      {fmtDuration(g.duration_seconds)} · {g.end_reason ?? '—'} · {g.players?.length ?? 0} players{top ? ` · top ${top.alias} ${top.kills}k` : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {total > PAGE && (
          <div className="flex justify-between items-center mt-4 text-sm">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="px-3.5 py-2 rounded-xl border border-gray-700/50 bg-gray-900/60 disabled:opacity-40 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors">← Newer</button>
            <span className="text-gray-500">{offset + 1}–{Math.min(total, offset + PAGE)} of {total}</span>
            <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="px-3.5 py-2 rounded-xl border border-gray-700/50 bg-gray-900/60 disabled:opacity-40 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors">Older →</button>
          </div>
        )}
      </Panel>
    </UslMixShell>
  );
}
