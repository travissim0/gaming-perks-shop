import { Fixture, Source } from '../../src/lib/dueling-tournament/contracts';
const seed = (n: number): Source => ({ kind: 'seed', seed: n });
const win = (matchId: string): Source => ({ kind: 'winner', matchId });
const lose = (matchId: string): Source => ({ kind: 'loser', matchId });
// Frozen pre-generator fixture. Do not derive this from the generator under test.
export function legacyBracket(): Fixture[] {
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
  [
    [1, 16],
    [8, 9],
    [4, 13],
    [5, 12],
    [2, 15],
    [7, 10],
    [3, 14],
    [6, 11],
  ].forEach(([a, b], index) => add(`U${index + 1}`, 'upper', 1, seed(a), seed(b)));
  for (let n = 0; n < 4; n++)
    add(`U${9 + n}`, 'upper', 2, win(`U${n * 2 + 1}`), win(`U${n * 2 + 2}`));
  add('U13', 'upper', 3, win('U9'), win('U10'));
  add('U14', 'upper', 3, win('U11'), win('U12'));
  add('U15', 'upper', 4, win('U13'), win('U14'));
  for (let n = 0; n < 4; n++)
    add(`L${n + 1}`, 'lower', 1, lose(`U${n * 2 + 1}`), lose(`U${n * 2 + 2}`));
  ['U10', 'U9', 'U12', 'U11'].forEach((id, n) =>
    add(`L${n + 5}`, 'lower', 2, win(`L${n + 1}`), lose(id)),
  );
  add('L9', 'lower', 3, win('L5'), win('L6'));
  add('L10', 'lower', 3, win('L7'), win('L8'));
  add('L11', 'lower', 4, win('L9'), lose('U14'));
  add('L12', 'lower', 4, win('L10'), lose('U13'));
  add('L13', 'lower', 5, win('L11'), win('L12'));
  add('L14', 'lower', 6, win('L13'), lose('U15'));
  add('GF1', 'final', 1, win('U15'), win('L14'));
  add('GF2', 'reset', 2, win('U15'), win('L14'));
  return all;
}
