// Admin forms always use the event's Eastern timezone, regardless of the browser.
export function easternInput(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find((value) => value.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function easternToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Enter a complete Eastern date and time.');
  const local = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(local)) throw new Error('Enter a valid date and time.');
  const matches = [4, 5]
    .map((hours) => new Date(local + hours * 3600000).toISOString())
    .filter((instant) => easternInput(instant) === value);
  if (matches.length !== 1)
    throw new Error(
      'This time is skipped or repeated by daylight saving time. Choose an unambiguous Eastern time.',
    );
  return matches[0];
}

// Sequential BO5 series, conditional reset played, plus a 30-minute event buffer.
export function workloadMinutes(players: number, changeoverMinutes: number, gameSeconds = 30) {
  return Math.ceil((2 * players - 1) * ((5 * gameSeconds) / 60 + changeoverMinutes) + 30);
}

export function workloadLabel(players: number, changeoverMinutes: number, gameSeconds = 30) {
  const minutes = workloadMinutes(players, changeoverMinutes, gameSeconds);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
