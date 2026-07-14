import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";
import { isApprovable } from "@/lib/agent/approval-policy";
import { executeApprovedChatTool } from "@/lib/connectors/chat-approval";
import { editLockedMailApproval } from "@/lib/connectors/chat-approval";
import { sanitizeForLog } from "@/lib/security/sanitize";
import type { ApprovalStatus, RiskLevel, TaskStatus } from "@/lib/agent/types";

export const runtime = "nodejs";

const decideSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
});

const editSchema = z
  .object({
    to: z.string().trim().email().max(320).optional(),
    subject: z.string().trim().min(1).max(998).optional(),
    body: z.string().trim().min(1).max(100_000).optional(),
    cc: z.string().trim().max(2000).optional(),
    bcc: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), "No edits were provided.");

// decision → new approval status, and the task status it implies (if linked).
// "queued" (not "running") — nothing is executing yet; the run endpoint resumes it.
const OUTCOME: Record<string, { approval: ApprovalStatus; task?: TaskStatus }> = {
  approve: { approval: "approved", task: "queued" },
  reject: { approval: "rejected", task: "cancelled" },
  request_changes: { approval: "changes_requested", task: "queued" },
};

/** POST /api/approvals/:id — approve / reject / request changes on a gated action. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { decision } = decideSchema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: approval } = await supabase
      .from("approvals")
      .select("id, status, task_id, action_type, risk_level, tool_name, safe_metadata, expires_at")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!approval) {
      throw new AppError({ area: "approvals", category: "not_found", userMessage: "Approval not found." });
    }
    if (approval.status !== "pending") {
      throw new AppError({
        area: "approvals",
        category: "validation",
        userMessage: "This request was already decided.",
      });
    }
    if (approval.expires_at && Date.parse(approval.expires_at) <= Date.now()) {
      await supabase
        .from("approvals")
        .update({ status: "expired" })
        .eq("id", params.id)
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "pending");
      throw new AppError({
        area: "approvals",
        category: "validation",
        userMessage: "This approval expired. Ask Aria to prepare the action again.",
      });
    }
    // Level 4 actions are blocked by policy — they can be rejected, never approved.
    if (decision === "approve" && !isApprovable(approval.risk_level as RiskLevel)) {
      throw new AppError({
        area: "approvals",
        category: "validation",
        userMessage: "This action is blocked by policy (Level 4) and cannot be approved.",
      });
    }

    const outcome = OUTCOME[decision];
    const meta = approval.safe_metadata as { source?: string } | null;
    const isChatTool = !approval.task_id && meta?.source === "chat";

    let execution: { ok: boolean; result: unknown } | null = null;

    const { data: updated, error } = await supabase
      .from("approvals")
      .update({
        status: outcome.approval,
        decided_at: new Date().toISOString(),
        decided_by: ctx.userId,
      })
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error || !updated) {
      throw new AppError({
        area: "approvals",
        category: "validation",
        userMessage: "This approval was already decided in another request.",
        internal: error,
      });
    }

    // Nudge the linked task's state so the loop can resume or stop.
    if (approval.task_id && outcome.task) {
      await supabase
        .from("agent_tasks")
        .update({ status: outcome.task })
        .eq("id", approval.task_id)
        .eq("workspace_id", ctx.workspaceId);
    }

    if (decision === "approve" && isChatTool) {
      try {
        execution = await executeApprovedChatTool({
          supabase,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          approvalId: params.id,
        });
      } catch (execErr) {
        throw execErr instanceof AppError
          ? execErr
          : new AppError({
              area: "tools",
              category: "provider_error",
              userMessage:
                "Approved, but the connected app failed to complete the action. Nothing was sent. Check Connections and try again from chat.",
              internal: execErr,
            });
      }
    }

    await logAudit({
      action: "approval.decide",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "approval",
      targetId: params.id,
      metadata: {
        decision,
        action_type: approval.action_type,
        executed: Boolean(execution?.ok),
      },
    });

    return apiOk({ approval: updated, execution });
  } catch (error) {
    return apiError(error, {
      area: "approvals",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
    });
  }
}

/** GET /api/approvals/:id — safe inline-card details and stored receipt. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data: approval } = await supabase
      .from("approvals")
      .select(
        "id, status, action_type, risk_level, summary, tool_name, safe_metadata, payload_hash, created_at, expires_at, execution_started_at, completed_at",
      )
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!approval) {
      throw new AppError({ area: "approvals", category: "not_found", userMessage: "Approval not found." });
    }
    const { data: receipt } = await supabase
      .from("action_receipts")
      .select("provider, action_type, destination, subject, provider_reference, status, error_message, started_at, completed_at")
      .eq("approval_id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    return apiOk({ approval, receipt });
  } catch (error) {
    return apiError(error, { area: "approvals", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** PATCH /api/approvals/:id — edit and re-lock a pending chat email. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const edits = editSchema.parse(await req.json());
    const supabase = createServerSupabase();
    const { data: approval } = await supabase
      .from("approvals")
      .select("id, status, payload_canonical, payload_hash, safe_metadata, expires_at")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!approval) {
      throw new AppError({ area: "approvals", category: "not_found", userMessage: "Approval not found." });
    }
    if (approval.status !== "pending") {
      throw new AppError({ area: "approvals", category: "validation", userMessage: "Only pending approvals can be edited." });
    }
    if (approval.expires_at && Date.parse(approval.expires_at) <= Date.now()) {
      throw new AppError({ area: "approvals", category: "validation", userMessage: "This approval expired. Prepare a new action." });
    }
    const relocked = editLockedMailApproval(
      approval.payload_canonical,
      approval.payload_hash,
      edits,
    );
    if (!relocked.ok) {
      throw new AppError({ area: "approvals", category: "validation", userMessage: relocked.reason });
    }
    const previous =
      approval.safe_metadata && typeof approval.safe_metadata === "object"
        ? (approval.safe_metadata as Record<string, unknown>)
        : {};
    const { data: updated, error } = await supabase
      .from("approvals")
      .update({
        payload_canonical: relocked.canonical,
        payload_hash: relocked.hash,
        summary: `Send email to ${relocked.fields.to || "(unknown)"} — ${relocked.fields.subject || "(no subject)"}`,
        safe_metadata: {
          ...previous,
          to: relocked.fields.to || null,
          cc: relocked.fields.cc || null,
          bcc: relocked.fields.bcc || null,
          subject: relocked.fields.subject || null,
          body_preview: relocked.fields.body
            ? sanitizeForLog(relocked.fields.body.slice(0, 180))
            : null,
          edited_at: new Date().toISOString(),
        },
      })
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .select("id, status, summary, safe_metadata, payload_hash")
      .maybeSingle();
    if (error || !updated) {
      throw new AppError({
        area: "approvals",
        category: "validation",
        userMessage: "The approval changed while you were editing it. Reload and try again.",
        internal: error,
      });
    }
    await logAudit({
      action: "approval.edit",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "approval",
      targetId: params.id,
      metadata: { payload_hash: relocked.hash.slice(0, 12) },
    });
    return apiOk({ approval: updated });
  } catch (error) {
    return apiError(error, { area: "approvals", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
