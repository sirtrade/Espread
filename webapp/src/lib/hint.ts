const READING_HINT_KEY = "lector_reading_hint_seen";

/** Whether the one-time marking hint on the reading screen has been shown. */
export function readingHintSeen(): boolean {
  return localStorage.getItem(READING_HINT_KEY) === "1";
}

export function markReadingHintSeen(): void {
  localStorage.setItem(READING_HINT_KEY, "1");
}
