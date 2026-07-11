import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/memory/export — download every memory in the active workspace as
 * JSON. Data ownership made concrete: what Aria remembers is yours to take.
 */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("memories")
      .select("id, type, content, source, confidence, sensitivity, approval_status, project_id, created_at, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new AppError({ area: "memory", category: "internal", userMessage: "Could not export memories.", internal: error });
    }

    await logAudit({
      action: "memory.export",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "memory",
      targetId: "all",
    });

    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        workspace_id: ctx.workspaceId,
        count: data?.length ?? 0,
        memories: data ?? [],
      },
      null,
      2,
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aria-memories-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
