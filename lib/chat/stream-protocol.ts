type TurnScopedEvent = { turnId: string };

export type ChatStreamEvent = TurnScopedEvent &
  (
    | { type: "turn_started"; conversationId: string; messageId: string }
    | { type: "text_delta"; delta: string }
    | {
        type: "approval";
        approvalId: string;
        toolName: string;
        summary: string;
      }
    | {
        type: "memory_saved";
        memoryId: string;
        content: string;
      }
    | {
        type: "memory_suggestion";
        memoryId: string;
        content: string;
        memoryType: string;
      }
    | {
        type: "error";
        code: string;
        message: string;
        traceId: string;
        status: "failed" | "cancelled";
      }
    | {
        type: "done";
        status: "completed" | "failed" | "cancelled";
        messageId: string;
        model?: string;
      }
  );

const encoder = new TextEncoder();

export function encodeChatStreamEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}
export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as ChatStreamEvent;
    return value &&
      typeof value === "object" &&
      typeof value.type === "string" &&
      typeof value.turnId === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
