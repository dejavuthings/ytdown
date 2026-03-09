// Simple in-memory rate limiter (IP-based, per minute)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_INFO_REQUESTS = 20;     // /api/info
const MAX_DOWNLOAD_REQUESTS = 5;  // /api/download

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(ip: string, type: "info" | "download"): { allowed: boolean; remaining: number } {
  const key = `${type}:${ip}`;
  const limit = type === "info" ? MAX_INFO_REQUESTS : MAX_DOWNLOAD_REQUESTS;
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}
