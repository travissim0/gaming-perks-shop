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
 * sits out each week. More weeks than (teams − 1) repeats the rotation with
 * home/away flipped, so a double round-robin falls out naturally.
 */
export function roundRobin(teams: TeamRef[], weeks: number): { pairings: Pairing[]; byes: Map<number, TeamRef> } {
  const pairings: Pairing[] = [];
  const byes = new Map<number, TeamRef>();
  if (teams.length < 2 || weeks < 1) return { pairings, byes };

  const BYE: TeamRef = { id: '__bye__', name: 'Bye' };
  const ring = teams.length % 2 === 0 ? [...teams] : [...teams, BYE];
  const n = ring.length;
  const roundsPerCycle = n - 1;

  for (let w = 1; w <= weeks; w++) {
    const r = (w - 1) % roundsPerCycle;
    const flip = Math.floor((w - 1) / roundsPerCycle) % 2 === 1;
    // Rotate everyone except ring[0] by r places.
    const rest = ring.slice(1);
    const order = [ring[0], ...rest.slice(rest.length - r), ...rest.slice(0, rest.length - r)];
    for (let i = 0; i < n / 2; i++) {
      const x = order[i];
      const y = order[n - 1 - i];
      if (x.id === BYE.id) { byes.set(w, y); continue; }
      if (y.id === BYE.id) { byes.set(w, x); continue; }
      pairings.push(flip ? { week: w, a: y, b: x } : { week: w, a: x, b: y });
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
