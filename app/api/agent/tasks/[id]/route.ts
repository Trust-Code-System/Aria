import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { isTerminal } from "@/lib/agent/types";
import type { TaskStatus } from "@/lib/agent/types";

export const runtime = "nodejs";

/** GET /api/agent/tasks/:id — a task with its step timeline and approvals. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();

    const { data: task } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!task) {
      throw new AppError({ area: "tasks", category: "not_found", userMessage: "Task not found." });
    }

    const [{ data: steps }, { data: approvals }] = await Promise.all([
      supabase.from("agent_task_steps").select("*").eq("task_id", params.id).order("idx", { ascending: true }),
      supabase.from("approvals").select("*").eq("task_id", params.id).order("created_at", { ascending: false }),
    ]);

    return apiOk({ task, steps: steps ?? [], approvals: approvals ?? [] });
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

const patchSchema = z.object({ action: z.literal("cancel") });

/** PATCH /api/agent/tasks/:id — currently supports cancelling a live task. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    patchSchema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: task } = await supabase
      .from("agent_tasks")
      .select("id, status")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!task) {
      throw new AppError({ area: "tasks", category: "not_found", userMessage: "Task not found." });
    }
    if (isTerminal(task.status as TaskStatus)) {
      throw new AppError({ area: "tasks", category: "validation", userMessage: "This task has already finished." });
    }

    const { data: updated, error } = await supabase
      .from("agent_tasks")
      .update({ status: "cancelled" })
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .select("*")
      .single();
    if (error) {
      throw new AppError({ area: "tasks", category: "internal", userMessage: "Could not cancel the task.", internal: error });
    }
    return apiOk({ task: updated });
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
