/** "25 Oct 2026, 17:30" in the given time zone (the workspace's), for lists of events. */
export function formatInZone(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(date));
}

/** How far the time zone is ahead of UTC at that moment, in milliseconds. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return asUtc - at;
}

/**
 * Midnight at the start of a calendar day ("2026-10-25") in the given time zone, as a Date. Used
 * so a picked date range means the same days the times are shown in.
 */
export function startOfDayInZone(day: string, timeZone: string): Date {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date);
  // Two passes settle days when the offset changes (daylight saving).
  const first = guess - zoneOffset(guess, timeZone);
  return new Date(guess - zoneOffset(first, timeZone));
}
