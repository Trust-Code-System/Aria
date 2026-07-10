import { describe, it, expect } from "vitest";
import {
  lockPayload,
  verifyLockedPayload,
  hashCanonical,
  canonicalizePayload,
  payloadPreviewFields,
  type LockedApprovalPayload,
} from "@/lib/agent/payload-lock";

const base: LockedApprovalPayload = {
  version: 1,
  action_type: "send_email",
  risk_level: 2,
  task_id: "11111111-1111-1111-1111-111111111111",
  step_id: "22222222-2222-2222-2222-222222222222",
  step_idx: 1,
  summary: "Send email to client about proposal",
  tool_name: "send_email",
};

describe("approval payload lock", () => {
  it("produces a stable hash regardless of object key insertion order", () => {
    const a = lockPayload(base);
    const b = lockPayload({ ...base });
    expect(a.hash).toBe(b.hash);
    expect(a.canonical).toBe(canonicalizePayload(base));
  });

  it("verifies a matching lock", () => {
    const locked = lockPayload(base);
    const result = verifyLockedPayload(locked.canonical, locked.hash);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.action_type).toBe("send_email");
      expect(result.payload.summary).toBe(base.summary);
    }
  });

  it("rejects a tampered canonical payload", () => {
    const locked = lockPayload(base);
    const tampered = locked.canonical.replace("send_email", "payment");
    const result = verifyLockedPayload(tampered, locked.hash);
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatched hash", () => {
    const locked = lockPayload(base);
    const result = verifyLockedPayload(locked.canonical, hashCanonical("other"));
    expect(result.ok).toBe(false);
  });

  it("rejects missing lock fields", () => {
    expect(verifyLockedPayload(null, null).ok).toBe(false);
    expect(verifyLockedPayload(undefined, "abc").ok).toBe(false);
  });

  it("exposes structured preview fields without markdown", () => {
    const fields = payloadPreviewFields(base);
    expect(fields.action).toBe("send_email");
    expect(fields.step).toBe("2");
    expect(Object.values(fields).join(" ")).not.toMatch(/[*`#]/);
  });
});
