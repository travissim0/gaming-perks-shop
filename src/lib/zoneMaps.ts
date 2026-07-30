// Map-picker helpers shared by the admin console (/admin/zones) and the
// per-account console (/test-zone). Both render the same inventory: a
// zone_maps row reported by the zone-daemon (current cfg/lvl/lio + the cfgs,
// lvls and lios present in the zone's assets) plus the curated map_presets
// rows that give a map a display name and thumbnail.

export type MapPair = { key: string; label: string; lvl: string; lio: string };

export type MapPreset = {
  id?: string;
  display_name?: string;
  cfg_file?: string;
  lvl_file?: string;
  lio_file?: string;
  preview_image_url?: string | null;
};

/**
 * Build the set of lvl/lio pairings for a zone's map inventory:
 *  1. every cfg's (lvl, lio) is a curated pairing (labelled by the cfg name)
 *  2. plus lvl/lio files that share a base name (e.g. bloodcrpl.lvl/.lio)
 * Deduped by (lvl|lio). When no pairing covers a desired combo, the UI falls
 * back to selecting lvl and lio individually.
 */
export function buildMapPairs(row: any): MapPair[] {
  if (!row) return [];
  const seen = new Set<string>();
  const pairs: MapPair[] = [];
  const add = (label: string, lvl: string, lio: string) => {
    if (!lvl || !lio) return;
    const key = `${lvl}|${lio}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ key, label, lvl, lio });
  };
  for (const c of (row.cfgs || [])) add(String(c.cfg || '').replace(/\.cfg$/i, ''), c.lvl, c.lio);
  const lios = new Set<string>(row.lios || []);
  for (const lvl of (row.lvls || [])) {
    const base = String(lvl).replace(/\.lvl$/i, '');
    if (lios.has(`${base}.lio`)) add(base, lvl, `${base}.lio`);
  }
  return pairs.sort((a, b) => a.label.localeCompare(b.label));
}

/** Presets (name + thumbnail) whose lvl/lio actually exist for this zone. */
export function presetsForZone(row: any, presets: MapPreset[]): MapPreset[] {
  if (!row) return [];
  const lvls = new Set<string>(row.lvls || []);
  const lios = new Set<string>(row.lios || []);
  return (presets || []).filter(p => !!p.lvl_file && !!p.lio_file && lvls.has(p.lvl_file!) && lios.has(p.lio_file!));
}

/**
 * The shorthand name shown in the picker for a lvl/lio combo — this is what
 * gets mirrored into server.xml's <zoneName>. Prefer a curated preset name,
 * then a pairing label, finally the .lvl base name.
 */
export function mapNameFor(lvl: string, lio: string, presets: MapPreset[], pairs: MapPair[]): string {
  const preset = (presets || []).find(p => p.lvl_file === lvl && p.lio_file === lio);
  if (preset?.display_name) return preset.display_name;
  const pair = (pairs || []).find(p => p.lvl === lvl && p.lio === lio);
  if (pair?.label) return pair.label;
  return String(lvl || '').replace(/\.lvl$/i, '');
}
