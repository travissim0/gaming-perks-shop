/**
 * Returns a human-readable relative time (e.g. "5 minutes ago").
 * Native implementation to avoid date-fns Turbopack resolution issues.
 */
export function formatRelativeTime(
  date: Date | string,
  options: { addSuffix?: boolean } = {}
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const suffix = options.addSuffix !== false ? (diffMs >= 0 ? ' from now' : ' ago') : '';
  const absSec = Math.abs(diffSec);
  const absMin = Math.abs(diffMin);
  const absHour = Math.abs(diffHour);
  const absDay = Math.abs(diffDay);

  if (absSec < 60) return `${absSec} second${absSec === 1 ? '' : 's'}${suffix}`;
  if (absMin < 60) return `${absMin} minute${absMin === 1 ? '' : 's'}${suffix}`;
  if (absHour < 24) return `${absHour} hour${absHour === 1 ? '' : 's'}${suffix}`;
  if (absDay < 30) return `${absDay} day${absDay === 1 ? '' : 's'}${suffix}`;
  return d.toLocaleDateString();
}
