import { describe, expect, it } from "vitest";

import { classifyReachability } from "@/lib/ai/reachability";

describe("classifyReachability", () => {
  it("maps a successful response to reachable", () => {
    expect(classifyReachability(200)).toBe("reachable");
    expect(classifyReachability(299)).toBe("reachable");
  });

  it("maps 429 / 402 to rate_limited", () => {
    expect(classifyReachability(429)).toBe("rate_limited");
    expect(classifyReachability(402)).toBe("rate_limited");
  });

  it("detects quota/credit exhaustion from the error code even on a 400", () => {
    // OpenAI reports this as 429 insufficient_quota; some providers use 400.
    expect(classifyReachability(400, "insufficient_quota")).toBe("rate_limited");
    expect(classifyReachability(400, "credit_balance_too_low")).toBe("rate_limited");
    expect(classifyReachability(200, "RESOURCE_EXHAUSTED")).toBe("rate_limited");
  });

  it("maps auth failures to auth_failed", () => {
    expect(classifyReachability(401)).toBe("auth_failed");
    expect(classifyReachability(403)).toBe("auth_failed");
  });

  it("treats other 4xx (reached, not auth/quota-blocked) as reachable", () => {
    expect(classifyReachability(400)).toBe("reachable");
    expect(classifyReachability(404)).toBe("reachable");
  });

  it("maps 5xx and network failures (status 0) to unreachable", () => {
    expect(classifyReachability(500)).toBe("unreachable");
    expect(classifyReachability(503)).toBe("unreachable");
    expect(classifyReachability(0)).toBe("unreachable");
  });
});
