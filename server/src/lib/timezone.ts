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
