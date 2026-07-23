import { describe, expect, it } from "vitest";

import {
  findLatestActiveTurnId,
  shouldShowThinkingIndicator,
  thinkingPresentation,
} from "@/lib/chat/thinking-indicator";
import {
  encodeChatStreamEvent,
  parseChatStreamLine,
} from "@/lib/chat/stream-protocol";

describe("turn-scoped thinking indicator", () => {
  it("shows only for the matching active pending or streaming turn", () => {
    expect(
      shouldShowThinkingIndicator({
        turnId: "turn-new",
        activeTurnId: "turn-new",
        status: "pending",
        hasApproval: false,
      }),
    ).toBe(true);
    expect(
      shouldShowThinkingIndicator({
        turnId: "turn-old",
        activeTurnId: "turn-new",
        status: "streaming",
        hasApproval: false,
      }),
    ).toBe(false);
  });

  it.each(["completed", "failed", "cancelled"])(
    "hides for terminal status %s",
    (status) => {
      expect(
        shouldShowThinkingIndicator({
          turnId: "turn-1",
          activeTurnId: "turn-1",
          status,
          hasApproval: false,
        }),
      ).toBe(false);
    },
  );

  it("hides as soon as approval is required", () => {
    expect(
      shouldShowThinkingIndicator({
        turnId: "turn-1",
        activeTurnId: "turn-1",
        status: "streaming",
        hasApproval: true,
      }),
    ).toBe(false);
  });

  it("selects only the newest resumable turn to prevent duplicate loaders", () => {
    expect(
      findLatestActiveTurnId([
        { role: "assistant", turnId: "turn-old", status: "streaming" },
        { role: "assistant", turnId: "turn-new", status: "pending" },
      ]),
    ).toBe("turn-new");
  });

  it("does not resume an approval-gated turn", () => {
    expect(
      findLatestActiveTurnId([
        {
          role: "assistant",
          turnId: "turn-approval",
          status: "streaming",
          events: [{ type: "approval" }],
        },
      ]),
    ).toBeNull();
  });

  it("uses subtle task-specific orb states", () => {
    expect(thinkingPresentation("general")).toEqual({
      state: "working",
      label: "Thinking",
    });
    expect(thinkingPresentation("research").state).toBe("searching");
    expect(thinkingPresentation("code").state).toBe("solving");
    expect(thinkingPresentation("report").state).toBe("composing");
  });
});

describe("turn-scoped stream protocol", () => {
  it("round-trips the turn id", () => {
    const encoded = encodeChatStreamEvent({
      type: "text_delta",
      turnId: "turn-1",
      delta: "Hello",
    });
    expect(parseChatStreamLine(new TextDecoder().decode(encoded))).toEqual({
      type: "text_delta",
      turnId: "turn-1",
      delta: "Hello",
    });
  });

  it("rejects legacy or malformed events without a turn id", () => {
    expect(parseChatStreamLine('{"type":"text_delta","delta":"stale"}')).toBeNull();
  });
});
