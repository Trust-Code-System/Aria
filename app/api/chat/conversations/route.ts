import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chat/conversations?q= — search/list this workspace's conversations. */
export async function GET(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

    const supabase = createServerSupabase();
    let query = supabase
      .from("conversations")
      .select("id, title, mode, updated_at, project_id")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (q) query = query.ilike("title", `%${q}%`);

    const { data, error } = await query;
    if (error) {
      throw new AppError({ area: "chat", category: "internal", userMessage: "Could not load conversations.", internal: error });
    }
    return apiOk({ conversations: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "chat", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** DELETE /api/chat/conversations?id= — delete one conversation (+ its messages, via FK cascade). */
export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError({ area: "chat", category: "validation", userMessage: "Missing conversation id." });

    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({ area: "chat", category: "internal", userMessage: "Could not delete the conversation.", internal: error });
    }
    await logAudit({
      action: "conversation.delete",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "conversation",
      targetId: id,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "chat", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
