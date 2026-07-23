export type ThinkingActivity = "working" | "searching" | "solving" | "composing";

export interface ThinkingPresentation {
  state: ThinkingActivity;
  label: string;
}

export type ThinkingMode =
  | "general"
  | "knowledge"
  | "research"
  | "report"
  | "improve"
  | "code";

export function thinkingPresentation(mode: ThinkingMode): ThinkingPresentation {
  switch (mode) {
    case "knowledge":
      return { state: "searching", label: "Searching knowledge" };
    case "research":
      return { state: "searching", label: "Researching" };
    case "report":
    case "improve":
      return { state: "composing", label: "Composing" };
    case "code":
      return { state: "solving", label: "Solving" };
    default:
      return { state: "working", label: "Thinking" };
  }
}

export function shouldShowThinkingIndicator(params: {
  turnId?: string | null;
  activeTurnId?: string | null;
  status?: string | null;
  hasApproval: boolean;
}): boolean {
  return Boolean(
    params.turnId &&
      params.activeTurnId === params.turnId &&
      (params.status === "pending" || params.status === "streaming") &&
      !params.hasApproval,
  );
}

export function findLatestActiveTurnId(
  messages: Array<{
    role: "user" | "assistant";
    turnId?: string | null;
    status?: string | null;
    events?: Array<{ type?: string }>;
  }>,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role === "assistant" &&
      message.turnId &&
      (message.status === "pending" || message.status === "streaming") &&
      !message.events?.some((event) => event.type === "approval")
    ) {
      return message.turnId;
    }
  }
  return null;
}
