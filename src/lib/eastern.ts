/**
 * Eastern time beside the viewer's own.
 *
 * Match times are shown in the viewer's zone, and people in other zones kept reading them as
 * the league's (Eastern) time. So wherever a match time is printed, the Eastern time rides
 * along: "7:30 PM PDT · 10:30 PM ET". A viewer whose clock already shows Eastern time gets
 * nothing extra.
 */
export const EASTERN_TZ = 'America/New_York';

const clock = (d: Date, timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(d);

/** True when the viewer's clock shows the same time as Eastern at this moment. */
export function viewerIsEastern(d: Date = new Date()): boolean {
  try {
    return clock(d) === clock(d, EASTERN_TZ);
  } catch {
    return true; // no Intl zone support: show nothing extra rather than something wrong
  }
}

/** "10:30 PM ET", with the weekday when it falls on another calendar day than the viewer's ("1:30 AM Thu ET"). */
export function easternTime(d: Date): string {
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EASTERN_TZ });
  const dayHere = d.toLocaleDateString('en-US', { weekday: 'short' });
  const dayThere = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: EASTERN_TZ });
  return `${time}${dayHere !== dayThere ? ` ${dayThere}` : ''} ET`;
}

/** What to append after a local time: " · 10:30 PM ET", or '' for a viewer already on Eastern time. */
export function easternSuffix(d: Date | string, sep = ' · '): string {
  const at = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(at.getTime()) || viewerIsEastern(at)) return '';
  return `${sep}${easternTime(at)}`;
}

const toDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d);

/** The league-calendar day an instant falls on: "2026-10-14" in Eastern time. */
export function easternDay(d: Date | string): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(toDate(d));
}

/** The Eastern wall-clock time of an instant as "HH:MM" (24-hour), for a time input. */
export function easternClock(d: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(toDate(d));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('hour').padStart(2, '0')}:${get('minute').padStart(2, '0')}`;
}

/**
 * An Eastern wall-clock time ("20:30") on a league day ("2026-10-14") as an instant, or null when
 * either is malformed. Tries both Eastern offsets and keeps the one that reads back the same.
 */
export function easternToIso(day: string, hhmm: string): string | null {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  for (const offset of [4, 5]) { // EDT is UTC-4, EST is UTC-5
    const t = new Date(Date.UTC(y, m - 1, d, hh + offset, mm));
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    if (get('year') === y && get('month') === m && get('day') === d && get('hour') % 24 === hh && get('minute') === mm) return t.toISOString();
  }
  return null;
}
