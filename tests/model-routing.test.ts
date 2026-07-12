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
