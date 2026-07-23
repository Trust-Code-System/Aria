import { describe, expect, it } from "vitest";

import {
  STUCK_TURN_THRESHOLD_MS,
  isTurnStuck,
  stuckTurnCutoffIso,
} from "@/lib/chat/stuck-turns";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("isTurnStuck", () => {
  it("flags an active turn whose last activity is past the threshold", () => {
    expect(
      isTurnStuck({ status: "streaming", updated_at: ago(STUCK_TURN_THRESHOLD_MS + 1_000) }, NOW),
    ).toBe(true);
    expect(
      isTurnStuck({ status: "pending", updated_at: ago(STUCK_TURN_THRESHOLD_MS + 1_000) }, NOW),
    ).toBe(true);
  });

  it("does not flag a recently active turn", () => {
    expect(
      isTurnStuck({ status: "streaming", updated_at: ago(30_000) }, NOW),
    ).toBe(false);
  });

  it("never flags a terminal turn regardless of age", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(isTurnStuck({ status, updated_at: ago(60 * 60_000) }, NOW)).toBe(false);
    }
  });

  it("falls back to started_at then created_at for last activity", () => {
    expect(
      isTurnStuck({ status: "streaming", started_at: ago(STUCK_TURN_THRESHOLD_MS + 5_000) }, NOW),
    ).toBe(true);
    expect(
      isTurnStuck({ status: "streaming", created_at: ago(10_000) }, NOW),
    ).toBe(false);
  });

  it("treats a turn with no usable timestamp as not stuck", () => {
    expect(isTurnStuck({ status: "streaming" }, NOW)).toBe(false);
    expect(isTurnStuck({ status: "streaming", updated_at: "not-a-date" }, NOW)).toBe(false);
  });

  it("computes a cutoff exactly one threshold before now", () => {
    expect(stuckTurnCutoffIso(NOW)).toBe(ago(STUCK_TURN_THRESHOLD_MS));
  });
});
