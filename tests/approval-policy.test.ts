import { describe, it, expect } from "vitest";
import {
  gateForRiskLevel,
  resolveApprovalOutcome,
  isApprovable,
} from "@/lib/agent/approval-policy";
import type { RiskLevel } from "@/lib/agent/types";

describe("gateForRiskLevel", () => {
  it("level 0 is safe (no approval needed)", () => {
    expect(gateForRiskLevel(0)).toBe("safe");
  });
  it("levels 1–3 need approval", () => {
    for (const level of [1, 2, 3] as RiskLevel[]) {
      expect(gateForRiskLevel(level)).toBe("needs_approval");
    }
  });
  it("level 4 is blocked outright", () => {
    expect(gateForRiskLevel(4)).toBe("blocked");
  });
});

describe("resolveApprovalOutcome", () => {
  it("level 4 is blocked regardless of any approval decision", () => {
    for (const status of ["pending", "approved", "rejected", "changes_requested", null] as const) {
      expect(resolveApprovalOutcome(4, status).action).toBe("blocked");
    }
  });

  it("only an explicit approval executes", () => {
    expect(resolveApprovalOutcome(2, "approved").action).toBe("execute");
  });

  it("pending or missing approval waits", () => {
    expect(resolveApprovalOutcome(2, "pending").action).toBe("wait");
    expect(resolveApprovalOutcome(2, null).action).toBe("wait");
  });

  it("rejection cancels the task", () => {
    expect(resolveApprovalOutcome(3, "rejected").action).toBe("cancel_task");
  });

  it("changes_requested does NOT execute — it skips the step", () => {
    const outcome = resolveApprovalOutcome(2, "changes_requested");
    expect(outcome.action).toBe("skip");
  });

  it("expired approvals wait for a fresh decision, never execute", () => {
    expect(resolveApprovalOutcome(2, "expired").action).toBe("wait");
  });

  it("unknown statuses fail safe (wait, never execute)", () => {
    expect(resolveApprovalOutcome(2, "garbage" as never).action).toBe("wait");
  });
});

describe("isApprovable", () => {
  it("levels 0–3 can be approved; level 4 cannot", () => {
    expect(isApprovable(1)).toBe(true);
    expect(isApprovable(3)).toBe(true);
    expect(isApprovable(4)).toBe(false);
  });
});
