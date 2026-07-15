import { describe, expect, it } from "vitest";
import { profilePatch } from "@/lib/ai/memory-actions";
import { ESSENTIAL_TOOL_SLUGS } from "@/lib/connectors/composio-session";
import { inferCapabilitiesFromTools } from "@/lib/connectors/capabilities-shared";

describe("profilePatch — identity capture into the always-injected core profile", () => {
  it("captures a name from natural phrasings into display_name + preferred_name", () => {
    for (const phrase of [
      "my name is Abass Ibrahim",
      "Call me Abass Ibrahim",
      "You can call me Abass",
      "Abass Ibrahim is my name",
    ]) {
      const patch = profilePatch(phrase);
      expect(patch.display_name, phrase).toBeTruthy();
      expect(patch.preferred_name, phrase).toBe(patch.display_name);
    }
  });

  it("captures the name even when it is embedded in a longer statement", () => {
    const patch = profilePatch("my name is Abass Ibrahim and I am a software developer");
    expect(patch.display_name).toBe("Abass Ibrahim");
  });

  it("does NOT mistake a description for a name", () => {
    const patch = profilePatch("i am a software developer");
    expect(patch.display_name).toBeUndefined();
    expect(patch.preferred_name).toBeUndefined();
  });

  it("still captures company/role/signature/timezone", () => {
    expect(profilePatch("my role is Founder").role_title).toBe("Founder");
    expect(profilePatch("TrustCode is my company").company).toBe("TrustCode");
    expect(profilePatch("my timezone is Africa/Lagos").timezone).toBe("Africa/Lagos");
  });
});

describe("Gmail essential tool slugs (send-availability regression)", () => {
  it("includes a send-capable slug so chat can send email", () => {
    const gmail = ESSENTIAL_TOOL_SLUGS.gmail ?? [];
    expect(gmail.some((s) => /^GMAIL_.*(SEND|FORWARD|REPLY)/i.test(s))).toBe(true);
    // The exact regex the chat capability guard uses.
    expect(gmail.some((s) => s === "GMAIL_SEND_EMAIL")).toBe(true);
  });

  it("the essential set infers read + draft + send capabilities", () => {
    const caps = inferCapabilitiesFromTools("gmail", ESSENTIAL_TOOL_SLUGS.gmail ?? []);
    expect(caps.read).toBe(true);
    expect(caps.draft).toBe(true);
    expect(caps.send).toBe(true);
  });
});
