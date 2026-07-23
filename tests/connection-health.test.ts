import { describe, expect, it, vi } from "vitest";

import {
  CONNECTION_FRESHNESS_MS,
  needsRevalidation,
  verifyConnectionHealth,
} from "@/lib/connectors/health";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** Minimal Supabase update-chain stub that records the persisted patch. */
function supabaseStub() {
  const calls: Record<string, unknown>[] = [];
  const chain = {
    update(patch: Record<string, unknown>) {
      calls.push(patch);
      return chain;
    },
    eq() {
      return chain;
    },
  };
  return { client: { from: () => chain } as never, calls };
}

describe("needsRevalidation", () => {
  it("revalidates when never validated or timestamp unparseable", () => {
    expect(needsRevalidation(null, NOW)).toBe(true);
    expect(needsRevalidation("nonsense", NOW)).toBe(true);
  });

  it("trusts a fresh validation and re-checks a stale one", () => {
    expect(needsRevalidation(ago(CONNECTION_FRESHNESS_MS - 1_000), NOW)).toBe(false);
    expect(needsRevalidation(ago(CONNECTION_FRESHNESS_MS + 1_000), NOW)).toBe(true);
  });
});

describe("verifyConnectionHealth", () => {
  it("skips the probe entirely when the cache is still fresh", async () => {
    const probe = vi.fn();
    const { client } = supabaseStub();
    const result = await verifyConnectionHealth({
      supabase: client,
      workspaceId: "ws",
      provider: "gmail",
      connectedAccountId: "acc_1",
      dbStatus: "connected",
      lastValidatedAt: ago(60_000),
      now: NOW,
      probe,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(result).toMatchObject({ healthy: true, revalidated: false });
  });

  it("blocks tools and persists the correction when a live probe reports expired", async () => {
    const probe = vi.fn().mockResolvedValue({ status: "expired" });
    const { client, calls } = supabaseStub();
    const result = await verifyConnectionHealth({
      supabase: client,
      workspaceId: "ws",
      provider: "gmail",
      connectedAccountId: "acc_1",
      dbStatus: "connected",
      lastValidatedAt: ago(CONNECTION_FRESHNESS_MS + 1_000),
      now: NOW,
      probe,
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ healthy: false, status: "expired", revalidated: true });
    expect(calls[0]).toMatchObject({ status: "expired" });
  });

  it("fails open (keeps a usable connection) when the probe throws", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("network"));
    const { client, calls } = supabaseStub();
    const result = await verifyConnectionHealth({
      supabase: client,
      workspaceId: "ws",
      provider: "gmail",
      connectedAccountId: "acc_1",
      dbStatus: "connected",
      lastValidatedAt: ago(CONNECTION_FRESHNESS_MS + 1_000),
      now: NOW,
      probe,
    });
    expect(result).toMatchObject({ healthy: true, revalidated: false });
    expect(calls).toHaveLength(0);
  });

  it("trusts stored status when there is no connected account to probe", async () => {
    const probe = vi.fn();
    const { client } = supabaseStub();
    const result = await verifyConnectionHealth({
      supabase: client,
      workspaceId: "ws",
      provider: "notion",
      connectedAccountId: null,
      dbStatus: "connected",
      lastValidatedAt: null,
      now: NOW,
      probe,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(result).toMatchObject({ healthy: true, revalidated: false });
  });
});
