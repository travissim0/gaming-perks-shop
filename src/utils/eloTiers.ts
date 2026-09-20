export interface EloTier {
  name: string;
  color: string;       // hex color for inline styles
  tailwind: string;    // Tailwind text color class
  min: number;
  max: number;
}

/*
 * Tier bands fitted to this rating's real spread, not chess's. Everyone starts at 1200 and the
 * shown rating is pulled toward 1200 until a name has 20 games, so the whole pool sits within a few
 * hundred points (2026-09-20: CTF ladder 918–1199, dueling 1086–1288). Master and Grandmaster were
 * dropped for that reason. The leaderboard's tier card shows how many players sit in each band, so
 * it's obvious when the spread has widened and these need moving.
 */
export const ELO_TIERS: EloTier[] = [
  { name: 'Unranked', color: '#6B7280', tailwind: 'text-gray-500', min: 0, max: 0 },
  { name: 'Bronze', color: '#CD7F32', tailwind: 'text-orange-600', min: 1, max: 1049 },
  { name: 'Silver', color: '#C0C0C0', tailwind: 'text-gray-400', min: 1050, max: 1099 },
  { name: 'Gold', color: '#FFD700', tailwind: 'text-yellow-600', min: 1100, max: 1149 },
  { name: 'Platinum', color: '#E5E4E2', tailwind: 'text-gray-300', min: 1150, max: 1199 },
  { name: 'Diamond', color: '#B9F2FF', tailwind: 'text-cyan-400', min: 1200, max: 1249 },
  { name: 'Legend', color: '#F39C12', tailwind: 'text-yellow-400', min: 1250, max: 9999 },
];

/** Tiers from the top down, without Unranked: what a legend card lists. */
export const RANKED_TIERS: EloTier[] = [...ELO_TIERS].reverse().filter((t) => t.name !== 'Unranked');

/** Band label for a legend: "1250+", "1200–1249", "< 1050". */
export function tierBandLabel(t: EloTier): string {
  if (t.max >= 9999) return `${t.min}+`;
  if (t.min <= 1) return `< ${t.max + 1}`;
  return `${t.min}–${t.max}`;
}

/**
 * Get ELO tier based on rating. Unranked is for "no rating" (0); placement (under 10 games) is
 * decided by the caller from game count, not from here.
 */
export function getEloTier(elo: number): EloTier {
  const r = Math.round(Number(elo) || 0);
  return ELO_TIERS.find((tier) => r >= tier.min && r <= tier.max) || ELO_TIERS[0];
}

/** How many of the given ratings fall in each ranked tier, top tier first. */
export function tierCounts(ratings: number[]): Array<EloTier & { count: number }> {
  const counts = new Map<string, number>();
  for (const r of ratings) {
    const t = getEloTier(r);
    counts.set(t.name, (counts.get(t.name) || 0) + 1);
  }
  return RANKED_TIERS.map((t) => ({ ...t, count: counts.get(t.name) || 0 }));
}
