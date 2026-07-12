import { describe, expect, it } from "vitest";
import {
  capabilityHint,
  connectionStatusLabel,
  connectionStatusTone,
  isUsableConnectionStatus,
  mapComposioAccountStatus,
  normalizeConnectionStatus,
  persistableConnectionStatus,
} from "@/lib/connectors/status";

describe("connection status mapping", () => {
  it("does not treat empty or pending as usable", () => {
    expect(isUsableConnectionStatus(undefined)).toBe(false);
    expect(isUsableConnectionStatus("pending")).toBe(false);
    expect(isUsableConnectionStatus("expired")).toBe(false);
    expect(isUsableConnectionStatus("action_required")).toBe(false);
  });

  it("treats connected and legacy active as usable", () => {
    expect(isUsableConnectionStatus("connected")).toBe(true);
    expect(isUsableConnectionStatus("active")).toBe(true);
  });

  it("maps Composio ACTIVE to connected, not a marketing Active label", () => {
    expect(mapComposioAccountStatus("ACTIVE")).toBe("connected");
    expect(connectionStatusLabel("ACTIVE")).toBe("Connected");
    expect(connectionStatusLabel("active")).toBe("Connected");
    // Post-0013: persist canonical statuses.
    expect(persistableConnectionStatus("connected")).toBe("connected");
    expect(persistableConnectionStatus("action_required")).toBe("action_required");
    expect(persistableConnectionStatus("expired")).toBe("expired");
  });

  it("maps expired and failed provider states truthfully", () => {
    expect(mapComposioAccountStatus("EXPIRED")).toBe("expired");
    expect(mapComposioAccountStatus("FAILED")).toBe("action_required");
    expect(connectionStatusLabel("expired")).toBe("Expired");
    expect(connectionStatusLabel("error")).toBe("Action required");
    expect(connectionStatusTone("expired")).toBe("destructive");
  });

  it("normalizes legacy DB values", () => {
    expect(normalizeConnectionStatus("active")).toBe("connected");
    expect(normalizeConnectionStatus("error")).toBe("action_required");
  });

  it("does not claim send capability without capability flags", () => {
    const hint = capabilityHint("gmail", "connected", { read: true, send: false, draft: false });
    expect(hint).toMatch(/reading only|sending permission|draft and send/i);
    expect(capabilityHint("gmail", "pending")).toBeNull();
  });

  it("states full gmail capability when send is present", () => {
    expect(capabilityHint("gmail", "connected", { read: true, draft: true, send: true })).toMatch(
      /send \(send requires approval\)/i,
    );
  });
});
