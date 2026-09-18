/**
 * Season scoring: rules, points and standings computation. Pure functions,
 * safe for client and server. Generic leagues only (CTFPL has its own tables).
 *
 * Two presets:
 *   classic — 3 win / 1 loss / 0 no-show, every match equal (the old behaviour)
 *   points  — CTFDL S5: RS/FS matches, fast wins pay more, losses still pay,
 *             forfeits pay nothing, ranked by points with RS-first tiebreakers
 */

export type MatchKind = 'rs' | 'fs';
export type WinType = 'regulation' | 'ot' | '2ot';
export type Outcome = 'win' | 'loss' | 'forfeit';

export interface PointsTable { regulation: number; ot: number; ot2: number; loss: number; forfeit: number }

export interface ScoringRules {
  preset: 'classic' | 'points';
  /** Points by match kind. Classic uses rs for everything. */
  points: { rs: PointsTable; fs: PointsTable };
  /** A win at or past ot_minutes is OT; at or past ot2_minutes is 2OT. */
  ot_minutes: number;
  ot2_minutes: number;
  fs: {
    enabled: boolean;
    per_week: number;
    per_opponent_week: number;
    per_opponent_season: number;
    /** FS results only count with a ref or a recording. */
    needs_verification: boolean;
    /** A forfeited FS is a no-contest: nobody scores. */
    forfeit_no_contest: boolean;
  };
  playoff_spots: number;
  tiebreakers: Tiebreaker[];
}

export type Tiebreaker = 'rs_h2h' | 'rs_wins' | 'reg_wins' | 'fewest_forfeits' | 'avg_rs_win_time' | 'win_pct' | 'ot_wins' | 'kd' | 'wins';

export const CLASSIC_RULES: ScoringRules = {
  preset: 'classic',
  points: {
    rs: { regulation: 3, ot: 3, ot2: 3, loss: 1, forfeit: 0 },
    fs: { regulation: 3, ot: 3, ot2: 3, loss: 1, forfeit: 0 },
  },
  ot_minutes: 30,
  ot2_minutes: 45,
  fs: { enabled: false, per_week: 0, per_opponent_week: 0, per_opponent_season: 0, needs_verification: false, forfeit_no_contest: false },
  playoff_spots: 4,
  tiebreakers: ['win_pct', 'reg_wins', 'ot_wins', 'kd', 'wins'],
};

export const POINTS_RULES: ScoringRules = {
  preset: 'points',
  points: {
    rs: { regulation: 30, ot: 27, ot2: 24, loss: 6, forfeit: 0 },
    fs: { regulation: 5, ot: 4, ot2: 3, loss: 1, forfeit: 0 },
  },
  ot_minutes: 30,
  ot2_minutes: 45,
  fs: { enabled: true, per_week: 2, per_opponent_week: 1, per_opponent_season: 3, needs_verification: true, forfeit_no_contest: true },
  playoff_spots: 4,
  tiebreakers: ['rs_h2h', 'rs_wins', 'reg_wins', 'fewest_forfeits', 'avg_rs_win_time'],
};

export const TIEBREAKER_LABEL: Record<Tiebreaker, string> = {
  rs_h2h: 'RS head-to-head',
  rs_wins: 'RS wins',
  reg_wins: 'regulation wins',
  fewest_forfeits: 'fewest forfeits',
  avg_rs_win_time: 'fastest average RS win',
  win_pct: 'win %',
  ot_wins: 'overtime wins',
  kd: 'K/D',
  wins: 'wins',
};

/** Fill any missing fields from the preset so old/partial rows still work. */
export function normalizeRules(raw: unknown): ScoringRules {
  if (!raw || typeof raw !== 'object') return CLASSIC_RULES;
  const r = raw as Partial<ScoringRules>;
  const base = r.preset === 'points' ? POINTS_RULES : CLASSIC_RULES;
  return {
    preset: base.preset,
    points: {
      rs: { ...base.points.rs, ...(r.points?.rs || {}) },
      fs: { ...base.points.fs, ...(r.points?.fs || {}) },
    },
    ot_minutes: typeof r.ot_minutes === 'number' ? r.ot_minutes : base.ot_minutes,
    ot2_minutes: typeof r.ot2_minutes === 'number' ? r.ot2_minutes : base.ot2_minutes,
    fs: { ...base.fs, ...(r.fs || {}) },
    playoff_spots: typeof r.playoff_spots === 'number' ? r.playoff_spots : base.playoff_spots,
    tiebreakers: Array.isArray(r.tiebreakers) && r.tiebreakers.length ? (r.tiebreakers as Tiebreaker[]) : base.tiebreakers,
  };
}

/** Which win band a match length falls in under these rules. */
export function winTypeFromMinutes(rules: ScoringRules, minutes: number | null | undefined): WinType | null {
  if (minutes == null || Number.isNaN(minutes)) return null;
  if (minutes >= rules.ot2_minutes) return '2ot';
  if (minutes >= rules.ot_minutes) return 'ot';
  return 'regulation';
}

export function pointsFor(rules: ScoringRules, kind: MatchKind, outcome: Outcome, winType: WinType | null): number {
  const t = rules.points[kind];
  if (outcome === 'forfeit') return t.forfeit;
  if (outcome === 'loss') return t.loss;
  return winType === '2ot' ? t.ot2 : winType === 'ot' ? t.ot : t.regulation;
}

// ---- Weeks (Mon–Sun, league time) --------------------------------------------

export const LEAGUE_TZ = 'America/New_York';

/** Calendar date (YYYY-MM-DD) of `d` in the league timezone. */
export function leagueDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Monday (YYYY-MM-DD) of the Mon–Sun week containing `d`, in league time. */
export function weekStart(d: Date): string {
  const ymd = leagueDate(d);
  const [y, m, day] = ymd.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, day, 12));
  const dow = noonUtc.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  noonUtc.setUTCDate(noonUtc.getUTCDate() - back);
  return noonUtc.toISOString().slice(0, 10);
}

export function weekEnd(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + 6);
  return t.toISOString().slice(0, 10);
}

// ---- Standings -----------------------------------------------------------------

/** One recorded result, as stored in league_matches. */
export interface ScoredMatch {
  id: string;
  match_type: string;               // Season | Playoffs | Finals — only Season counts
  match_kind: MatchKind;
  win_type: WinType | null;
  no_contest: boolean;
  verified: boolean;
  game_length_minutes: number | null;
  team_a_squad_id: string | null;
  team_b_squad_id: string | null;
  team_a_result: string | null;     // Win | Loss | No Show
  team_b_result: string | null;
  team_a_kills: number;
  team_b_kills: number;
  match_date: string;
}

export interface StandingCalc {
  squad_id: string;
  matches_played: number;
  wins: number;
  losses: number;
  no_shows: number;
  overtime_wins: number;
  overtime_losses: number;
  points: number;
  kills_for: number;
  deaths_against: number;
  rs_wins: number;
  rs_losses: number;
  fs_wins: number;
  fs_losses: number;
  forfeits: number;
  avg_rs_win_minutes: number | null;
  computed_rank: number;
  /** derived, not stored */
  regulation_wins: number;
  win_percentage: number;
  kd: number;
}

const outcomeOf = (result: string | null): Outcome | null => {
  if (!result) return null;
  if (/no.?show|forfeit/i.test(result)) return 'forfeit';
  return /win/i.test(result) ? 'win' : 'loss';
};

/**
 * Rebuild every squad's standing from the season's results under `rules`.
 * Returns rows sorted by rank. Squads in `squadIds` with no matches get a zero row.
 */
export function computeStandings(matches: ScoredMatch[], rules: ScoringRules, squadIds: string[] = []): StandingCalc[] {
  const rows = new Map<string, StandingCalc & { _rsWinMinutes: number[] }>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = {
        squad_id: id, matches_played: 0, wins: 0, losses: 0, no_shows: 0, overtime_wins: 0, overtime_losses: 0, points: 0,
        kills_for: 0, deaths_against: 0, rs_wins: 0, rs_losses: 0, fs_wins: 0, fs_losses: 0, forfeits: 0,
        avg_rs_win_minutes: null, computed_rank: 0, regulation_wins: 0, win_percentage: 0, kd: 0, _rsWinMinutes: [],
      };
      rows.set(id, r);
    }
    return r;
  };
  squadIds.forEach(row);

  // RS head-to-head wins: winner → loser → count
  const h2h = new Map<string, Map<string, number>>();
  const addH2h = (winner: string, loser: string) => {
    if (!h2h.has(winner)) h2h.set(winner, new Map());
    const m = h2h.get(winner)!;
    m.set(loser, (m.get(loser) || 0) + 1);
  };

  for (const m of matches) {
    if ((m.match_type || 'Season') !== 'Season') continue;
    if (!m.team_a_squad_id || !m.team_b_squad_id) continue;
    const kind: MatchKind = m.match_kind === 'fs' ? 'fs' : 'rs';
    if (kind === 'fs' && !rules.fs.enabled) continue;
    if (kind === 'fs' && rules.fs.needs_verification && !m.verified) continue;
    if (m.no_contest) continue;

    const oa = outcomeOf(m.team_a_result);
    const ob = outcomeOf(m.team_b_result);
    if (!oa || !ob) continue;
    // A forfeited FS is a no-contest under points rules even if the flag wasn't set.
    if (kind === 'fs' && rules.fs.forfeit_no_contest && (oa === 'forfeit' || ob === 'forfeit')) continue;

    const winType: WinType | null = m.win_type || winTypeFromMinutes(rules, m.game_length_minutes);
    const isOt = winType === 'ot' || winType === '2ot';

    const apply = (id: string, outcome: Outcome, killsFor: number, killsAgainst: number, opponent: string) => {
      const r = row(id);
      r.matches_played += 1;
      r.kills_for += killsFor || 0;
      r.deaths_against += killsAgainst || 0;
      r.points += pointsFor(rules, kind, outcome, winType);
      if (outcome === 'win') {
        r.wins += 1;
        if (isOt) r.overtime_wins += 1;
        if (kind === 'rs') {
          r.rs_wins += 1;
          if (m.game_length_minutes != null) r._rsWinMinutes.push(m.game_length_minutes);
          addH2h(id, opponent);
        } else r.fs_wins += 1;
      } else if (outcome === 'loss') {
        r.losses += 1;
        if (isOt) r.overtime_losses += 1;
        if (kind === 'rs') r.rs_losses += 1; else r.fs_losses += 1;
      } else {
        r.no_shows += 1;
        r.forfeits += 1;
        if (kind === 'rs') r.rs_losses += 1; else r.fs_losses += 1;
      }
    };
    apply(m.team_a_squad_id, oa, m.team_a_kills, m.team_b_kills, m.team_b_squad_id);
    apply(m.team_b_squad_id, ob, m.team_b_kills, m.team_a_kills, m.team_a_squad_id);
  }

  const list = Array.from(rows.values());
  for (const r of list) {
    r.regulation_wins = r.wins - r.overtime_wins;
    r.win_percentage = r.matches_played ? Math.round((r.wins / r.matches_played) * 10000) / 100 : 0;
    r.kd = r.kills_for - r.deaths_against;
    r.avg_rs_win_minutes = r._rsWinMinutes.length ? Math.round((r._rsWinMinutes.reduce((a, b) => a + b, 0) / r._rsWinMinutes.length) * 100) / 100 : null;
  }

  // Rank: points first, then the rules' tiebreakers. Head-to-head is evaluated
  // within the group of squads tied on points (RS wins among that group).
  const cmpBy = (tb: Tiebreaker, group: Set<string>) => (a: StandingCalc, b: StandingCalc): number => {
    switch (tb) {
      case 'rs_h2h': {
        const wins = (x: StandingCalc) => Array.from(h2h.get(x.squad_id)?.entries() || []).reduce((n, [opp, c]) => (group.has(opp) ? n + c : n), 0);
        return wins(b) - wins(a);
      }
      case 'rs_wins': return b.rs_wins - a.rs_wins;
      case 'reg_wins': return b.regulation_wins - a.regulation_wins;
      case 'fewest_forfeits': return a.forfeits - b.forfeits;
      case 'avg_rs_win_time': {
        const av = a.avg_rs_win_minutes, bv = b.avg_rs_win_minutes;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av - bv;
      }
      case 'win_pct': return b.win_percentage - a.win_percentage;
      case 'ot_wins': return b.overtime_wins - a.overtime_wins;
      case 'kd': return b.kd - a.kd;
      case 'wins': return b.wins - a.wins;
    }
  };

  list.sort((a, b) => b.points - a.points);
  const ranked: StandingCalc[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    while (j < list.length && list[j].points === list[i].points) j++;
    const group = list.slice(i, j);
    const ids = new Set(group.map((g) => g.squad_id));
    group.sort((a, b) => {
      for (const tb of rules.tiebreakers) {
        const c = cmpBy(tb, ids)(a, b);
        if (c !== 0) return c;
      }
      return a.squad_id.localeCompare(b.squad_id);
    });
    ranked.push(...group);
    i = j;
  }
  ranked.forEach((r, idx) => { r.computed_rank = idx + 1; });
  return ranked.map((r) => { const { _rsWinMinutes, ...rest } = r as StandingCalc & { _rsWinMinutes: number[] }; void _rsWinMinutes; return rest; });
}

/** Plain-language lines for the standings footnote. */
export function describeRules(rules: ScoringRules): string[] {
  if (rules.preset === 'classic') {
    return [
      `${rules.points.rs.regulation} points for a win (regulation or overtime)`,
      `${rules.points.rs.loss} point for a loss`,
      `${rules.points.rs.forfeit} points for a no-show`,
      `Tiebreakers: points, ${rules.tiebreakers.map((t) => TIEBREAKER_LABEL[t]).join(', ')}`,
    ];
  }
  const { rs, fs } = rules.points;
  const lines = [
    `RS (official schedule): win under ${rules.ot_minutes} min ${rs.regulation} · OT win ${rs.ot} · 2OT win ${rs.ot2} · loss ${rs.loss} · forfeit ${rs.forfeit}`,
  ];
  if (rules.fs.enabled) {
    lines.push(`FS (free scheduled): win under ${rules.ot_minutes} min ${fs.regulation} · OT win ${fs.ot} · 2OT win ${fs.ot2} · loss ${fs.loss}${rules.fs.forfeit_no_contest ? ' · forfeit = no contest' : ` · forfeit ${fs.forfeit}`}`);
    lines.push(`FS caps: ${rules.fs.per_week} per squad per week, ${rules.fs.per_opponent_week} vs the same squad per week, ${rules.fs.per_opponent_season} vs the same squad per season${rules.fs.needs_verification ? '; needs a ref or a recording' : ''}. No FS in the playoffs.`);
  }
  lines.push(`Tiebreakers: ${rules.tiebreakers.map((t) => TIEBREAKER_LABEL[t]).join(' → ')}. RS results always outrank FS.`);
  lines.push(`Top ${rules.playoff_spots} in points make the playoffs, seeded by the standings.`);
  return lines;
}
