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
 * The local calendar day ("YYYY-MM-DD") of a moment in the given IANA timezone.
 * Used for per-day comparisons — the SRS anti-farm daily cap — so "same day"
 * means the user's local day, not UTC. Falls back to UTC for an unrecognized
 * zone so a bad stored value can never throw inside the SRS update.
 */
export function localDayKey(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimezone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epochMs);
}
