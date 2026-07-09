/**
 * Retry helpers for transient provider failures (network blips, 429s, 5xx).
 *
 * IMPORTANT safety rule: only retry operations that are IDEMPOTENT or read-only
 * (embeddings, research queries, status GETs). Never wrap a side-effecting call
 * (send email, execute tool, payment) — a timeout does not prove the action
 * didn't happen, and a retry could perform it twice.
 */

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface RetryOptions {
  /** Additional attempts after the first (default 2 → up to 3 total). */
  retries?: number;
  /** Base backoff in ms; grows exponentially with jitter (default 400). */
  baseMs?: number;
}

/** Retry an async fn on thrown errors (network-level failures). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await sleep(backoff(baseMs, attempt));
    }
  }
  throw lastErr;
}

/**
 * fetch that retries on network errors and retryable HTTP statuses.
 * Only use for idempotent requests (see module note).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) return res;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
    }
    await sleep(backoff(baseMs, attempt));
  }
  // Unreachable, but satisfies the compiler.
  throw lastErr ?? new Error("fetchWithRetry exhausted retries");
}

function backoff(baseMs: number, attempt: number): number {
  return Math.round(baseMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
