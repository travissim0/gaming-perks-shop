// Zones whose server build is PINNED: the admin console's Rebuild button (and
// the daemon's rebuild-zones.sh behind it) stops the zone, installs the LATEST
// GitHub server release over the zone folder and restarts it. For a zone that
// only runs on a build somebody tested by hand, that is a way to break it with
// one click, so Rebuild is refused for these tags - in the UI (the button is
// disabled) and in queueZoneCommand (the one place every command passes through).
//
// Update such a zone by hand over SSH instead, then add or remove its tag here.
//
// This file is imported by client components, so keep it free of server-only imports.
export const REBUILD_PINNED_TAGS: ReadonlySet<string> = new Set([
  // The Arena (bots): purist Arena + fighter bots. Runs the 08-23 engine (ZoneServer.dll d59680df)
  // it was stage-tested against; the latest release (09-26) has not been tried with it.
  'arenabots',
]);

export const REBUILD_PINNED_REASON =
  'Rebuild is disabled for this zone: its server build is pinned (the latest GitHub release has not been tested with it). Update it by hand.';

export function isRebuildPinned(tag: string): boolean {
  return REBUILD_PINNED_TAGS.has(tag);
}
