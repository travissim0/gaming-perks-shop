// Zones whose server build is PINNED: the admin console's Rebuild button (and the daemon's rebuild-zones.sh behind
// it) stops the zone, installs the LATEST GitHub server release over the zone's folder and restarts it. For a zone
// that runs a custom build or one somebody tested by hand, that is a way to break it with one click, so Rebuild is
// refused for these tags - in the UI (the button is disabled, with the reason) and in queueZoneCommand (the one place
// every admin and per-user command passes through).
//
// Update such a zone by hand over SSH instead, then add or remove its tag here.
//
// A zone whose custom build is published as GitHub releases from a fork does NOT need a pin: give it a build repo
// in BUILD_REPOS below instead, and Rebuild installs that fork's latest release. The daemon side of that map is
// ZONE_REPOS in scripts/zone-daemon/zone-daemon.serverB.conf - keep the two in sync.
//
// This file is imported by client components, so keep it free of server-only imports.
const PIN_REASONS: Readonly<Record<string, string>> = {
  // The Arena (bots): purist Arena + fighter bots. Runs the 08-23 engine (ZoneServer.dll d59680df) it was
  // stage-tested against; the latest release (09-26) has not been tried with it.
  arenabots:
    "Pinned build: Rebuild is disabled for this zone. Rebuild installs the latest GitHub server release over the zone's folder, and The Arena (bots) is only known to work on the engine it runs now. Update it by hand if you need to.",
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

// Zones whose Rebuild installs the latest release of a FORK instead of the stock InfantryOnline repo.
// The daemon's rebuild-zones.sh reads the same tag -> repo map from zone-daemon.conf (ZONE_REPOS); this copy only
// feeds the UI text. rebuild-zones.sh refuses to install a fork release that is older than the ZoneServer.dll the
// zone already runs, so a hand-deployed newer build is never rolled back by a click.
const BUILD_REPOS: Readonly<Record<string, string>> = {
  // Bots - Eol Pioneer Station: ProBosnia + ModalInc's bot rework. Their CI publishes releases from the Mode branch.
  eol: 'ModalInc/Infantry-Online-Server',
};

// Fork zones whose gametype scripts Rebuild ALSO syncs from the repo (same commit as the release), replacing the
// zone's copy. Mirror of ZONE_REPO_SCRIPTS in zone-daemon.serverB.conf. Zone-relative path = repo-relative path.
const REPO_SCRIPTS: Readonly<Record<string, string>> = {
  eol: 'scripts/GameTypes/Eol',
};

/** The zone folder Rebuild replaces from the fork repo, if any (e.g. 'scripts/GameTypes/Eol'). */
export function repoScriptsDir(tag: string): string | null {
  return REPO_SCRIPTS[tag] || null;
}

export const STOCK_BUILD_REPO = 'InfantryOnline/Infantry-Online-Server';

/** owner/repo whose latest GitHub release Rebuild installs for this tag. */
export function rebuildRepo(tag: string): string {
  return BUILD_REPOS[tag] || STOCK_BUILD_REPO;
}

/** True when this zone rebuilds from a fork rather than the stock repo. */
export function hasCustomBuildRepo(tag: string): boolean {
  return tag in BUILD_REPOS;
}
