import { describe, expect, it } from "vitest";
import { profilePatch } from "@/lib/ai/memory-actions";
import { ESSENTIAL_TOOL_SLUGS } from "@/lib/connectors/composio-session";
import { inferCapabilitiesFromTools } from "@/lib/connectors/capabilities-shared";
import { modelCapabilities, isModelCompatible, resolveTemperature } from "@/lib/ai/providers";

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

describe("model tool-capability routing (action-turn reliability)", () => {
  it("marks modern Claude models as tool-capable", () => {
    for (const id of [
      "anthropic:claude-opus-4-8",
      "anthropic:claude-sonnet-5",
      "anthropic:claude-haiku-4-5-20251001",
      "anthropic:claude-3-5-sonnet-latest",
    ]) {
      expect(modelCapabilities(id).tools, id).toBe(true);
      expect(isModelCompatible(id, { tools: true }), id).toBe(true);
    }
  });

  it("marks Gemini as NOT tool-capable (breaks the multi-step tool loop)", () => {
    expect(modelCapabilities("google:gemini-3.5-flash").tools).toBe(false);
    expect(isModelCompatible("google:gemini-3.5-flash", { tools: true })).toBe(false);
    // Gemini stays usable for non-tool (greeting/simple) turns.
    expect(isModelCompatible("google:gemini-3.5-flash", { streaming: true })).toBe(true);
  });

  it("does NOT send temperature to Claude 4.x/5.x (they reject it and fail the turn)", () => {
    // Live regression: claude-opus-4-8 returned "temperature is deprecated for
    // this model", failing connected-app sends. Modern Claude must be temp-off.
    for (const id of [
      "anthropic:claude-opus-4-8",
      "anthropic:claude-sonnet-5",
      "anthropic:claude-haiku-4-5-20251001",
      "anthropic:claude-fable-5",
    ]) {
      expect(modelCapabilities(id).temperature, id).toBe(false);
    }
    // The older 3.x line still accepts a custom temperature.
    expect(modelCapabilities("anthropic:claude-3-5-sonnet-latest").temperature).toBe(true);
  });

  it("resolveTemperature passes the desired value only when the model accepts it, else 1", () => {
    // Custom-temperature models get the caller's value.
    expect(resolveTemperature("anthropic:claude-3-5-sonnet-latest", 0.2)).toBe(0.2);
    expect(resolveTemperature("openai:gpt-4o", 0.5)).toBe(0.5);
    // Extended-thinking models must get 1 (the SDK would otherwise force a
    // rejected 0): Claude 4.x/5.x and GPT-5/o-series.
    expect(resolveTemperature("anthropic:claude-opus-4-8", 0.2)).toBe(1);
    expect(resolveTemperature("openai:gpt-5.6", 0.5)).toBe(1);
  });
});
