import { describe, expect, it } from "vitest";
import {
  inferCapabilitiesFromTools,
  refineStatusAfterProbe,
  capabilitiesFromScopes,
  scopesPayloadForPersist,
} from "@/lib/connectors/capabilities";

describe("inferCapabilitiesFromTools", () => {
  it("detects gmail read/draft/send from Composio slugs", () => {
    const caps = inferCapabilitiesFromTools("gmail", [
      "GMAIL_FETCH_EMAILS",
      "GMAIL_CREATE_EMAIL_DRAFT",
      "GMAIL_SEND_EMAIL",
    ]);
    expect(caps.read).toBe(true);
    expect(caps.draft).toBe(true);
    expect(caps.send).toBe(true);
  });

  it("detects read-only gmail without send", () => {
    const caps = inferCapabilitiesFromTools("gmail", ["GMAIL_FETCH_EMAILS"]);
    expect(caps.read).toBe(true);
    expect(caps.send).toBe(false);
    expect(caps.draft).toBe(false);
  });

  it("detects calendar write tools", () => {
    const caps = inferCapabilitiesFromTools("google_calendar", [
      "GOOGLECALENDAR_FIND_EVENT",
      "GOOGLECALENDAR_CREATE_EVENT",
    ]);
    expect(caps.read).toBe(true);
    expect(caps.write).toBe(true);
  });
});

describe("refineStatusAfterProbe", () => {
  it("marks setup_incomplete when zero tools", () => {
    expect(
      refineStatusAfterProbe("connected", "gmail", {
        read: false,
        draft: false,
        send: false,
        write: false,
        probed_at: new Date().toISOString(),
        tool_count: 0,
        sample_tools: [],
        source: "composio_tools_get",
      }),
    ).toBe("setup_incomplete");
  });

  it("keeps connected when tools exist even if send is missing", () => {
    expect(
      refineStatusAfterProbe("connected", "gmail", {
        read: true,
        draft: true,
        send: false,
        write: true,
        probed_at: new Date().toISOString(),
        tool_count: 2,
        sample_tools: ["GMAIL_FETCH_EMAILS"],
        source: "composio_tools_get",
      }),
    ).toBe("connected");
  });
});

describe("scopes persistence shape", () => {
  it("round-trips capabilities through scopes jsonb", () => {
    const payload = scopesPayloadForPersist(null, {
      read: true,
      draft: true,
      send: true,
      write: true,
      probed_at: "2026-07-12T12:00:00.000Z",
      tool_count: 3,
      sample_tools: ["GMAIL_SEND_EMAIL"],
      source: "composio_tools_get",
    });
    const caps = capabilitiesFromScopes(payload);
    expect(caps?.send).toBe(true);
    expect(caps?.sample_tools).toContain("GMAIL_SEND_EMAIL");
  });
});
