import { requireSessionApi } from "@/lib/auth/guards";
import { apiOk, apiError } from "@/lib/api";
import { rateLimit } from "@/lib/security/rate-limit";
import { runTask, startTaskInBackground } from "@/lib/agent/runtime";
import { enqueueAndKick } from "@/lib/jobs/enqueue";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/agent/tasks/:id/run — plan + execute (or resume) the task.
 * Body (optional): { "background": true } → returns immediately and the task
 * runs via the jobs table; the client polls the task for live progress.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    rateLimit("taskRun", ctx.userId);

    let background = false;
    try {
      const body = await req.json();
      background = body?.background === true;
    } catch {
      /* no body → synchronous run (backwards compatible) */
    }

    if (background) {
      startTaskInBackground(params.id, ctx);
      return apiOk({ status: "running", message: "Task started — running in the background." });
    }

    // Synchronous path still records a job row for audit/resume, then waits.
    const { result } = await enqueueAndKick({
      kind: "agent_task",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      refId: params.id,
      email: ctx.email,
      isAdmin: ctx.isAdmin,
      idempotencyKey: `agent_task:${params.id}:sync:${Date.now()}`,
      wait: true,
    });
    return apiOk(result ?? (await runTask(params.id, ctx)));
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
