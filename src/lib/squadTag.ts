/**
 * Derive a squad tag from its name: initials for multi-word names
 * ("Big Raccoons Under Hats" → BRUH), first four letters for single words
 * ("Apex" → APEX). Same rule the match importer uses for auto-created squads.
 */
export function makeSquadTag(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  let tag = '';
  if (words.length >= 2) {
    tag = words.map((w) => w[0]).join('').toUpperCase().slice(0, 5);
  }
  if (tag.length < 2) {
    tag = words.join('').toUpperCase().slice(0, 4);
  }
  return tag || 'SQD';
}
