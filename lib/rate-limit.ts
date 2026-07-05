const ipCache = new Map<string, { count: number; resetTime: number }>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [ip, entry] of ipCache) {
    if (entry.resetTime <= now) {
      ipCache.delete(ip);
    }
  }
}

/**
 * Simple in-memory fixed-window rate limiter.
 * Returns true if the IP has exceeded the limit within the window.
 *
 * NOTE: This only works for single-instance deployments. For multi-instance
 * serverless (e.g. Vercel with multiple regions), use @upstash/ratelimit
 * so the limit is shared across instances.
 */
export function isRateLimited(
  ip: string,
  limit: number = 10,
  windowMs: number = 60_000
): boolean {
  cleanupStaleEntries();

  const now = Date.now();
  const entry = ipCache.get(ip);

  // If entry exists and is within the window
  if (entry && entry.resetTime > now) {
    if (entry.count >= limit) {
      return true; // Rate limited
    }
    entry.count++;
    return false;
  }

  // Reset or create new entry
  ipCache.set(ip, {
    count: 1,
    resetTime: now + windowMs,
  });
  return false;
}
