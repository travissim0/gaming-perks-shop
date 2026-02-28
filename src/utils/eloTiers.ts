export interface EloTier {
  name: string;
  color: string;       // hex color for inline styles
  tailwind: string;    // Tailwind text color class
  min: number;
  max: number;
}

export const ELO_TIERS: EloTier[] = [
  { name: 'Unranked', color: '#6B7280', tailwind: 'text-gray-500', min: 0, max: 999 },
  { name: 'Bronze', color: '#CD7F32', tailwind: 'text-orange-600', min: 1000, max: 1199 },
  { name: 'Silver', color: '#C0C0C0', tailwind: 'text-gray-400', min: 1200, max: 1399 },
  { name: 'Gold', color: '#FFD700', tailwind: 'text-yellow-600', min: 1400, max: 1599 },
  { name: 'Platinum', color: '#E5E4E2', tailwind: 'text-gray-300', min: 1600, max: 1799 },
  { name: 'Diamond', color: '#B9F2FF', tailwind: 'text-cyan-400', min: 1800, max: 1999 },
  { name: 'Master', color: '#FF6B6B', tailwind: 'text-red-400', min: 2000, max: 2199 },
  { name: 'Grandmaster', color: '#9B59B6', tailwind: 'text-purple-400', min: 2200, max: 2399 },
  { name: 'Legend', color: '#F39C12', tailwind: 'text-yellow-400', min: 2400, max: 2800 },
];

/**
 * Get ELO tier based on rating
 */
export function getEloTier(elo: number): EloTier {
  return ELO_TIERS.find(tier => elo >= tier.min && elo <= tier.max) || ELO_TIERS[0];
}
