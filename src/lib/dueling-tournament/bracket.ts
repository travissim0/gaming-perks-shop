import {
  BracketSize,
  Entry,
  Fixture,
  Result,
  Source,
  TournamentError,
  requireCondition,
} from './contracts';

export type Slot = { state: 'pending' } | { state: 'empty' } | { state: 'player'; entryId: string };
export type ResolvedFixture = Fixture & {
  slots: [Slot, Slot];
  state:
    'waiting' | 'ready' | 'held' | 'in_progress' | 'completed' | 'bye' | 'skipped' | 'conditional';
  winner: Slot;
  loser: Slot;
};

const pending: Slot = { state: 'pending' };
const empty: Slot = { state: 'empty' };
const seed = (n: number): Source => ({ kind: 'seed', seed: n });
const win = (matchId: string): Source => ({ kind: 'winner', matchId });
const lose = (matchId: string): Source => ({ kind: 'loser', matchId });

export function createBracket(size: BracketSize = 16): Fixture[] {
  const all: Fixture[] = [];
  const add = (id: string, bracket: Fixture['bracket'], round: number, a: Source, b: Source) => {
    all.push({
      id,
      bracket,
      round,
      sources: [a, b],
      startedAt: null,
      scheduledAt: null,
      held: false,
      holdReason: '',
      result: null,
    });
  };
  requireCondition([4, 8, 16, 32].includes(size), 'Unsupported bracket size.');
  let seeds = [1, 2];
  for (let width = 4; width <= size; width *= 2)
    seeds = seeds.flatMap((value) => [value, width + 1 - value]);
  const upper: string[][] = [];
  let upperId = 0;
  for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const id = `U${++upperId}`;
      const previous = upper[round - 2];
      add(
        id,
        'upper',
        round,
        previous ? win(previous[index * 2]) : seed(seeds[index * 2]),
        previous ? win(previous[index * 2 + 1]) : seed(seeds[index * 2 + 1]),
      );
      ids.push(id);
    }
    upper.push(ids);
  }
  let lower: string[] = [];
  let lowerId = 0;
  for (let round = 1; round <= 2 * Math.log2(size) - 2; round++) {
    const previous = lower;
    lower = [];
    const drops = upper[round / 2];
    const count = round === 1 ? size / 4 : round % 2 === 0 ? previous.length : previous.length / 2;
    for (let index = 0; index < count; index++) {
      const id = `L${++lowerId}`;
      const a =
        round === 1
          ? lose(upper[0][index * 2])
          : win(previous[round % 2 === 0 ? index : index * 2]);
      const b =
        round === 1
          ? lose(upper[0][index * 2 + 1])
          : round % 2 === 0
            ? lose(drops[drops.length === 1 ? 0 : index ^ 1])
            : win(previous[index * 2 + 1]);
      add(id, 'lower', round, a, b);
      lower.push(id);
    }
  }
  const upperFinal = upper.at(-1)![0];
  add('GF1', 'final', 1, win(upperFinal), win(lower[0]));
  add('GF2', 'reset', 2, win(upperFinal), win(lower[0]));
  return all;
}

export function bracketSizeFor(count: number): BracketSize {
  requireCondition(
    Number.isInteger(count) && count >= 0 && count <= 32,
    'A bracket supports up to 32 players.',
  );
  return count <= 4 ? 4 : count <= 8 ? 8 : count <= 16 ? 16 : 32;
}

export function validateSeeds(entryIds: string[], entries: Entry[]) {
  requireCondition(
    entryIds.length >= 4 && entryIds.length <= 32,
    'The checked-in field must contain 4 to 32 players.',
  );
  requireCondition(
    new Set(entryIds).size === entryIds.length,
    'Every seed must identify a different player.',
  );
  const eligible = entries.filter((entry) => entry.status === 'checked_in');
  requireCondition(
    eligible.length === entryIds.length && eligible.every((entry) => entryIds.includes(entry.id)),
    'Include every checked-in player exactly once.',
  );
}

export function validateResult(
  slots: [Slot, Slot],
  result: Pick<Result, 'kind' | 'winnerId' | 'scoreA' | 'scoreB' | 'reason'>,
) {
  requireCondition(
    slots.every((slot) => slot.state === 'player'),
    'Both opponents must be resolved before recording a result.',
  );
  const ids = slots.map((slot) => (slot.state === 'player' ? slot.entryId : ''));
  if (result.kind === 'double_forfeit') {
    requireCondition(
      result.winnerId === null &&
        result.scoreA === null &&
        result.scoreB === null &&
        result.reason.trim(),
      'A double forfeit requires a reason and no invented score or winner.',
    );
    return;
  }
  requireCondition(
    result.winnerId !== null && ids.includes(result.winnerId),
    'The winner must be an opponent in this match.',
  );
  if (result.kind === 'forfeit') {
    requireCondition(
      result.reason.trim() && result.scoreA === null && result.scoreB === null,
      'A forfeit requires a reason and no played score.',
    );
    return;
  }
  const scores = [result.scoreA, result.scoreB];
  const winnerSide = ids.indexOf(result.winnerId!);
  requireCondition(
    scores.every((score) => score !== null && Number.isInteger(score) && score >= 0 && score <= 3),
    'Enter whole-game BO5 scores.',
  );
  requireCondition(
    scores[winnerSide] === 3 && scores[1 - winnerSide]! < 3,
    'The winner must have three wins and the opponent zero, one, or two.',
  );
}

export function resolveBracket(fixtures: Fixture[], seedOrder: string[]): ResolvedFixture[] {
  const resolved = new Map<string, ResolvedFixture>();
  const visiting = new Set<string>();
  const definitions = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  requireCondition(definitions.size === fixtures.length, 'Duplicate fixture identifier.');
  const sourceSlot = (source: Source): Slot => {
    if (source.kind === 'seed')
      return seedOrder[source.seed - 1]
        ? { state: 'player', entryId: seedOrder[source.seed - 1] }
        : empty;
    const fixture = resolve(source.matchId);
    return source.kind === 'winner' ? fixture.winner : fixture.loser;
  };
  const resolve = (id: string): ResolvedFixture => {
    const existing = resolved.get(id);
    if (existing) return existing;
    requireCondition(!visiting.has(id), 'Bracket contains a dependency cycle.');
    const fixture = definitions.get(id);
    requireCondition(fixture, `Unknown fixture ${id}.`);
    visiting.add(id);
    let slots: [Slot, Slot] = [sourceSlot(fixture.sources[0]), sourceSlot(fixture.sources[1])];
    let state: ResolvedFixture['state'] = 'waiting';
    let winner = pending;
    let loser = pending;
    let conditional = false;
    if (fixture.id === 'GF2') {
      const first = resolve('GF1');
      const lowerWinner = sourceSlot(fixture.sources[1]);
      if (first.state !== 'completed' && first.state !== 'bye' && first.state !== 'skipped') {
        conditional = true;
        slots = [pending, pending];
        state = 'conditional';
      } else if (
        lowerWinner.state !== 'player' ||
        first.winner.state !== 'player' ||
        lowerWinner.entryId !== first.winner.entryId ||
        first.state === 'bye'
      ) {
        conditional = true;
        slots = [empty, empty];
        state = 'skipped';
        winner = empty;
        loser = empty;
      }
    }
    if (!conditional) {
      const players = slots.filter(
        (slot): slot is Extract<Slot, { state: 'player' }> => slot.state === 'player',
      );
      requireCondition(
        players.length < 2 || players[0].entryId !== players[1].entryId,
        'A player cannot face themselves.',
      );
      if (slots.some((slot) => slot.state === 'pending')) state = 'waiting';
      else if (players.length < 2) {
        requireCondition(
          !fixture.result && !fixture.startedAt,
          'An empty or bye fixture cannot contain a played result.',
        );
        state = 'bye';
        winner = players[0] ?? empty;
        loser = empty;
      } else if (fixture.result) {
        validateResult(slots, fixture.result);
        state = 'completed';
        winner = fixture.result.winnerId
          ? { state: 'player', entryId: fixture.result.winnerId }
          : empty;
        loser =
          fixture.result.kind === 'double_forfeit'
            ? empty
            : players.find((slot) => slot.entryId !== fixture.result!.winnerId)!;
      } else state = fixture.held ? 'held' : fixture.startedAt ? 'in_progress' : 'ready';
    }
    requireCondition(
      !fixture.result || state === 'completed',
      'A result depends on an unresolved or inactive fixture.',
    );
    const value: ResolvedFixture = { ...fixture, slots, state, winner, loser };
    visiting.delete(id);
    resolved.set(id, value);
    return value;
  };
  return fixtures.map((fixture) => resolve(fixture.id));
}

export function descendants(fixtures: Fixture[], matchId: string): string[] {
  const affected = new Set([matchId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const fixture of fixtures) {
      if (affected.has(fixture.id)) continue;
      if (
        fixture.sources.some((source) => source.kind !== 'seed' && affected.has(source.matchId)) ||
        (fixture.id === 'GF2' && affected.has('GF1'))
      ) {
        affected.add(fixture.id);
        grew = true;
      }
    }
  }
  affected.delete(matchId);
  return [...affected];
}

export function correctionImpact(fixtures: Fixture[], matchId: string) {
  const affected = descendants(fixtures, matchId);
  const blocked = fixtures.filter(
    (fixture) => affected.includes(fixture.id) && (fixture.startedAt || fixture.result),
  );
  return { affected, blocked: blocked.map((fixture) => fixture.id) };
}

export function champion(fixtures: ResolvedFixture[]): string | null {
  const first = fixtures.find((fixture) => fixture.id === 'GF1');
  const reset = fixtures.find((fixture) => fixture.id === 'GF2');
  if (reset?.state === 'completed' && reset.winner.state === 'player') return reset.winner.entryId;
  if (
    first &&
    ['completed', 'bye'].includes(first.state) &&
    reset?.state === 'skipped' &&
    first.winner.state === 'player'
  )
    return first.winner.entryId;
  return null;
}

export function queue(fixtures: ResolvedFixture[], restMinutes: number, now: string) {
  const lastPlayed = new Map<string, number>();
  for (const fixture of fixtures) {
    if (!fixture.result) continue;
    for (const slot of fixture.slots)
      if (slot.state === 'player')
        lastPlayed.set(
          slot.entryId,
          Math.max(lastPlayed.get(slot.entryId) ?? 0, Date.parse(fixture.result.recordedAt)),
        );
  }
  return fixtures
    .filter((fixture) => fixture.state === 'ready')
    .map((fixture) => {
      const restUntil = Math.max(
        0,
        ...fixture.slots.map((slot) =>
          slot.state === 'player' && lastPlayed.has(slot.entryId)
            ? lastPlayed.get(slot.entryId)! + restMinutes * 60000
            : 0,
        ),
      );
      const eligibleAt = Math.max(
        restUntil,
        fixture.scheduledAt ? Date.parse(fixture.scheduledAt) : 0,
      );
      return {
        fixture,
        eligibleAt: eligibleAt ? new Date(eligibleAt).toISOString() : null,
        eligible: eligibleAt <= Date.parse(now),
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      const order = (value: typeof a) =>
        value.fixture.scheduledAt
          ? Date.parse(value.fixture.scheduledAt)
          : value.eligibleAt
            ? Date.parse(value.eligibleAt)
            : 0;
      return (
        order(a) - order(b) ||
        a.fixture.round - b.fixture.round ||
        a.fixture.id.localeCompare(b.fixture.id, undefined, { numeric: true })
      );
    });
}

export function placements(
  fixtures: ResolvedFixture[],
  entries: Entry[],
  endedWithoutChampion = false,
) {
  const winner = champion(fixtures);
  const result = entries
    .filter((entry) => entry.seed !== null)
    .map((entry) => {
      const losses = fixtures.filter(
        (fixture) =>
          fixture.result &&
          fixture.slots.some((slot) => slot.state === 'player' && slot.entryId === entry.id) &&
          fixture.result.winnerId !== entry.id,
      );
      const elimination = losses.length >= 2 ? losses[losses.length - 1] : null;
      return {
        entryId: entry.id,
        alias: entry.alias,
        seed: entry.seed,
        losses: losses.length,
        place:
          entry.id === winner
            ? 1
            : winner && elimination && ['final', 'reset'].includes(elimination.bracket)
              ? 2
              : null,
        eliminatedRound: elimination?.round ?? null,
        bracket: elimination?.bracket ?? null,
      };
    });
  if (winner || endedWithoutChampion) {
    const eliminated = result
      .filter(
        (row) => row.place === null && row.eliminatedRound !== null && row.bracket === 'lower',
      )
      .sort((a, b) => b.eliminatedRound! - a.eliminatedRound!);
    let rank = 3;
    for (let i = 0; i < eliminated.length;) {
      const round = eliminated[i].eliminatedRound;
      const group = eliminated.filter((row) => row.eliminatedRound === round);
      for (const row of group) row.place = rank;
      i += group.length;
      rank += group.length;
    }
  }
  return result.sort(
    (a, b) => (a.place ?? 999) - (b.place ?? 999) || (a.seed ?? 999) - (b.seed ?? 999),
  );
}

export function requireFixture(fixtures: Fixture[], id: string): Fixture {
  const fixture = fixtures.find((item) => item.id === id);
  if (!fixture) throw new TournamentError('not_found', 'Match not found.', 404);
  return fixture;
}
