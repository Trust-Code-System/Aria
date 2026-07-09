import { createAdminSupabase } from "@/lib/supabase/server";
import { configured } from "@/lib/env";
import { sanitizeForLog } from "@/lib/security/sanitize";
import { AppError, type FeatureArea, type ErrorCategory } from "@/lib/errors";
import { newTraceId } from "@/lib/utils";

/**
 * Central error logging. Writes a SANITIZED metadata record to error_logs via
 * the service role (so it works even from unauthenticated failures). Never logs
 * secrets, raw document content, or full user prompts.
 */
export interface LogErrorInput {
  area: FeatureArea;
  category?: ErrorCategory;
  provider?: string | null;
  error: unknown;
  workspaceId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  traceId?: string;
}

export async function logError(input: LogErrorInput): Promise<string> {
  const traceId = input.traceId ?? newTraceId();
  const category =
    input.category ?? (input.error instanceof AppError ? input.error.category : "internal");
  const statusCode =
    input.statusCode ??
    (input.error instanceof AppError ? input.error.statusCode : 500);

  // Prefer internal detail for the log; fall back to message. Always sanitized.
  const detail =
    input.error instanceof AppError
      ? (input.error.internal ?? input.error.message)
      : input.error;
  const sanitized = sanitizeForLog(detail);

  // Always emit to server console for local dev visibility.
  // eslint-disable-next-line no-console
  console.error(`[${input.area}] ${category} (${traceId}): ${sanitized}`);

  if (!configured.supabaseAdmin) return traceId;

  try {
    const admin = createAdminSupabase();
    await admin.from("error_logs").insert({
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
      project_id: input.projectId ?? null,
      feature_area: input.area,
      provider: input.provider ?? null,
      category,
      sanitized_message: sanitized,
      status_code: statusCode,
      latency_ms: input.latencyMs ?? null,
      trace_id: traceId,
    });
  } catch (e) {
    // Logging must never throw into the request path.
    // eslint-disable-next-line no-console
    console.error("Failed to write error_log:", sanitizeForLog(e));
  }
  return traceId;
}

export interface AuditInput {
  action: string;
  workspaceId?: string | null;
  userId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(input: AuditInput): Promise<void> {
  if (!configured.supabaseAdmin) return;
  try {
    const admin = createAdminSupabase();
    await admin.from("audit_logs").insert({
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Failed to write audit_log:", sanitizeForLog(e));
  }
}
