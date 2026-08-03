import { logger } from "./logger.js";

const INTERVAL_MS = 5 * 60 * 1000;

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/**
 * Periodic memory breakdown. RSS climbs ~30 MB/h until the 512MB VM is
 * OOM-killed, and the split tells the causes apart: growing heapUsed means a
 * JS leak, growing external/arrayBuffers means retained HTTP buffers, and rss
 * alone means native allocations or allocator fragmentation.
 */
export function startMemoryLogging(): void {
  const report = (): void => {
    const m = process.memoryUsage();
    logger.info(
      {
        rss: mb(m.rss),
        heapUsed: mb(m.heapUsed),
        heapTotal: mb(m.heapTotal),
        external: mb(m.external),
        arrayBuffers: mb(m.arrayBuffers),
        uptimeMin: Math.round(process.uptime() / 60),
      },
      "Memory usage",
    );
  };

  report();
  // unref: diagnostics must never be the reason the process stays alive.
  setInterval(report, INTERVAL_MS).unref();
}
