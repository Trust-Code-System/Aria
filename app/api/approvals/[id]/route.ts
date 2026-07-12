import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";
import { isApprovable } from "@/lib/agent/approval-policy";
import { executeApprovedChatTool } from "@/lib/connectors/chat-approval";
import type { ApprovalStatus, RiskLevel, TaskStatus } from "@/lib/agent/types";

export const runtime = "nodejs";

const decideSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
});

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
      .select("id, status, task_id, action_type, risk_level, tool_name, safe_metadata")
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
      .select("*")
      .single();
    if (error) {
      throw new AppError({
        area: "approvals",
        category: "internal",
        userMessage: "Could not record your decision.",
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
