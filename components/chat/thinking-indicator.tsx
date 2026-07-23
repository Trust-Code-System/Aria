"use client";

import { ThinkingOrb } from "thinking-orbs";

import {
  thinkingPresentation,
  type ThinkingMode,
} from "@/lib/chat/thinking-indicator";

export function ThinkingIndicator({
  turnId,
  mode,
}: {
  turnId: string;
  mode: ThinkingMode;
}) {
  const presentation = thinkingPresentation(mode);

  return (
    <div
      className="flex h-6 items-center gap-2 text-xs font-medium text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-label={`Aria is ${presentation.label.toLowerCase()}`}
      data-testid="thinking-indicator"
      data-turn-id={turnId}
    >
      <span className="shrink-0 opacity-80" aria-hidden="true">
        <ThinkingOrb
          state={presentation.state}
          size={20}
          theme="auto"
          speed={0.82}
          role="presentation"
          aria-hidden="true"
        />
      </span>
      <span>{presentation.label}</span>
    </div>
  );
}
