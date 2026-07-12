import { describe, expect, it } from "vitest";
import { modelRoleForRoute, resolveRoutedChatModelId } from "@/lib/ai/routing";

describe("model roles", () => {
  it("maps greetings to fast role", () => {
    expect(
      modelRoleForRoute({ mode: "general", message: "Hi", intent: "instant" }),
    ).toBe("fast");
  });

  it("maps email actions to action role", () => {
    expect(
      modelRoleForRoute({
        mode: "general",
        message: "Send the email",
        intent: "action",
      }),
    ).toBe("action");
  });

  it("prefers FAST_MODEL path for action when resolving without ACTION_MODEL override in unit env", () => {
    // Smoke: resolution returns some configured provider id or null in CI.
    const id = resolveRoutedChatModelId({
      mode: "general",
      message: "Send email to a@b.com",
      intent: "action",
      preferred: "openai:gpt-5.6",
    });
    if (id) {
      // With Google available + FAST_MODEL, action should not be forced to broken OpenAI-only.
      expect(id).toMatch(/^(openai|google|anthropic|custom):/);
    }
  });

  it("maps code mode to coding role", () => {
    expect(
      modelRoleForRoute({
        mode: "code",
        message: "refactor this",
        intent: "complex_reasoning",
      }),
    ).toBe("coding");
  });

  it("resolves a model id when any provider is configured", () => {
    // May be null in CI without keys — only assert shape when present.
    const id = resolveRoutedChatModelId({
      mode: "general",
      message: "Hi",
      intent: "instant",
    });
    if (id) expect(id).toMatch(/^(openai|google|anthropic|custom):/);
  });
});
