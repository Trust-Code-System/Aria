export type MessageExecutionStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface HistoryRow {
  id: string;
  role: string;
  content: string | null;
  status?: string | null;
  idempotency_key?: string | null;
}
export interface ModelHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build bounded model history from durable rows. Failed/cancelled/blank turns
 * are deliberately excluded so a new greeting cannot continue a failed action.
 */
export function buildModelHistory(
  rows: HistoryRow[],
  opts: { limit: number },
): ModelHistoryMessage[] {
  const seen = new Set<string>();
  const usable: ModelHistoryMessage[] = [];

  for (const row of rows) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    if ((row.status ?? "completed") !== "completed") continue;
    const content = String(row.content ?? "").trim();
    if (!content) continue;

    const key = row.idempotency_key
      ? `${row.idempotency_key}:${row.role}`
      : `id:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    usable.push({ role: row.role, content });
  }

  return usable.slice(-Math.max(1, opts.limit));
}

export interface TerminalError {
  status: "failed" | "cancelled";
  code:
    | "model_quota_exhausted"
    | "model_unavailable"
    | "model_tool_incompatible"
    | "request_timed_out"
    | "network_interrupted"
    | "cancelled"
    | "provider_execution_failed";
  userMessage: string;
}

/** Map internal/provider failures to stable, safe UI categories. */
export function classifyTerminalError(error: unknown, requestAborted: boolean): TerminalError {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const aborted =
    requestAborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    /abort(ed)?|cancelled/i.test(message);

  if (aborted) {
    return {
      status: "cancelled",
      code: "cancelled",
      userMessage: "The response was cancelled. No external action was completed. Nothing was sent.",
    };
  }
  if (/429|quota|billing|rate.?limit/i.test(message)) {
    return {
      status: "failed",
      code: "model_quota_exhausted",
      userMessage:
        "The configured AI providers are currently out of quota. No external action was completed. Nothing was sent.",
    };
  }
  if (/timeout|timed out|deadline/i.test(message)) {
    return {
      status: "failed",
      code: "request_timed_out",
      userMessage: "The response timed out. No external action was completed. Nothing was sent.",
    };
  }
  if (/tool|function|schema|does not support/i.test(message)) {
    return {
      status: "failed",
      code: "model_tool_incompatible",
      userMessage:
        "The available model could not use the required connected-app tool. No external action was completed. Nothing was sent.",
    };
  }
  if (/network|fetch failed|connection|socket/i.test(message)) {
    return {
      status: "failed",
      code: "network_interrupted",
      userMessage: "The network connection was interrupted. No external action was completed. Nothing was sent.",
    };
  }
  if (/model|not found|unavailable|api key|unauthorized/i.test(message)) {
    return {
      status: "failed",
      code: "model_unavailable",
      userMessage:
        "No compatible configured AI model could complete this request. No external action was completed. Nothing was sent.",
    };
  }
  return {
    status: "failed",
    code: "provider_execution_failed",
    userMessage:
      "Aria could not complete this response. No external action was completed. Nothing was sent.",
  };
}
