/**
 * Durable job enqueue + local kick.
 *
 * Writes a row to `jobs` so work survives process restarts and can be drained
 * by `/api/jobs/drain` (cron) or Trigger.dev later. When `env.jobsInline` is
 * true (default), we also kick processing in-process after enqueue so local
 * and single-node deploys stay responsive.
 *
 * Idempotency: pass `idempotencyKey` to avoid duplicate pending jobs for the
 * same logical unit of work (e.g. ingest of the same document).
 */
import type { SessionContext } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/ingestion/pipeline";
import { logError } from "@/lib/logging/error-log";
import { AppError } from "@/lib/errors";

export type JobKind = "ingest" | "agent_task";

export interface EnqueueInput {
  kind: JobKind;
  workspaceId: string;
  userId: string;
  refId: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  /** When true, wait for the job to finish (inline path only). */
  wait?: boolean;
  /** Optional session fields for the worker context. */
  email?: string | null;
  isAdmin?: boolean;
}

export interface JobResult {
  status: string;
  chunkCount?: number;
  message?: string;
}

function toCtx(input: EnqueueInput | SessionContext): SessionContext {
  if ("workspaceId" in input && "userId" in input && "isAdmin" in input && "email" in input) {
    return input as SessionContext;
  }
  const e = input as EnqueueInput;
  return {
    userId: e.userId,
    workspaceId: e.workspaceId,
    email: e.email ?? null,
    isAdmin: e.isAdmin ?? false,
  };
}

export async function enqueueJob(input: EnqueueInput): Promise<{ jobId: string }> {
  const supabase = createServerSupabase();

  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("workspace_id", input.workspaceId)
      .eq("idempotency_key", input.idempotencyKey)
      .in("status", ["pending", "processing"])
      .maybeSingle();
    if (existing?.id) return { jobId: existing.id };
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      kind: input.kind,
      status: "pending",
      ref_id: input.refId,
      payload: input.payload ?? {},
      idempotency_key: input.idempotencyKey ?? null,
      attempts: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new AppError({
      area: "tasks",
      category: "internal",
      userMessage: "Could not queue background work.",
      internal: error,
    });
  }
  return { jobId: data.id };
}

/**
 * Enqueue, optionally kick inline, optionally wait for completion.
 * Returns the job id and (when wait+inline) the worker result.
 */
export async function enqueueAndKick(
  input: EnqueueInput,
): Promise<{ jobId: string; result?: JobResult }> {
  const { jobId } = await enqueueJob(input);
  const ctx = toCtx(input);

  if (!env.jobsInline) {
    return { jobId };
  }

  if (input.wait) {
    const result = await processJob(jobId, ctx);
    return { jobId, result };
  }

  kickJobInBackground(jobId, ctx);
  return { jobId };
}

/** Fire-and-forget kick that still records failures on the job row. */
export function kickJobInBackground(jobId: string, ctx: SessionContext): void {
  void processJob(jobId, ctx).catch(async (err) => {
    await logError({ area: "tasks", error: err, workspaceId: ctx.workspaceId, userId: ctx.userId });
  });
}

function mapJobRowStatus(resultStatus: string): "completed" | "failed" {
  // waiting_for_approval / cancelled / completed are successful job outcomes
  // (the agent task itself may still be open — that lives on agent_tasks).
  if (resultStatus === "failed") return "failed";
  return "completed";
}

/**
 * Process a single job. Idempotent for completed rows.
 * Claim via status transition pending|failed → processing.
 */
export async function processJob(jobId: string, ctx: SessionContext): Promise<JobResult> {
  const supabase = createServerSupabase();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!job) {
    throw new AppError({ area: "tasks", category: "not_found", userMessage: "Job not found." });
  }
  if (job.status === "completed") {
    return { status: "completed", message: "Already completed." };
  }
  if (job.status === "failed" && (job.attempts ?? 0) >= 3) {
    return { status: "failed", message: job.error_message ?? "Job failed." };
  }
  if (job.status === "processing") {
    return { status: "processing", message: "Job is already running." };
  }

  const { data: claimed } = await supabase
    .from("jobs")
    .update({
      status: "processing",
      attempts: (job.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { status: "processing", message: "Job was claimed by another worker." };
  }

  try {
    let result: JobResult;
    if (job.kind === "ingest") {
      const rawProject = (job.payload as Record<string, unknown> | null)?.projectId;
      const projectId =
        typeof rawProject === "string" ? rawProject : rawProject === null ? null : null;
      const r = await ingestDocument({
        documentId: job.ref_id,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        projectId,
      });
      result = { status: r.status, chunkCount: r.chunkCount, message: r.message };
      // ingestDocument returns status like "completed" | "failed"
      await supabase
        .from("jobs")
        .update({
          status: r.status === "failed" ? "failed" : "completed",
          error_message: r.status === "failed" ? (r.message ?? "failed").slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return result;
    }

    if (job.kind === "agent_task") {
      // Dynamic import avoids a circular dependency with lib/agent/runtime.ts.
      const { runTask } = await import("@/lib/agent/runtime");
      const r = await runTask(job.ref_id, ctx);
      result = { status: r.status, message: r.message };
      await supabase
        .from("jobs")
        .update({
          status: mapJobRowStatus(r.status),
          error_message: r.status === "failed" ? (r.message ?? "failed").slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return result;
    }

    throw new AppError({
      area: "tasks",
      category: "validation",
      userMessage: "Unknown job type.",
    });
  } catch (err) {
    const message = err instanceof AppError ? err.userMessage : "Background job failed.";
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await logError({ area: "tasks", error: err, workspaceId: ctx.workspaceId, userId: ctx.userId });
    throw err;
  }
}

/** Drain up to `limit` pending jobs for a workspace. */
export async function drainPendingJobs(
  ctx: SessionContext,
  limit = 5,
): Promise<{ processed: number; results: JobResult[] }> {
  const supabase = createServerSupabase();
  const { data: pending } = await supabase
    .from("jobs")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  const results: JobResult[] = [];
  for (const row of pending ?? []) {
    results.push(await processJob(row.id, ctx));
  }
  return { processed: results.length, results };
}
