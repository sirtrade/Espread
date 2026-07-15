/**
 * Checks that a string is a timezone identifier Intl actually accepts.
 * An unvalidated timezone stored on a user would make Intl.DateTimeFormat
 * throw inside the scheduler tick for every delivery run.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar day of a timestamp as a sortable "YYYY-MM-DD" key, in the given
 * IANA timezone. Two moments share a local day iff their keys are equal.
 * Falls back to UTC for an unrecognized zone so a bad stored value can't throw
 * here (validation on write already guards the common case).
 */
export function localDayKey(ms: number, timeZone: string): string {
  const zone = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
