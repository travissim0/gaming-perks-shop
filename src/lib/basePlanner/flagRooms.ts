/**
 * The "Flag room" view of each Twin Peaks base, in world px (the same coordinates as the level:
 * tile * 16). The planner frames exactly this rectangle, so cropping a base is just editing a row.
 * Bases themselves are the studio's Alt+1..9 scene regions; the whole-base view is still one click away.
 */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const FLAG_ROOMS: Record<string, Rect> = {
  A7: { x0: 48, y0: 7152, x1: 672, y1: 7744 },     // top-left room, flag beside the pods
  D7: { x0: 4048, y0: 7600, x1: 4816, y1: 8144 },  // bottom-left room, flag under the Jupiter mural
  A5: { x0: 528, y0: 5760, x1: 1248, y1: 6224 },   // bottom-right room, flag by the east consoles
  F6: { x0: 6768, y0: 7008, x1: 7376, y1: 7536 },  // top-middle room (where the CTF script drops the flag)
  F5: { x0: 6496, y0: 5600, x1: 6960, y1: 6112 },  // east room under the consoles
  B8: { x0: 2048, y0: 8912, x1: 2624, y1: 9456 },  // top-left room
};
