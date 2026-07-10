/**
 * Lightweight per-user sliding-window rate limiter.
 *
 * In-memory by design: this is a personal, single-instance app. If Aria is ever
 * deployed across multiple serverless instances, swap the store for a shared
 * one (Redis/Postgres) behind the same `rateLimit` function — callers won't
 * change. Limits are deliberately generous: they exist to stop runaway loops
 * and accidental cost explosions, not to get in the user's way.
 */
import { AppError } from "@/lib/errors";

interface Bucket {
  /** Epoch-ms timestamps of recent hits, oldest first. */
  hits: number[];
}

const store = new Map<string, Bucket>();

// Periodically drop stale buckets so the map can't grow unbounded.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

export interface RateLimitRule {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

/** Sensible defaults per feature area. */
export const RATE_LIMITS = {
  chat: { limit: 30, windowMs: 60_000 }, // 30 msgs/min
  research: { limit: 10, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
  ingest: { limit: 15, windowMs: 60_000 },
  taskRun: { limit: 10, windowMs: 60_000 },
  email: { limit: 10, windowMs: 60_000 },
  jobs: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Throws a friendly 429 AppError when `key` (usually `${area}:${userId}`)
 * exceeds the rule. Otherwise records the hit and returns.
 */
export function rateLimit(area: keyof typeof RATE_LIMITS, userId: string): void {
  const rule = RATE_LIMITS[area];
  const key = `${area}:${userId}`;
  const now = Date.now();

  if (now - lastSweep > SWEEP_EVERY_MS) {
    lastSweep = now;
    const cutoff = now - Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowMs));
    Array.from(store.entries()).forEach(([k, b]) => {
      if (b.hits.length === 0 || b.hits[b.hits.length - 1] < cutoff) store.delete(k);
    });
  }

  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < rule.windowMs);

  if (bucket.hits.length >= rule.limit) {
    const retryInSec = Math.ceil((rule.windowMs - (now - bucket.hits[0])) / 1000);
    const areaMap = {
      chat: "chat",
      upload: "upload",
      ingest: "ingestion",
      research: "research",
      taskRun: "tasks",
      email: "tools",
      jobs: "tasks",
    } as const;
    throw new AppError({
      area: areaMap[area],
      category: "rate_limit",
      statusCode: 429,
      userMessage: `You're going a little fast — please wait ~${retryInSec}s and try again.`,
    });
  }

  bucket.hits.push(now);
  store.set(key, bucket);
}

/** Test hook: clear all buckets. */
export function _resetRateLimits() {
  store.clear();
}
