// Live population (/api/server-status) is keyed by the in-game zone TITLE, but
// every zone-control surface (admin console, /test-zone) keys rows by the
// zone-daemon TAG (= the screen name, see scripts/zone-daemon/*.conf).
//
// Titles track a zone's <zoneName>/active map, so update these when a zone's
// map or name changes. Keep this list as the single source of truth - it is
// shared by /admin/zones and /api/user-zone-control.
export const ZONE_TITLE_TO_TAG: Readonly<Record<string, string>> = {
  'Sports - Soccer Brawl': 'sb',
  "KOTH - Chambert's Tournament": 'ct',
  'SKX - Triple Threat': 'tt',
  'SK - Minimaps': 'minimaps',
  'USL - KS10': 'usl',
  'USL - Megamaps': 'usl2',
  'Eol - Pioneer Station (Bots)': 'eol',
  'Cosmic Rift - Rogue Trader': 'cr-rt',
  'CTF - Mini': 'ctfmini',
};

/** Zone tag for a live population title, or undefined if unmapped. */
export function tagForZoneTitle(title: string): string | undefined {
  return ZONE_TITLE_TO_TAG[title];
}

/** { tag: playerCount } from an /api/server-status zones array. */
export function playerCountsByTag(
  zones: Array<{ title?: string; playerCount?: number }> | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const zone of zones || []) {
    const tag = zone.title ? tagForZoneTitle(zone.title) : undefined;
    if (tag) counts[tag] = zone.playerCount || 0;
  }
  return counts;
}
