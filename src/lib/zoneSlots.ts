// Zone tags that SHARE one game-DB zoneid.
//
// The game database allows a single login per zoneid: two zones holding the
// same one kick each other off in a loop (and the client directory keys its
// entries by zoneid too, so they would also fight over the listing). Tags
// grouped here therefore behave as ONE swappable seat - only one may run at a
// time, and starting either stops the running sibling.
//
// Sharing a seat is how a new zone gets hosted without asking the game-DB owner
// for a fresh zoneid + credentials. The trade-off: the zones in a seat also
// share that zoneid's player stats/inventory rows in the game DB.
//
// This file is imported by client components, so keep it free of server-only
// imports. Enforcement lives in the daemon (ZONE_SLOTS in the server confs and
// start_zone in scripts/zone-daemon/zone-daemon.sh) - it has to, because a zone
// can also be started by hand over SSH. This map is the UI's copy: keep the two
// in sync.
export const ZONE_SLOTS: Readonly<Record<string, string>> = {
  ctfmini: 'zid175',
  qca: 'zid175',
};

/** Other zone tags sharing this tag's seat (empty if it has a zoneid to itself). */
export function slotSiblings(tag: string): string[] {
  const slot = ZONE_SLOTS[tag];
  if (!slot) return [];
  return Object.keys(ZONE_SLOTS).filter((t) => t !== tag && ZONE_SLOTS[t] === slot);
}
