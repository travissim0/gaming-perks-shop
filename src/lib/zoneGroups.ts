// How /admin/zones groups its rows. Zone-daemon TAGs (the screen names in scripts/zone-daemon/*.conf).
//   flagship - the premier zones: shown first as the headline row, highlighted, and never tucked away
//              (a stopped flagship zone is shown in red because it needs attention)
//   bots     - other zones that run server-side bots
//   legacy   - everything else (the default for a tag not listed here)
// Zones that are stopped (and not flagship) go to a collapsed "Stopped" section at the bottom: stopped zones
// often sit dormant for weeks or months, so running zones always come first.
//
// This file is imported by client components, so keep it free of server-only imports.
export type ZoneGroup = 'flagship' | 'bots' | 'legacy';

export const FLAGSHIP_ORDER: readonly string[] = [
  'usl2', //     League - USL Matches2
  'ctf', //      CTF - Twin Peaks 2.0
  'eol', //      Bots - Eol Pioneer Station
  'minimaps', // Skirmish - Minimaps
];

const BOT_TAGS: readonly string[] = [
  'ctfx', //      CTF - CTFX Halloween (CTF:X with bots)
  'qca', //       CA - Quarantine (Bots)
  'arenabots', // The Arena (bots)
  'tt', //        Test Zone - Molo (Triple Threat; bots coming)
];

export function zoneGroup(tag: string): ZoneGroup {
  if (FLAGSHIP_ORDER.includes(tag)) return 'flagship';
  if (BOT_TAGS.includes(tag)) return 'bots';
  return 'legacy';
}

export const ZONE_GROUP_ORDER: readonly ZoneGroup[] = ['flagship', 'bots', 'legacy'];

export const ZONE_GROUP_LABEL: Readonly<Record<ZoneGroup, string>> = {
  flagship: 'Flagship',
  bots: 'Bot zones',
  legacy: 'Other zones',
};
