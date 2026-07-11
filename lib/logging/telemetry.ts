import { randomUUID } from "node:crypto";

/**
 * Dependency-free, env-gated LLM telemetry (Langfuse ingestion API).
 *
 * Privacy posture matches the rest of Aria's logging: we send METADATA ONLY —
 * model id, mode, latency, token counts, workspace id. Never prompts, never
 * completions, never document content. Enable by setting LANGFUSE_PUBLIC_KEY +
 * LANGFUSE_SECRET_KEY (+ optional LANGFUSE_HOST, defaults to Langfuse Cloud).
 *
 * Every call is fire-and-forget: telemetry can never break or slow a request.
 */

const host = (process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com").replace(/\/$/, "");
const publicKey = (process.env.LANGFUSE_PUBLIC_KEY ?? "").trim();
const secretKey = (process.env.LANGFUSE_SECRET_KEY ?? "").trim();

export function telemetryEnabled(): boolean {
  return Boolean(publicKey && secretKey);
}

export interface GenerationEvent {
  /** e.g. "chat", "agent_step", "memory_suggest" */
  name: string;
  model: string;
  latencyMs: number;
  workspaceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/** Record one model generation (metadata only). Safe to call unconditionally. */
export function logGeneration(event: GenerationEvent): void {
  if (!telemetryEnabled()) return;

  const now = new Date();
  const start = new Date(now.getTime() - Math.max(0, event.latencyMs));
  const traceId = randomUUID();

  const batch = [
    {
      id: randomUUID(),
      type: "trace-create",
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: event.name,
        timestamp: start.toISOString(),
        metadata: { workspaceId: event.workspaceId ?? null, ...(event.metadata ?? {}) },
      },
    },
    {
      id: randomUUID(),
      type: "generation-create",
      timestamp: now.toISOString(),
      body: {
        id: randomUUID(),
        traceId,
        name: event.name,
        model: event.model,
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        usage: event.usage
          ? {
              input: event.usage.promptTokens ?? undefined,
              output: event.usage.completionTokens ?? undefined,
              total: event.usage.totalTokens ?? undefined,
            }
          : undefined,
        metadata: event.metadata ?? {},
      },
    },
  ];

  // Fire-and-forget; swallow every failure — observability must never hurt UX.
  void fetch(`${host}/api/public/ingestion`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ batch }),
  }).catch(() => {});
}
