import { requireSessionApi } from "@/lib/auth/guards";
import { apiOk, apiError } from "@/lib/api";
import { runTask } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/agent/tasks/:id/run — plan + execute (or resume) the task. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const result = await runTask(params.id, ctx);
    return apiOk(result);
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
