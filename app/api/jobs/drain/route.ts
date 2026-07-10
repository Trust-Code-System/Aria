import { requireSessionApi } from "@/lib/auth/guards";
import { apiOk, apiError } from "@/lib/api";
import { rateLimit } from "@/lib/security/rate-limit";
import { drainPendingJobs } from "@/lib/jobs/enqueue";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/jobs/drain — process pending jobs for the caller's workspace.
 * Intended for cron / external workers when JOBS_INLINE=false (serverless).
 * Body optional: { "limit": 1..20 }.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    rateLimit("jobs", ctx.userId);

    let limit = 5;
    try {
      const body = await req.json();
      if (typeof body?.limit === "number") {
        limit = Math.min(20, Math.max(1, Math.floor(body.limit)));
      }
    } catch {
      /* default limit */
    }

    const { processed, results } = await drainPendingJobs(ctx, limit);
    return apiOk({ processed, results });
  } catch (error) {
    return apiError(error, { area: "tasks", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
