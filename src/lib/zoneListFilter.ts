// Filtering + sorting rules for the /admin/zones list (kept out of the page so they can be exercised on their own).
//   - the search box matches the zone name or tag and applies to every zone
//   - the status filter (running / stopped / all) NEVER hides flagship zones (a stopped flagship zone needs
//     attention) or zones whose status is UNKNOWN
//   - `hidden` counts the zones that matched the search but were hidden by the status filter
// Client-safe: no server-only imports.
import { zoneGroup } from '@/lib/zoneGroups';

export type ZoneStatusFilterValue = 'all' | 'running' | 'stopped';
export type ZoneSortFieldValue = 'name' | 'status' | 'key';

export function filterAndSortZones<Z extends { name: string; key: string; status: 'RUNNING' | 'STOPPED' | 'UNKNOWN' }>(
  zones: Z[],
  o: { filter: ZoneStatusFilterValue; query: string; sortField: ZoneSortFieldValue; sortOrder: 'asc' | 'desc' },
): { list: Z[]; hidden: number } {
  const q = o.query.trim().toLowerCase();
  let hidden = 0;
  const filtered = zones.filter((zone) => {
    if (q && !(zone.name.toLowerCase().includes(q) || zone.key.toLowerCase().includes(q))) return false;
    const exempt = zoneGroup(zone.key) === 'flagship' || zone.status === 'UNKNOWN';
    const show =
      exempt || o.filter === 'all' || (o.filter === 'running' ? zone.status === 'RUNNING' : zone.status === 'STOPPED');
    if (!show) hidden++;
    return show;
  });

  const list = [...filtered].sort((a, b) => {
    let av: string, bv: string;
    switch (o.sortField) {
      case 'status':
        av = a.status;
        bv = b.status;
        break;
      case 'key':
        av = a.key.toLowerCase();
        bv = b.key.toLowerCase();
        break;
      case 'name':
      default:
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
    }
    return o.sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  return { list, hidden };
}
