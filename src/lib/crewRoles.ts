/**
 * Who may fill each crew slot on a match. One rule for the server (crew route) and both match
 * pages, keyed on profiles.ctf_role ('ctf_admin', 'ctf_head_referee', 'ctf_referee',
 * 'ctf_commentator', 'ctf_recorder', the 'ctf_analyst_*' combinations, …).
 *
 *   referee      any referee role (head referee included), CTF admins, site admins
 *   commentator  any commentator or referee role (head referee included), CTF admins, site admins
 *   recorder     anyone signed in
 *   player       anyone signed in (pickups and scrims; league fixtures have no player sign-up)
 */
export type CrewRole = 'player' | 'commentator' | 'recording' | 'referee';

export function canFillCrewRole(role: CrewRole, ctfRole: string | null | undefined, isAdmin = false): boolean {
  const r = (ctfRole || '').toLowerCase();
  if (isAdmin || r === 'ctf_admin') return true;
  if (role === 'referee') return r.includes('referee');
  if (role === 'commentator') return r.includes('commentator') || r.includes('referee');
  return true;
}
