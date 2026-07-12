import { describe, expect, it } from "vitest";
import { stableComposioUserId, redactComposioUserId } from "@/lib/connectors/composio-user";
import { isDangerousComposioTool, toolkitsForIntent } from "@/lib/connectors/composio-session";

describe("stable Composio user id", () => {
  it("is exactly the Supabase user UUID", () => {
    const id = "585df16e-0b14-427e-8572-e8fd9512534e";
    expect(stableComposioUserId(id)).toBe(id);
  });

  it("rejects empty ids", () => {
    expect(() => stableComposioUserId("")).toThrow(/missing/i);
  });

  it("redacts for logs", () => {
    expect(redactComposioUserId("585df16e-0b14-427e-8572-e8fd9512534e")).toMatch(/585d…534e/);
  });
});

describe("toolkit selection", () => {
  it("loads no toolkits for greetings", () => {
    expect(toolkitsForIntent("instant", "Hi")).toEqual([]);
  });

  it("loads gmail for email send intents", () => {
    expect(
      toolkitsForIntent("action", "Send the email we prepared to this@example.com"),
    ).toContain("gmail");
  });

  it("loads calendar when asked", () => {
    expect(toolkitsForIntent("action", "Schedule a meeting on my calendar")).toContain(
      "googlecalendar",
    );
  });
});

describe("dangerous tool gating", () => {
  it("marks send/delete as dangerous and draft/fetch as safe", () => {
    expect(isDangerousComposioTool("GMAIL_SEND_EMAIL")).toBe(true);
    expect(isDangerousComposioTool("GMAIL_CREATE_EMAIL_DRAFT")).toBe(false);
    expect(isDangerousComposioTool("GMAIL_FETCH_EMAILS")).toBe(false);
  });
});
