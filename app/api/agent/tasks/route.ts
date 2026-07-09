import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cookies (auth) — never prerender

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional(),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  riskLevel: z.number().int().min(0).max(4).optional(),
  maxSteps: z.number().int().min(1).max(100).optional(),
});

/** GET /api/agent/tasks — list the workspace's tasks (newest first). */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      throw new AppError({ area: "tasks", category: "internal", userMessage: "Could not load your tasks.", internal: error });
    }
    return apiOk({ tasks: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** POST /api/agent/tasks — create a new agent task (starts queued). */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = createSchema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("agent_tasks")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: body.projectId ?? null,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority ?? "normal",
        risk_level: body.riskLevel ?? 0,
        max_steps: body.maxSteps ?? 25,
        status: "queued",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError({ area: "tasks", category: "internal", userMessage: "Could not create the task.", internal: error });
    }

    await logAudit({
      action: "task.create",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "agent_task",
      targetId: data.id,
      metadata: { priority: data.priority, risk_level: data.risk_level },
    });

    return apiOk({ task: data }, { status: 201 });
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
