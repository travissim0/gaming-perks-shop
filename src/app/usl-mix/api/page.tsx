'use client';

import UslMixShell, { Panel } from '@/components/usl-mix/UslMixShell';

const BASE = 'https://www.freeinf.org';

function Code({ children }: { children: string }) {
  return <pre className="bg-gray-950/70 border border-cyan-500/15 rounded-xl p-3 text-xs text-gray-200 overflow-x-auto whitespace-pre">{children}</pre>;
}

function Endpoint({ method, path, desc, params, example }: { method: string; path: string; desc: string; params?: Array<[string, string]>; example?: string }) {
  return (
    <div className="border-b border-gray-800 pb-5 mb-5 last:border-0 last:mb-0 last:pb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{method}</span>
        <code className="text-cyan-300 text-sm">{path}</code>
      </div>
      <p className="text-sm text-gray-300 mb-2">{desc}</p>
      {params && (
        <table className="text-xs text-gray-400 mb-2">
          <tbody>
            {params.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 py-0.5 font-mono text-gray-300">{k}</td>
                <td className="py-0.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {example && <Code>{example}</Code>}
    </div>
  );
}

export default function UslMixApiDocsPage() {
  return (
    <UslMixShell
      title="Public API"
      subtitle="Read-only JSON with permissive CORS: any community site can build its own mix ELO or stats pages on top of the same data. No key needed for GET."
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Read endpoints">
            <Endpoint
              method="GET"
              path="/api/usl-mix/games"
              desc="Recent games newest first, each with a compact player list."
              params={[
                ['limit', 'default 25, max 100'],
                ['offset', 'pagination offset'],
                ['kind', 'mix | pub | test | all (default mix + pub)'],
                ['map', 'map key, e.g. els, kp, apollo'],
                ['alias', 'only games this player was in'],
                ['since', 'ISO date lower bound'],
                ['rated', 'true | false - only ELO-rated (or only unrated) games'],
              ]}
              example={`curl "${BASE}/api/usl-mix/games?kind=mix&rated=true&limit=5"`}
            />
            <Endpoint
              method="GET"
              path="/api/usl-mix/games/{id}"
              desc="One game in full: teams, every player row (kills, deaths, class time, accuracy, heals, weapon kills, rating change) and every kill event with weapon attribution."
              params={[['id', 'game UUID or the zone script match_id']]}
              example={`curl "${BASE}/api/usl-mix/games/<uuid>"`}
            />
            <Endpoint
              method="GET"
              path="/api/usl-mix/players"
              desc="Rating leaderboard (mix games) merged with career totals (mix + pub)."
              params={[
                ['limit', 'default 50, max 200'],
                ['minGames', 'minimum rated games, default 3'],
                ['sort', 'rating | games | kd | winrate | kills'],
                ['q', 'alias search'],
              ]}
              example={`curl "${BASE}/api/usl-mix/players?minGames=5&limit=20"`}
            />
            <Endpoint
              method="GET"
              path="/api/usl-mix/players/{alias}"
              desc="One player: rating + peak, record, career K/D and accuracy, class / weapon / map breakdowns, full rating history, recent games."
              params={[['games', 'recent games to include, default 20']]}
              example={`curl "${BASE}/api/usl-mix/players/SomeAlias"`}
            />
            <Endpoint
              method="GET"
              path="/api/usl-mix/insights"
              desc="Aggregates for charts: Titan vs Collective win rate overall and per map, class win rate / K-D / accuracy per class (and a class × map matrix), kills by weapon with LAW shrapnel rolled up to the LAW."
              params={[
                ['map', 'restrict class/weapon stats to one map'],
                ['kind', 'mix | pub | all'],
              ]}
              example={`curl "${BASE}/api/usl-mix/insights?map=els"`}
            />
          </Panel>

          <Panel title="Ingest (game server → site)">
            <Endpoint
              method="POST"
              path="/api/usl-mix/ingest"
              desc="Called by the USL zone script at Game.End. Requires the shared ingest key as x-api-key, Authorization: Bearer, or auth_key in the body. Re-posting the same match_id is a no-op (idempotent). action=test returns an echo without storing anything."
              example={`{
  "action": "game_result", "schema_version": 1, "script_version": "1.0.0",
  "match_id": "9d1f...", "zone_name": "USL - Megamaps", "arena_name": "Arena 1",
  "level_file": "uslMegamap2.lvl", "map_key": "els",
  "game_kind": "mix", "team_size": 8, "rated": true,
  "started_at": "2026-09-05T20:00:00Z", "ended_at": "2026-09-05T20:18:12Z",
  "duration_seconds": 1092, "end_reason": "mercy",
  "teams": [
    { "name": "Bes - T", "side": "T", "kills": 61, "deaths": 31, "result": "win", "captain": "Bes", "player_count": 8 },
    { "name": "Axi - C", "side": "C", "kills": 31, "deaths": 61, "result": "loss", "captain": "Axidus", "player_count": 8 }
  ],
  "players": [
    { "alias": "Bes", "side": "T", "team_name": "Bes - T", "result": "win", "is_captain": true,
      "primary_class": "Marine", "classes": { "Marine": 1080 },
      "kills": 12, "deaths": 3, "team_kills": 0, "kills_scoreboard": 12, "deaths_scoreboard": 3,
      "shots_fired": 240, "shots_landed": 96, "accuracy": 40.0, "bio_dart_hits": 0,
      "heal_amount": 0, "heal_uses": 0, "play_seconds": 1092,
      "weapon_kills": { "1004": { "name": "LAW", "count": 4 }, "1000": { "name": "Assault Rifle", "count": 8 } },
      "weapon_deaths": {} }
  ],
  "kill_events": [
    { "t": 15230, "killer": "Bes", "victim": "Axidus", "killer_side": "T", "victim_side": "C",
      "killer_class": "Marine", "victim_class": "Medic",
      "weapon_id": 1117, "weapon_name": "Shrapnel", "root_weapon_id": 1004, "root_weapon_name": "LAW",
      "team_kill": false, "kill_type": "Player", "attribution": "matched", "x": 17120, "y": 23504 }
  ]
}`}
            />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="How the rating works">
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>Everyone starts at <b>1200</b>. Only <b>mix</b> games where both captains typed <code>?rated</code> (<code>rated: true</code>) move ratings. Unrated mixes, casual games and test snapshots are stored for stats but leave ratings alone.</li>
              <li>Team strength = mean rating of its players. Expected score E = 1 / (1 + 10^((R<sub>opp</sub> − R<sub>team</sub>) / 400)).</li>
              <li>Base change = K × (S − E) × margin, K = 48 for a player&apos;s first 10 games, 32 after. The margin multiplier grows to 1.5× at a 40-kill blowout.</li>
              <li>
                <b>Fairness adjustment.</b> In 8v8 the weakest player often decides the game, so each player&apos;s change is scaled by their impact relative to their own team
                (kills − deaths + heals/150). A carry gains more on a win and loses less on a loss; a passenger gains less and loses more. Clamped to 0.6×–1.4×.
              </li>
              <li>Every change is logged with E, K and the performance multiplier, and the whole history can be replayed after the constants are tuned.</li>
            </ol>
            <p className="text-xs text-gray-500 mt-3">Constants live in <code>src/lib/uslMix/elo.ts</code>. GET <code>/api/usl-mix/admin/recompute</code> returns the live values.</p>
          </Panel>

          <Panel title="Field notes">
            <ul className="text-sm text-gray-300 space-y-2">
              <li><b>rated</b> is the per-mix ELO opt-in: off by default, on once both captains type <code>?rated</code> in the zone (a ref can force it with <code>*mix rated on|off</code>). Zone admins can flip it afterwards with <code>POST /api/usl-mix/admin/set-rated</code> {'{'} game_id, rated {'}'}, which replays all ratings.</li>
              <li><b>Side</b> is read from the team name: &quot;- T&quot; / Titan vs &quot;- C&quot; / Collective.</li>
              <li><b>map_key</b> is the megamap sub-map the zone had active (<code>*setmap</code>), else the level file name.</li>
              <li><b>kills</b> come from death events (enemy kills only, team kills separate); <b>kills_scoreboard</b> is the server&apos;s own counter for cross-checking.</li>
              <li><b>weapon_id</b> is the item that actually exploded (may be shrapnel); <b>root_weapon_id</b> walks the item chain back to the launcher, so LAW shrapnel counts as LAW.</li>
              <li><b>attribution</b>: matched = a shot by the killer landed near the victim in time and space; fallback = the killer&apos;s most recent shot; unknown = no shot found.</li>
              <li><b>heal_amount</b> is the HP that was missing on nearby team-mates when a heal fired (the same metric the league stats use).</li>
              <li>GET responses are cached for 30–60 seconds.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </UslMixShell>
  );
}
