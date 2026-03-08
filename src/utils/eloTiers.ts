export interface EloTier {
  name: string;
  color: string;       // hex color for inline styles
  tailwind: string;    // Tailwind text color class
  min: number;
  max: number;
}

export const ELO_TIERS: EloTier[] = [
  { name: 'Unranked', color: '#6B7280', tailwind: 'text-gray-500', min: 0, max: 849 },
  { name: 'Bronze', color: '#CD7F32', tailwind: 'text-orange-600', min: 850, max: 949 },
  { name: 'Silver', color: '#C0C0C0', tailwind: 'text-gray-400', min: 950, max: 1049 },
  { name: 'Gold', color: '#FFD700', tailwind: 'text-yellow-600', min: 1050, max: 1149 },
  { name: 'Platinum', color: '#E5E4E2', tailwind: 'text-gray-300', min: 1150, max: 1249 },
  { name: 'Diamond', color: '#B9F2FF', tailwind: 'text-cyan-400', min: 1250, max: 1349 },
  { name: 'Master', color: '#FF6B6B', tailwind: 'text-red-400', min: 1350, max: 1449 },
  { name: 'Grandmaster', color: '#9B59B6', tailwind: 'text-purple-400', min: 1450, max: 1599 },
  { name: 'Legend', color: '#F39C12', tailwind: 'text-yellow-400', min: 1600, max: 2500 },
];

/**
 * Get ELO tier based on rating
 */
export function getEloTier(elo: number): EloTier {
  return ELO_TIERS.find(tier => elo >= tier.min && elo <= tier.max) || ELO_TIERS[0];
}
