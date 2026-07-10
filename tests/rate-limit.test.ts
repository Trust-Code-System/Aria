import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, RATE_LIMITS, _resetRateLimits } from "@/lib/security/rate-limit";
import { AppError } from "@/lib/errors";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimits());

  it("allows requests under the limit", () => {
    for (let i = 0; i < RATE_LIMITS.research.limit; i++) {
      expect(() => rateLimit("research", "user-1")).not.toThrow();
    }
  });

  it("throws a friendly 429 AppError once the limit is exceeded", () => {
    for (let i = 0; i < RATE_LIMITS.research.limit; i++) rateLimit("research", "user-1");
    try {
      rateLimit("research", "user-1");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(429);
      expect(appErr.userMessage).toMatch(/wait/i);
      // Never leak internals in the user message.
      expect(appErr.userMessage).not.toMatch(/bucket|window|store/i);
    }
  });

  it("tracks users independently", () => {
    for (let i = 0; i < RATE_LIMITS.research.limit; i++) rateLimit("research", "user-1");
    expect(() => rateLimit("research", "user-2")).not.toThrow();
  });

  it("tracks areas independently", () => {
    for (let i = 0; i < RATE_LIMITS.research.limit; i++) rateLimit("research", "user-1");
    expect(() => rateLimit("chat", "user-1")).not.toThrow();
  });

  it("rate-limits ingest separately from upload", () => {
    for (let i = 0; i < RATE_LIMITS.ingest.limit; i++) rateLimit("ingest", "user-1");
    expect(() => rateLimit("ingest", "user-1")).toThrow(AppError);
    expect(() => rateLimit("upload", "user-1")).not.toThrow();
  });
});
