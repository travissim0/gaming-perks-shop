import { SeedDraw, bracketSizeSchema, requireCondition } from './contracts';
import { createBracket, resolveBracket } from './bracket';

export const DRAW_ALGORITHM = 'sha256-fisher-yates-v1' as const;

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string): Promise<string> {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}

export function randomDrawSeed(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function commitmentInput(entrants: SeedDraw['entrants'], randomSeed: string): string {
  return JSON.stringify({ algorithm: DRAW_ALGORITHM, entrants, randomSeed });
}

// Rejection sampling avoids the modulo bias of randomValue % remainingPlayers.
// Hash-counter output makes the published draw independently reproducible.
export async function seededOrder(entryIds: string[], randomSeed: string): Promise<string[]> {
  requireCondition(/^[a-f0-9]{64}$/.test(randomSeed), 'Invalid draw randomness.');
  requireCondition(new Set(entryIds).size === entryIds.length, 'Duplicate player in the draw.');
  const order = [...entryIds];
  let counter = 0;
  for (let index = order.length - 1; index > 0; index--) {
    const range = index + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    let value: number;
    do {
      const hash = await sha256(`${DRAW_ALGORITHM}:${randomSeed}:${counter++}`);
      value = Number.parseInt(hash.slice(0, 8), 16);
    } while (value >= limit);
    const choice = value % range;
    [order[index], order[choice]] = [order[choice], order[index]];
  }
  return order;
}

export async function createDraw(entrants: SeedDraw['entrants'], now: string): Promise<SeedDraw> {
  requireCondition(
    entrants.length >= 4 && entrants.length <= 32,
    'Check in 4 to 32 players before drawing seeds.',
  );
  const sorted = [...entrants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const randomSeed = randomDrawSeed();
  return {
    id: crypto.randomUUID(),
    algorithm: DRAW_ALGORITHM,
    entrants: sorted,
    randomSeed,
    commitment: await sha256(commitmentInput(sorted, randomSeed)),
    order: await seededOrder(
      sorted.map((entry) => entry.id),
      randomSeed,
    ),
    committedAt: now,
    revealedAt: null,
    voidReason: null,
  };
}

export async function verifyDraw(
  draw: Pick<SeedDraw, 'algorithm' | 'entrants' | 'randomSeed' | 'commitment' | 'order'>,
): Promise<boolean> {
  if (draw.algorithm !== DRAW_ALGORITHM || !/^[a-f0-9]{64}$/.test(draw.randomSeed)) return false;
  if (new Set(draw.entrants.map((entry) => entry.id)).size !== draw.entrants.length) return false;
  const commitment = await sha256(commitmentInput(draw.entrants, draw.randomSeed));
  const order = await seededOrder(
    draw.entrants.map((entry) => entry.id),
    draw.randomSeed,
  );
  return commitment === draw.commitment && JSON.stringify(order) === JSON.stringify(draw.order);
}

export function drawMatchesBracket(
  order: string[],
  seedOrder: string[],
  fixtures: { id: string; slots: unknown; sources: unknown }[],
): boolean {
  if (JSON.stringify(order) !== JSON.stringify(seedOrder)) return false;
  const size = bracketSizeSchema.safeParse((fixtures.length + 1) / 2);
  if (!size.success || order.length > size.data) return false;
  const template = createBracket(size.data);
  if (
    fixtures.length !== template.length ||
    !template.every(
      (match) =>
        JSON.stringify(match.sources) ===
        JSON.stringify(fixtures.find((item) => item.id === match.id)?.sources),
    )
  )
    return false;
  const expected = resolveBracket(template, order).filter(
    (match) => match.bracket === 'upper' && match.round === 1,
  );
  return expected.every(
    (match) =>
      JSON.stringify(match.slots) ===
      JSON.stringify(fixtures.find((item) => item.id === match.id)?.slots),
  );
}
