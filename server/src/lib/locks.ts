const chains = new Map<string, Promise<unknown>>();

/**
 * Serializes async work per key (e.g. per user) within this single process.
 * Two concurrent POST /articles from the same user would otherwise both pass
 * the "no active session" check and both spend an LLM generation, with the
 * loser then crashing on the sessions unique index.
 */
export async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, tail);
  try {
    return await run;
  } finally {
    // Drop the entry once this chain is the last one, so the map doesn't
    // keep one resolved promise per user forever.
    if (chains.get(key) === tail) chains.delete(key);
  }
}
