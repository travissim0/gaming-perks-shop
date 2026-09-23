import type { PublicFixture, TournamentView } from './view';

export const MATCH_ATTENDANCE_RULE =
  "Players must report to the referee within 2 minutes of their match being called. Failure to appear within that time results in a series forfeit, recorded by the referee. The limit begins with the referee's call, not a website notice or estimated start time.";

export const MATCH_START_RULE =
  'All players must use the DUELER class for every game. The referee places both players on the mat and confirms they are ready. Players must remain in their assigned corners and may not move or attack until the referee announces "GO."';

export const MATCH_CORNER_RULE =
  'The higher seed starts in the top-left corner and the lower seed starts in the bottom-right corner. A smaller seed number is a higher seed: seed #2 starts top left against seed #7. Original tournament seeds determine corners for every game, including replays, the lower bracket and both finals.';

type Corner = 'Top-left corner' | 'Bottom-right corner';

export function startingCorners(
  event: Pick<TournamentView, 'entries'>,
  fixture: Pick<PublicFixture, 'slots'>,
): [Corner | null, Corner | null] {
  const seeds = fixture.slots.map((slot) =>
    slot.state === 'player' ? event.entries.find((entry) => entry.id === slot.entryId)?.seed : null,
  );
  const [a, b] = seeds;
  if (a == null || b == null || a === b) return [null, null];
  return a < b
    ? ['Top-left corner', 'Bottom-right corner']
    : ['Bottom-right corner', 'Top-left corner'];
}
