/**
 * Schedule generation: round-robin regular seasons and single-elimination
 * playoffs. Pure functions — the page turns the output into fixtures.
 */

export interface TeamRef {
  id: string;
  name: string;
  tag?: string | null;
}

export interface Pairing {
  week: number;
  a: TeamRef;
  b: TeamRef;
}

/**
 * Circle-method round-robin. `weeks` rounds; with an odd team count one team
 * sits out each week. `a` is the HOME team (picks the side). Home and away
 * are balanced within a cycle: each pairing's home alternates with the round
 * and the pair position, so nobody is home every week. More weeks than
 * (teams − 1) repeats the rotation with home/away flipped, so a double
 * round-robin gives every pair one match at each team's home.
 */
export function roundRobin(teams: TeamRef[], weeks: number): { pairings: Pairing[]; byes: Map<number, TeamRef> } {
  const pairings: Pairing[] = [];
  const byes = new Map<number, TeamRef>();
  if (teams.length < 2 || weeks < 1) return { pairings, byes };

  const BYE: TeamRef = { id: '__bye__', name: 'Bye' };
  const ring = teams.length % 2 === 0 ? [...teams] : [...teams, BYE];
  const n = ring.length;
  const roundsPerCycle = n - 1;

  // Home minus away so far, and where each team played last, for balancing.
  const balance = new Map<string, number>();
  const last = new Map<string, 'home' | 'away'>();
  // First-cycle home assignment per unordered pair, so the second cycle can flip it exactly.
  const firstHome = new Map<string, string>();

  for (let w = 1; w <= weeks; w++) {
    const r = (w - 1) % roundsPerCycle;
    const cycle = Math.floor((w - 1) / roundsPerCycle);
    // Rotate everyone except ring[0] by r places.
    const rest = ring.slice(1);
    const order = [ring[0], ...rest.slice(rest.length - r), ...rest.slice(0, rest.length - r)];
    for (let i = 0; i < n / 2; i++) {
      const x = order[i];
      const y = order[n - 1 - i];
      if (x.id === BYE.id) { byes.set(w, y); continue; }
      if (y.id === BYE.id) { byes.set(w, x); continue; }

      const key = [x.id, y.id].sort().join('|');
      let home: TeamRef;
      if (cycle % 2 === 1 && firstHome.has(key)) {
        // Odd cycles mirror the first: the other team hosts.
        home = firstHome.get(key) === x.id ? y : x;
      } else {
        // Greedy balance: the team with fewer home games hosts; on a tie, the
        // one that was away last week. Keeps every team within one of even.
        const bx = balance.get(x.id) || 0;
        const by = balance.get(y.id) || 0;
        if (bx !== by) home = bx < by ? x : y;
        else if (last.get(x.id) !== last.get(y.id)) home = last.get(x.id) === 'away' ? x : y;
        else home = i % 2 === 0 ? x : y;
        if (cycle % 2 === 0) firstHome.set(key, home.id);
      }
      const away = home === x ? y : x;
      balance.set(home.id, (balance.get(home.id) || 0) + 1);
      balance.set(away.id, (balance.get(away.id) || 0) - 1);
      last.set(home.id, 'home');
      last.set(away.id, 'away');
      pairings.push({ week: w, a: home, b: away });
    }
  }
  return { pairings, byes };
}

/** Standard bracket seeding for a power-of-two field: 1v8, 4v5, 2v7, 3v6 … */
export function seedBracket(seeded: TeamRef[]): [TeamRef, TeamRef][] {
  const n = seeded.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('Playoff field must be 2, 4, 8 or 16 teams');
  let order = [1];
  while (order.length < n) {
    const next: number[] = [];
    const size = order.length * 2 + 1;
    for (const s of order) next.push(s, size - s);
    order = next;
  }
  const pairs: [TeamRef, TeamRef][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([seeded[order[i] - 1], seeded[order[i + 1] - 1]]);
  return pairs;
}

/** "Quarter-finals" / "Semi-finals" / "Final" from how many teams are left in a round. */
export function playoffRoundLabel(teamsInRound: number): string {
  if (teamsInRound <= 2) return 'Final';
  if (teamsInRound <= 4) return 'Semi-finals';
  if (teamsInRound <= 8) return 'Quarter-finals';
  return `Round of ${teamsInRound}`;
}

/** Add whole days to an ISO datetime, keeping the local wall-clock time. */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Combine a "YYYY-MM-DD" date and "HH:MM" time in the viewer's zone into ISO. */
export function localDateTimeToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString();
}
