// Zones whose server build is PINNED: the admin console's Rebuild button (and the daemon's rebuild-zones.sh behind
// it) stops the zone, installs the LATEST GitHub server release over the zone's folder and restarts it. For a zone
// that runs a custom build or one somebody tested by hand, that is a way to break it with one click, so Rebuild is
// refused for these tags - in the UI (the button is disabled, with the reason) and in queueZoneCommand (the one place
// every admin and per-user command passes through).
//
// Update such a zone by hand over SSH instead, then add or remove its tag here.
//
// This file is imported by client components, so keep it free of server-only imports.
const PIN_REASONS: Readonly<Record<string, string>> = {
  // The Arena (bots): purist Arena + fighter bots. Runs the 08-23 engine (ZoneServer.dll d59680df) it was
  // stage-tested against; the latest release (09-26) has not been tried with it.
  arenabots:
    "Pinned build: Rebuild is disabled for this zone. Rebuild installs the latest GitHub server release over the zone's folder, and The Arena (bots) is only known to work on the engine it runs now. Update it by hand if you need to.",
  // Bots - Eol Pioneer Station: another admin's custom server build.
  eol:
    "Pinned build: this zone runs another admin's custom server build. Rebuild would overwrite it with the stock GitHub release, so it is disabled. Update it by hand, together with them.",
};

export const REBUILD_PINNED_TAGS: ReadonlySet<string> = new Set(Object.keys(PIN_REASONS));

/** Generic wording, used when a pinned tag has no specific reason above. */
export const REBUILD_PINNED_REASON =
  "Pinned build: Rebuild is disabled for this zone. Rebuild installs the latest GitHub server release over the zone's folder, and this zone is only known to work on the engine it runs now. Update it by hand if you need to.";

export function isRebuildPinned(tag: string): boolean {
  return REBUILD_PINNED_TAGS.has(tag);
}

/** The tooltip / error text explaining why Rebuild is disabled for this tag. */
export function rebuildPinReason(tag: string): string {
  return PIN_REASONS[tag] || REBUILD_PINNED_REASON;
}
