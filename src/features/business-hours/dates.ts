/** "Fri, 25 Dec 2026" for a calendar day ("2026-12-25"), the same everywhere. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Today's date ("2026-10-28") in the time zone. */
export function todayInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Every time zone the browser knows, with the current one kept even if it does not list it. */
export function timeZones(current: string): string[] {
  const known = Intl.supportedValuesOf('timeZone');
  return known.includes(current) ? known : [current, ...known];
}
